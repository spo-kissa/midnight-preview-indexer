// src/indexer.ts

import 'dotenv/config';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { Header, SignedBlock } from '@polkadot/types/interfaces';
import { EventRecord } from '@polkadot/types/interfaces/system';
import { Pool, PoolClient } from 'pg';

const WS_ENDPOINT = process.env.MIDNIGHT_WS_ENDPOINT || 'wss://rpc.preview.midnight.network';

const pool = new Pool({
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT || 5432),
  database: process.env.PG_DB,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
});

async function main() {
  console.log(`[indexer] connecting to Midnight RPC: ${WS_ENDPOINT}`);
  const provider = new WsProvider(WS_ENDPOINT);
  const api = await ApiPromise.create({ provider });

  console.log('[indexer] connected. Chain:', (await api.rpc.system.chain()).toString());

  // 必要なら search_path を設定
  await initDb();

  // 新しいヘッダを購読 (Substrate 標準)
  await api.rpc.chain.subscribeNewHeads(async (header: Header) => {
    try {
      await handleNewHead(api, header);
    } catch (err) {
      console.error('[indexer] error handling new head', err);
    }
  });
}

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO midnight_explorer, public`);
  } finally {
    client.release();
  }
}

// 新しいブロックヘッダを受け取ったときに呼ばれるハンドラ
async function handleNewHead(api: ApiPromise, header: Header) {
  const blockNumber = header.number.toBigInt();
  const hash = header.hash.toHex();

  console.log(`[indexer] new block #${blockNumber} (${hash})`);

  // フルブロック取得
  const signedBlock = (await api.rpc.chain.getBlock(hash)) as SignedBlock;
  const block = signedBlock.block;

  // イベント取得 (Substrate スタイル)
  const events = (await api.query.system.events.at(hash)) as unknown as EventRecord[];

  const parentHash = block.header.parentHash.toHex();
  const stateRoot = block.header.stateRoot.toHex();
  const extrinsics = block.extrinsics;

  const timestamp = await extractTimestamp(api, blockNumber, hash, extrinsics, events);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) blocks に INSERT
    const blockId = await insertBlock(client, {
      hash,
      height: blockNumber,
      parentHash,
      slot: Number(blockNumber), // Midnight 専用なら slot へ適切にマッピング
      timestamp,
      txCount: extrinsics.length,
      stateRoot,
      isFinalized: false, // finalized の判定は後続ロジックで更新
      raw: {
        header: block.header.toHuman(),
      },
    });

    // 2) extrinsics / transactions / events を保存
    await insertExtrinsicsAndTransactions(client, blockId, hash, timestamp, extrinsics, events);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[indexer] DB error processing block', err);
  } finally {
    client.release();
  }
}

// timestamp 取得: 通常は timestamp.set などの extrinsic / event を見る
async function extractTimestamp(
  api: ApiPromise,
  blockNumber: bigint,
  blockHash: string,
  extrinsics: any[],
  events: EventRecord[]
): Promise<Date> {
  // 1. 通常の Substrate チェーン同様、timestamp パレットがあればそこから取得
  try {
    const timestamp = await api.at(blockHash);
    const ts = timestamp.query.timestamp.now;
    // const ts = await api.query.timestamp?.now.at(blockHash);
    return new Date(timestamp.toString());
  } catch {
    // timestamp pallet が無い or エラー → fallback
  }

  // 2. fallback: 現在時刻（あくまで雛形）
  console.warn(
    `[indexer] timestamp pallet not available for block ${blockNumber}, using current time as fallback`
  );
  return new Date();
}

// blocks への INSERT
async function insertBlock(
  client: PoolClient,
  params: {
    hash: string;
    height: bigint;
    parentHash: string;
    slot: number;
    timestamp: Date;
    txCount: number;
    stateRoot: string;
    isFinalized: boolean;
    raw: any;
  }
): Promise<number> {
  const res = await client.query(
    `
    INSERT INTO blocks (
      hash, height, parent_hash, slot, timestamp,
      tx_count, state_root, is_finalized, raw
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9
    )
    ON CONFLICT (hash) DO UPDATE SET
      height = EXCLUDED.height,
      parent_hash = EXCLUDED.parent_hash,
      slot = EXCLUDED.slot,
      timestamp = EXCLUDED.timestamp,
      tx_count = EXCLUDED.tx_count,
      state_root = EXCLUDED.state_root,
      is_finalized = EXCLUDED.is_finalized,
      raw = EXCLUDED.raw
    RETURNING id;
  `,
    [
      params.hash,
      params.height.toString(), // BIGINT
      params.parentHash,
      params.slot,
      params.timestamp,
      params.txCount,
      params.stateRoot,
      params.isFinalized,
      params.raw,
    ]
  );

  return res.rows[0].id as number;
}

// Extrinsic / Events → transactions / extrinsics / events への保存
async function insertExtrinsicsAndTransactions(
  client: PoolClient,
  blockId: number,
  blockHash: string,
  timestamp: Date,
  extrinsics: any[],
  events: EventRecord[]
) {
  for (let index = 0; index < extrinsics.length; index++) {
    const ex = extrinsics[index];

    // Substrate の SignedExtrinsic
    const method = ex.method;
    const signer = ex.signer?.toString?.() || null;
    const section = method.section;
    const name = method.method;

    // 1) extrinsics テーブルに INSERT
    const extrinsicRes = await client.query(
      `
      INSERT INTO extrinsics (
        block_id, index_in_block, section, method, signer, args, raw
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7
      )
      ON CONFLICT (block_id, index_in_block) DO UPDATE SET
        section = EXCLUDED.section,
        method = EXCLUDED.method,
        signer = EXCLUDED.signer,
        args = EXCLUDED.args,
        raw = EXCLUDED.raw
      RETURNING id;
    `,
      [
        blockId,
        index,
        section,
        name,
        signer,
        method.args.toJSON(),
        ex.toJSON(),
      ]
    );

    const extrinsicId = extrinsicRes.rows[0].id as number;

    // 2) 該当 extrinsic に紐づく Event を events テーブルに INSERT
    const relatedEvents = events.filter((er) => er.phase.isApplyExtrinsic && er.phase.asApplyExtrinsic.eq(index));

    for (const [evIndex, ev] of relatedEvents.entries()) {
      const { event } = ev;
      const evSection = event.section;
      const evMethod = event.method;
      const data = event.data.toJSON();

      await client.query(
        `
        INSERT INTO events (
          block_id, extrinsic_id, index_in_block, section, method, data, topics
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7
        )
        ON CONFLICT (block_id, index_in_block) DO UPDATE SET
          extrinsic_id = EXCLUDED.extrinsic_id,
          section = EXCLUDED.section,
          method = EXCLUDED.method,
          data = EXCLUDED.data,
          topics = EXCLUDED.topics;
      `,
        [
          blockId,
          extrinsicId,
          evIndex, // block 内 index は適宜定義。ここでは「この extrinsic 内 index」にしているので用途に応じて調整。
          evSection,
          evMethod,
          data,
          null, // Midnight の topics 構造を把握したら埋める
        ]
      );
    }

    // 3) 「これは Tx として扱うか？」を判定して transactions に入れる
    if (isTransactionLike(section, name)) {
      await insertTransactionFromExtrinsic({
        client,
        blockId,
        timestamp,
        extrinsicIndex: index,
        extrinsic: ex,
        extrinsicEvents: relatedEvents,
      });
    }
  }
}

// 「Tx として扱うべき extrinsic か？」の簡易判定
function isTransactionLike(section: string, method: string): boolean {
  // ここは Midnight の実際の pallets / calls に合わせて調整する
  // 例: balances.transfer, midnightTx.submit など
  const key = `${section}.${method}`;
  const txLikePrefixes = ['balances.', 'assets.', 'midnightTx.', 'compact.'];

  return txLikePrefixes.some((p) => key.startsWith(p));
}

// extrinsic → transactions テーブルへの保存 (簡易版)
async function insertTransactionFromExtrinsic(params: {
  client: PoolClient;
  blockId: number;
  timestamp: Date;
  extrinsicIndex: number;
  extrinsic: any;
  extrinsicEvents: EventRecord[];
}) {
  const { client, blockId, timestamp, extrinsicIndex, extrinsic, extrinsicEvents } = params;
  const hash = extrinsic.hash.toHex();

  // fee / total_input / total_output の計算は Midnight の仕様に依存 → TODO
  const fee = null;
  const totalInput = null;
  const totalOutput = null;

  const res = await client.query(
    `
    INSERT INTO transactions (
      hash, block_id, index_in_block, timestamp,
      is_shielded, fee, total_input, total_output,
      status, raw
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, $8,
      $9, $10
    )
    ON CONFLICT (hash) DO UPDATE SET
      block_id = EXCLUDED.block_id,
      index_in_block = EXCLUDED.index_in_block,
      timestamp = EXCLUDED.timestamp,
      is_shielded = EXCLUDED.is_shielded,
      fee = EXCLUDED.fee,
      total_input = EXCLUDED.total_input,
      total_output = EXCLUDED.total_output,
      status = EXCLUDED.status,
      raw = EXCLUDED.raw
    RETURNING id;
  `,
    [
      hash,
      blockId,
      extrinsicIndex,
      timestamp,
      false, // TODO: shielded 判定は events / method から
      fee,
      totalInput,
      totalOutput,
      1, // committed
      {
        extrinsic: extrinsic.toJSON(),
        events: extrinsicEvents.map((e) => e.toJSON()),
      },
    ]
  );

  const txId = res.rows[0].id as number;

  // ここで tx_inputs / tx_outputs / accounts / account_tx / shielded_notes を更新していく
  // Midnight のイベント仕様に依存するので、ここから先は TODO 用フックとして用意:

  await handleTxSideEffects({
    client,
    txId,
    extrinsic,
    extrinsicEvents,
  });
}

// Tx に紐づく outputs/inputs/accounts/shielded_notes を更新するためのフック
async function handleTxSideEffects(params: {
  client: PoolClient;
  txId: number;
  extrinsic: any;
  extrinsicEvents: EventRecord[];
}) {
  const { client, txId, extrinsic, extrinsicEvents } = params;

  // TODO:
  // - events から「誰から誰へいくら送ったか」を解析
  // - tx_outputs / tx_inputs を INSERT
  // - accounts / account_tx / account_balances / shielded_notes を更新
  //
  // Midnight なら、例えば:
  // - balances.Transfer イベント
  // - midnight-specific の shielded transfer イベント
  //
  // などをパースして埋める。
  //
  // ここはチェーン仕様が固まってから実装していく想定なので、雛形では空のまま。
}

main().catch((err) => {
  console.error('[indexer] fatal error', err);
  process.exit(1);
});
