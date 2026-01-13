
import { Pool, type PoolClient, type PoolConfig } from "pg";
import { Block, Extrinsic } from "types/chain";

export interface Event {
  blockId: number;
  extrinsicId: number | null;
  indexInBlock: number;
  section: string;
  method: string;
  data: any;
  topics?: any[] | null;
}

type NumericEnv = string | undefined;

let pool: Pool | null = null;

function parseNumber(value: NumericEnv, name: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);

  if (!Number.isFinite(parsed)) {
    throw new Error(`環境変数 ${name} の値 '${value}' は数値として解釈できません。`);
  }

  return parsed;
}

function resolveSslConfig(): PoolConfig["ssl"] | undefined {
  const raw = (process.env.PG_SSLMODE ?? process.env.PG_SSL ?? "").toLowerCase();

  if (!raw || raw === "disable" || raw === "false" || raw === "0") {
    return undefined;
  }

  if (raw === "verify-full" || raw === "require") {
    return { rejectUnauthorized: true };
  }

  if (raw === "allow" || raw === "prefer" || raw === "true" || raw === "1") {
    return { rejectUnauthorized: false };
  }

  return { rejectUnauthorized: false };
}

function buildPoolConfig(): PoolConfig {
  const {
    PG_HOST,
    PG_PORT,
    PG_USER,
    PG_PASSWORD,
    PG_DB,
    PG_APPLICATION_NAME,
    PG_POOL_MAX,
    PG_POOL_IDLE_TIMEOUT,
    PG_POOL_CONNECTION_TIMEOUT,
  } = process.env;

  if (!PG_HOST) {
    throw new Error("環境変数 PG_HOST が設定されていません。PostgreSQL サーバーのホスト名を指定してください。");
  }

  if (!PG_USER) {
    throw new Error("環境変数 PG_USER が設定されていません。PostgreSQL 接続ユーザーを指定してください。");
  }

  if (!PG_DB) {
    throw new Error("環境変数 PG_DB が設定されていません。接続するデータベース名を指定してください。");
  }

  const config: PoolConfig = {
    host: PG_HOST,
    user: PG_USER,
    database: PG_DB,
  };

  const password = PG_PASSWORD;
  if (password && password.length > 0) {
    config.password = password;
  }

  const ssl = resolveSslConfig();
  if (ssl !== undefined) {
    config.ssl = ssl;
  }

  const applicationName = PG_APPLICATION_NAME?.trim();
  if (applicationName) {
    config.application_name = applicationName;
  }

  const port = parseNumber(PG_PORT as NumericEnv, "PG_PORT");
  if (port !== undefined) {
    config.port = port;
  }

  const max = parseNumber(PG_POOL_MAX as NumericEnv, "PG_POOL_MAX");
  if (max !== undefined) {
    config.max = max;
  }

  const idleTimeout = parseNumber(PG_POOL_IDLE_TIMEOUT as NumericEnv, "PG_POOL_IDLE_TIMEOUT");
  if (idleTimeout !== undefined) {
    config.idleTimeoutMillis = idleTimeout;
  }

  const connectionTimeout = parseNumber(
    PG_POOL_CONNECTION_TIMEOUT as NumericEnv,
    "PG_POOL_CONNECTION_TIMEOUT"
  );
  if (connectionTimeout !== undefined) {
    config.connectionTimeoutMillis = connectionTimeout;
  }

  return config;
}

export async function connectPostgres(): Promise<Pool> {
  if (pool) {
    return pool;
  }

  const config = buildPoolConfig();
  pool = new Pool(config);

  pool.on("error", (error: Error) => {
    console.error("❗ 予期しないPostgreSQL接続エラーが発生しました。", error);
  });

  try {
    await pool.query("SELECT 1");
    console.log(
      `🗄️ PostgreSQL に接続しました: ${config.host}:${config.port ?? 5432}/${config.database}`
    );
    await pool.query('SET search_path TO mn_preview_indexer');
    await pool.query('SET LOCAL search_path TO mn_preview_indexer');
  } catch (error) {
    console.error("❗ 予期しないPostgreSQL接続エラーが発生しました。", error);
    await pool.end().catch((e) => {
      console.error("❗ 予期しないPostgreSQL接続エラーが発生しました。", error);
    });
    pool = null;
    throw error;
  }

  return pool;
}

export function getPostgresPool(): Pool {
  if (!pool) {
    throw new Error("PostgreSQL プールが初期化されていません。connectPostgres() を先に呼び出してください。");
  }

  return pool;
}

export async function withPgClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const activePool = await connectPostgres();
  const client = await activePool.connect();
  client.query('SET search_path TO mn_preview_indexer');

  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

export async function closePostgresPool(): Promise<void> {
  if (!pool) {
    return;
  }

  await pool.end();
  pool = null;
}

/**
 * データベースをマイグレーションシステムを使用して初期化
 * 既存のマイグレーションをすべて適用します
 */
export async function initializeDatabase(): Promise<void> {
  // 循環依存を避けるため、動的インポートを使用
  const migrateModule = await import('./migrate');
  await migrateModule.runMigrations();
}

export async function getState(key: string): Promise<string | null> {
    const row = await pool?.query<{ value: string }>(
      `SELECT value FROM indexer_state WHERE key = $1`,
      [key]
    );
    return row?.rows[0]?.value ?? null;
}

export async function setState(key: string, value: string): Promise<void> {
    await pool?.query(
      `INSERT INTO indexer_state (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2`,
      [key, value]
    );
}

export async function insertBlock(block: Block): Promise<void> {
    await pool?.query(`INSERT INTO blocks
        (hash, height, parent_hash, slot, timestamp, tx_count, state_root, is_finalized, raw)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (height) DO UPDATE SET
          hash = EXCLUDED.hash,
          parent_hash = EXCLUDED.parent_hash,
          slot = EXCLUDED.slot,
          timestamp = EXCLUDED.timestamp,
          tx_count = EXCLUDED.tx_count,
          state_root = EXCLUDED.state_root,
          is_finalized = EXCLUDED.is_finalized,
          raw = EXCLUDED.raw`,
        [
          block.hash,
          block.height,
          block.parent_hash,
          block.height, // slotはheightと同じ値を使用（Midnightの仕様に合わせて調整可能）
          new Date(block.timestamp * 1000),
          block.extrinsics_count,
          block.state_root || null,
          false, // is_finalizedは後で更新
          block.raw || {} // blockから取得したrawデータ、なければ空オブジェクト
        ]
    );
}

export async function insertExtrinsic(extrinsic: Extrinsic & { signer?: string | null; raw?: any }): Promise<number> {
    // blocksテーブルからblock_idを取得
    const blockResult = await pool?.query<{ id: number }>(
      `SELECT id FROM blocks WHERE height = $1`,
      [extrinsic.block_height]
    );
    const blockId = blockResult?.rows[0]?.id;
    
    if (!blockId) {
      throw new Error(`Block with height ${extrinsic.block_height} not found`);
    }

    // argsが既にJSON文字列の場合はパース、そうでなければそのまま使用
    let argsJson: any;
    try {
      argsJson = typeof extrinsic.args === 'string' ? JSON.parse(extrinsic.args) : extrinsic.args;
    } catch {
      argsJson = extrinsic.args;
    }

    const result = await pool?.query<{ id: number }>(`
      INSERT INTO extrinsics
        (block_id, index_in_block, section, method, signer, args, raw)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (block_id, index_in_block) DO UPDATE SET
          section = EXCLUDED.section,
          method = EXCLUDED.method,
          signer = EXCLUDED.signer,
          args = EXCLUDED.args,
          raw = EXCLUDED.raw
        RETURNING id
    `, [
          blockId,
          extrinsic.index_in_block,
          extrinsic.section,
          extrinsic.method,
          extrinsic.signer || null,
          argsJson,
          extrinsic.raw || { 
            hash: extrinsic.hash, 
            block_hash: extrinsic.block_hash,
            data: extrinsic.data, 
            success: extrinsic.success,
            timestamp: extrinsic.timestamp
          }
        ]
    );
    
    return result?.rows[0]?.id || 0;
}

/**
 * イベントをeventsテーブルに保存
 */
export async function insertEvent(params: {
  blockId: number;
  extrinsicId: number | null;
  indexInBlock: number;
  section: string;
  method: string;
  data: any;
  topics?: any[] | null;
}): Promise<void> {
  await pool?.query(`
    INSERT INTO events (
      block_id, extrinsic_id, index_in_block, section, method, data, topics
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (block_id, index_in_block) DO UPDATE SET
      extrinsic_id = EXCLUDED.extrinsic_id,
      section = EXCLUDED.section,
      method = EXCLUDED.method,
      data = EXCLUDED.data,
      topics = EXCLUDED.topics
  `, [
    params.blockId,
    params.extrinsicId,
    params.indexInBlock,
    params.section,
    params.method,
    params.data,
    params.topics || null
  ]);
}

export async function getLastBlockNumber(): Promise<number> {
  const row = await pool?.query<{ value: number }>(
    `SELECT MAX(height) AS value FROM blocks`
  );
  return row?.rows[0]?.value ?? 0;
}
