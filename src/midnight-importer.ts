import { subscribe, getBlockData } from './midnight-indexer';
import { withPgClient } from './database';
import type { ApiPromise } from '@polkadot/api';
import type { Header } from '@polkadot/types/interfaces';
import { PoolClient } from 'pg';
import { Block, Extrinsic } from 'types/chain';



/**
 * Midnightインデックスを開始します。
 */
export async function startMidnightIndex(): Promise<void> {
    subscribe(async (header: Header, api: ApiPromise) => {
        
        console.log(`🔍 New block ${header.number.toNumber()}`);

        importNewBlock(header);

    }, async (header: Header, api: ApiPromise) => {

        console.log(`🔍 Finalized block ${header.number.toNumber()}`);

        importFinalizedBlock(header);
    });
}


/**
 * 新しいブロックをインポートします。
 * @param header 新しいブロックヘッダー
 */
async function importNewBlock(header: Header): Promise<void> {
    const data = await getBlockData(header);

    await withPgClient(async (client) => {
        await client.query('BEGIN');

        try {
            await insertBlock(client, data);

            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
    });
}

/**
 * ファイナライズされたブロックをインポートします。
 * @param header ファイナライズされたブロックヘッダー
 */
async function importFinalizedBlock(header: Header): Promise<void> {
    const data = await getBlockData(header);

    await withPgClient(async (client) => {
        await client.query('BEGIN');

        try {
            await updateFinalizedBlock(client, data);

            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
    });
}

/**
 * ブロックをインポートします。
 * @param client データベースクライアント
 * @param data ブロックデータ
 */
async function insertBlock(client: PoolClient, data: Block): Promise<void> {

    await client.query(`
        INSERT INTO blocks
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
                raw = EXCLUDED.raw
    `, [
        data.hash,
        data.height,
        data.parentHash,
        data.height,
        toDate(data.timestamp),
        data.extrinsics.length,
        data.stateRoot,
        data.isFinalized,
        data.raw
    ])

    await insertExtrinsics(client, data.extrinsics);
}

/**
 * トランザクションをインポートします。
 * @param client データベースクライアント
 * @param extrinsics トランザクション
 * @returns トランザクションID
 */
async function insertExtrinsics(client: PoolClient, extrinsics: Extrinsic[]): Promise<number[]> {

    const extrinsicIds: Array<number> = [];

    for (let i = 0; i < extrinsics.length; i++) {
        const extrinsic = extrinsics[i];
        if (!extrinsic) continue;

        const extrinsicResult = await client.query(`
            INSERT INTO extrinsics
                (block_id, index_in_block, section, method, signer, args, raw, hash)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (block_id, index_in_block) DO UPDATE SET
                    section = EXCLUDED.section,
                    method = EXCLUDED.method,
                    signer = EXCLUDED.signer,
                    args = EXCLUDED.args,
                    raw = EXCLUDED.raw,
                    hash = EXCLUDED.hash
                RETURNING id
        `, [
            extrinsic.index,
            extrinsic.indexInBlock,
            extrinsic.section,
            extrinsic.method,
            extrinsic.signer,
            extrinsic.method.args,
            extrinsic.data,
            extrinsic.hash
        ]);

        const extrinsicId = extrinsicResult.rows[0]?.id;
        if (extrinsicId) {
            extrinsicIds.push(i, extrinsicId);
        }
    }

    return extrinsicIds;
}


/**
 * ファイナライズされたブロックを更新します。
 * @param client データベースクライアント
 * @param data ブロックデータ
 */
async function updateFinalizedBlock(client: PoolClient, data: Block)
    : Promise<void> {

    await client.query(`
        UPDATE blocks
            SET is_finalized = TRUE
            WHERE hash = $1 AND is_finalized = FALSE
    `, [
        data.hash
    ]);

}


/**
 * timestampをDateに変換
 * @param timestamp Unix timestamp (ミリ秒単位)
 * @returns Dateオブジェクト（UTC）
 */
function toDate(timestamp: number): Date {
    const dt = new Date(timestamp);
    if (isNaN(dt.getTime()) || dt.getFullYear() < 2025 || dt.getFullYear() > 2026) {
        return new Date(timestamp * 1000);
    }
    if (dt.getMilliseconds() !== 0) {
        dt.setMilliseconds(0);
    }
    return dt;
}
