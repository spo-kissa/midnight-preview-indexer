import { connectPostgres, withPgClient } from './database';
import type { ApiPromise } from '@polkadot/api';
import type { Error, Header } from '@polkadot/types/interfaces';
import { PoolClient } from 'pg';
import { Block, Extrinsic } from 'types/chain';
import {
    GetBlockByHeightQuery,
    RegularTransaction,
    SystemTransaction,
    UnshieldedUtxo,
    ContractCall,
    ContractBalance,
} from 'graphql/generated';
import {
    subscribe,
    getBlockData,
    toDate,
    getFinalizedBlockHeight,
    getBlockByHeight,
    TOKEN_TYPE,
    decodeFromMnAddrPreview,
    connectToChain,
    getBlockDataByHeight,
    isRegularTransaction,
    isSystemTransaction,
    isDustGenerationDtimeUpdate,
    isDustInitialUtxo,
    isDustSpendProcessed,
    isParamChange,
    isContractCall,
    isContractBalance,
    encodeToMnAddr,
} from './midnight-indexer';

// GraphQLブロックインポートのキュー（ブロック高さの配列）
const pendingGraphQLBlocks: number[] = [];


/**
 * 単一ブロックを処理します（後方互換性のため残す）。
 * @param height ブロック高さ
 */
export async function processBlock(height: number): Promise<void> {
    await processBatch([height]);
}


/**
 * インポートを開始します。
 * @param startHeight 開始ブロック高さ
 * @param batchSize バッチサイズ（デフォルト: 10）
 */
export async function startImporting(startHeight: number = 0, batchSize: number = 10):
    Promise<void> {

    const pool = await connectPostgres();
    const client = await pool.connect();
    const maxHeight = Number(await getMaxBlockHeight(client));
    client.release();
    if (startHeight < maxHeight) {
        startHeight = maxHeight + 1;
    }

    // Polkadot APIに接続
    await connectToChain();

    let height = Number(Math.min(await getFinalizedBlockHeight(), await getMaxBlockHeight(client)));

    const startTime = Date.now();
    let processedBlocks = 0;
    const progressInterval = 10; // 10ブロックごとに進捗を表示

    console.log(`🚀 インポートを開始します...`);
    console.log(`📊 総ブロック数: ${height.toLocaleString()}`);
    console.log(`📦 バッチサイズ: ${batchSize}`);

    // バッチ処理でブロックを処理
    for (let i = startHeight; i < height; i += batchSize) {
        const batchEnd = Math.min(i + batchSize, height);
        const batch = [];
        for (let j = i; j < batchEnd; j++) {
            batch.push(j);
        }

        await processBatch(batch);
        processedBlocks += batch.length;

        // 進捗を表示
        if (processedBlocks % progressInterval === 0 || processedBlocks >= height - startHeight) {
            const elapsed = (Date.now() - startTime) / 1000; // 秒
            const speed = processedBlocks / elapsed; // ブロック/秒
            const remainingBlocks = height - startHeight - processedBlocks;
            const eta = remainingBlocks / speed; // 秒

            const progressPercent = ((processedBlocks / (height - startHeight)) * 100).toFixed(2);
            const elapsedMinutes = Math.floor(elapsed / 60);
            const elapsedSeconds = Math.floor(elapsed % 60);
            const etaMinutes = Math.floor(eta / 60);
            const etaSeconds = Math.floor(eta % 60);

            console.log(
                `📈 進捗: ${processedBlocks.toLocaleString()}/${(height - startHeight).toLocaleString()} (${progressPercent}%) | ` +
                `速度: ${speed.toFixed(2)} ブロック/秒 | ` +
                `経過時間: ${elapsedMinutes}分${elapsedSeconds}秒 | ` +
                `ETA: ${etaMinutes}分${etaSeconds}秒`
            );

            height = Number(Math.min(await getFinalizedBlockHeight(), await getMaxBlockHeight(client)));
        }
    }

    const totalTime = (Date.now() - startTime) / 1000;
    const totalMinutes = Math.floor(totalTime / 60);
    const totalSeconds = Math.floor(totalTime % 60);
    const averageSpeed = processedBlocks / totalTime;

    console.log(`\n✅ インポートが完了しました！`);
    console.log(`📊 総処理時間: ${totalMinutes}分${totalSeconds}秒`);
    console.log(`⚡ 平均速度: ${averageSpeed.toFixed(2)} ブロック/秒`);

    await startMidnightIndex();
}


/**
 * バッチでブロックを処理します。
 * @param heights 処理するブロック高さの配列
 */
async function processBatch(heights: number[]): Promise<void> {
    await withPgClient(async (client) => {
        await client.query('BEGIN');

        try {
            // バッチ内のブロックデータを並列で取得
            const blockDataPromises = heights.map(height => 
                Promise.all([
                    getBlockDataByHeight(height),
                    getBlockByHeight(height)
                ]).then(([polkadotBlock, graphqlBlock]) => ({
                    height,
                    polkadotBlock,
                    graphqlBlock
                }))
            );

            const blockDataArray = await Promise.all(blockDataPromises);

            // ブロックを順次処理（データベースの整合性を保つため）
            for (const { height, polkadotBlock, graphqlBlock } of blockDataArray) {
                console.log(`🔍 Processing block ${height.toString()} ...`);
                await insertBlock(client, polkadotBlock);
                await insertGraphQLBlock(client, graphqlBlock);
            }

            await client.query('COMMIT');
            console.log(`✅ Batch processed: blocks ${heights[0]} to ${heights[heights.length - 1]} (${heights.length} blocks)`);
        }
        catch (error) {
            await client.query('ROLLBACK');
            console.error(`[midnight-importer] ❌ Error processing batch [${heights[0]} - ${heights[heights.length - 1]}]:`, error);
            throw error;
        }
    });
}


/**
 * Midnightインデックスを開始します。
 */
export async function startMidnightIndex(): Promise<void> {
    subscribe(async (header: Header) => {
        
        console.log(`🔍 New block ${header.number.toNumber()}`);

        await importNewBlock(header);

    }, async (header: Header) => {

        console.log(`🔍 Finalized block ${header.number.toNumber()}`);

        await importFinalizedBlock(header);
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
    const blockHeight = header.number.toNumber();

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

    // 現在のブロックとキュー内のブロックを処理
    const blocksToProcess = [blockHeight, ...pendingGraphQLBlocks];
    pendingGraphQLBlocks.length = 0; // キューをクリア

    for (const height of blocksToProcess) {
        try {
            const graphqlBlock = await getBlockByHeight(height);
            
            if (graphqlBlock) {
                // ブロックが存在する場合はインポート
                await withPgClient(async (client) => {
                    await client.query('BEGIN');

                    try {
                        await insertGraphQLBlock(client, graphqlBlock);
                        await client.query('COMMIT');
                        console.log(`✅ GraphQL block ${height} imported successfully`);
                    }
                    catch (error) {
                        await client.query('ROLLBACK');
                        console.error(`❌ Error importing GraphQL block ${height}:`, error);
                        throw error;
                    }
                });
            } else {
                // ブロックが存在しない場合はキューに追加
                if (!pendingGraphQLBlocks.includes(height)) {
                    pendingGraphQLBlocks.push(height);
                }
            }
        } catch (error) {
            // エラーが発生した場合もキューに追加（ネットワークエラーなど）
            if (!pendingGraphQLBlocks.includes(height)) {
                pendingGraphQLBlocks.push(height);
                console.error(`❌ Error fetching GraphQL block ${height}, queued for retry:`, error);
            }
        }
    }
}

/**
 * 
 * @param client データベースクライアント
 * @param block GraphQLから取得したブロックデータ
 */
async function insertGraphQLBlock(client: PoolClient, block: GetBlockByHeightQuery["block"])
    : Promise<void> {

    if (!block) {
        throw new Error("Block is null");
    }

    const parentHash = (block.height > 0 || block.parent) ? block.parent?.hash : '0'.repeat(64);

    const blockResult = await client.query(`
        INSERT INTO blocks
            (hash, height, parent_hash, slot, timestamp, tx_count, is_finalized, author, protocol_version, ledger_parameters, raw)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (height) DO UPDATE SET
                hash = EXCLUDED.hash,
                parent_hash = EXCLUDED.parent_hash,
                slot = EXCLUDED.slot,
                timestamp = EXCLUDED.timestamp,
                tx_count = EXCLUDED.tx_count,
                is_finalized = EXCLUDED.is_finalized,
                author = EXCLUDED.author,
                protocol_version = EXCLUDED.protocol_version,
                ledger_parameters = EXCLUDED.ledger_parameters
            RETURNING id
    `, [
        block.hash,
        block.height,
        parentHash,
        block.height,
        toDate(block.timestamp),
        block.transactions.length,
        true,
        block.author,
        block.protocolVersion,
        block.ledgerParameters,
        {}
    ]);

    const blockId = blockResult.rows[0]?.id as number | null;
    if (!blockId) {
        throw new Error("Block ID is null");
    }

    // トランザクションをインポート
    for (let i = 0; i < block.transactions.length; i++) {
        const transaction = block.transactions[i];
        await insertTransaction(client, blockId, transaction, i);
    }
}


/**
 * トランザクションをインポートします。
 * @param client データベースクライアント
 * @param blockId ブロックID
 * @param transactions トランザクション
 * @returns トランザクションID
 */
async function insertTransaction(
    client: PoolClient,
    blockId: number,
    transaction: NonNullable<GetBlockByHeightQuery["block"]>["transactions"][number],
    index: number
): Promise<void> {

    let tx = (isRegularTransaction(transaction) || isSystemTransaction(transaction))
        ? transaction as RegularTransaction | SystemTransaction : null;
    if (!tx) {
        throw new Error("Transaction is not regular or system");
    }

    let startIndex = null;
    let endIndex = null;
    let status = null;
    let paidFees = null;
    let estimatedFees = null;
    if (isRegularTransaction(tx)) {
        startIndex = tx.startIndex;
        endIndex = tx.endIndex;
        status = tx.transactionResult.status;
        paidFees = tx.fees.paidFees;
        estimatedFees = tx.fees.estimatedFees;
    }

    let totalInput = 0;
    let totalOutput = 0;
    if (tx.unshieldedSpentOutputs && tx.unshieldedSpentOutputs.length > 0) {
        for (const output of tx.unshieldedSpentOutputs) {
            if (output.tokenType === TOKEN_TYPE.NIGHT) {
                totalInput += Number(output.value);
            }
        }
    }
    if (tx.unshieldedCreatedOutputs && tx.unshieldedCreatedOutputs.length > 0) {
        for (const output of tx.unshieldedCreatedOutputs) {
            if (output.tokenType === TOKEN_TYPE.NIGHT) {
                totalOutput += Number(output.value);
            }
        }
    }

    const transactionResult = await client.query(`
        INSERT INTO transactions
            (
                hash,
                block_id,
                block_height,
                block_hash,
                index_in_block,
                timestamp,
                is_shielded,
                protocol_version,
                transaction_id,
                start_index,
                end_index,
                status,
                paid_fees,
                estimated_fees,
                unshielded_total_input,
                unshielded_total_output,
                raw,
                block_ledger_parameters,
                fee,
                total_input,
                total_output
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
            ON CONFLICT (hash) DO UPDATE SET
                block_id = EXCLUDED.block_id,
                block_height = EXCLUDED.block_height,
                block_hash = EXCLUDED.block_hash,
                index_in_block = EXCLUDED.index_in_block,
                timestamp = EXCLUDED.timestamp,
                is_shielded = EXCLUDED.is_shielded,
                protocol_version = EXCLUDED.protocol_version,
                transaction_id = EXCLUDED.transaction_id,
                start_index = EXCLUDED.start_index,
                end_index = EXCLUDED.end_index,
                status = EXCLUDED.status,
                paid_fees = EXCLUDED.paid_fees,
                estimated_fees = EXCLUDED.estimated_fees,
                unshielded_total_input = EXCLUDED.unshielded_total_input,
                unshielded_total_output = EXCLUDED.unshielded_total_output,
                raw = EXCLUDED.raw,
                block_ledger_parameters = EXCLUDED.block_ledger_parameters
            RETURNING id
    `, [
        tx.hash,
        blockId,
        tx.block.height,
        tx.block.hash,
        index,
        toDate(tx.block.timestamp),
        false, // TODO: シールドトランザクションかどうか
        tx.protocolVersion,
        tx.id,
        startIndex,
        endIndex,
        status,
        paidFees,
        estimatedFees,
        totalInput,
        totalOutput,
        tx.raw,
        tx.block.ledgerParameters,
        0,
        0,
        0,
    ]);

    const id = transactionResult.rows[0]?.id as number | null;

    if (id) {
        if (isRegularTransaction(tx)) {
            // 識別子
            await insertIdentifiers(client, tx, id);
            // トランザクション結果のセグメント
            await insertTransactionResultSegments(client, tx, id);
        }

        // アンシールド出力
        await insertUnshieldedOutputs(client, tx, id);
        await insertUnshieldedInputs(client,tx, id);
        // コントラクトアクション
        await insertContractActions(client, tx, id);
        // ZSwapレジャーイベント
        await insertZSwapLedgerEvents(client, tx, id);
        // DUSTレジャーイベント
        await insertDustLedgerEvents(client, tx, id);
    }
}


/**
 * 識別子をインポートします。
 * @param client データベースクライアント
 * @param tx 識別子を含むトランザクション
 * @param txId トランザクションID
 */
async function insertIdentifiers(client: PoolClient, tx: RegularTransaction, txId: number)
    : Promise<void> {

    let index = 0;
    for (const identifier of tx.identifiers) {
        await client.query(`
            INSERT INTO tx_identifiers
                (tx_id, tx_hash, index_in_tx, identifier)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (tx_id, index_in_tx) DO UPDATE SET
                    identifier = EXCLUDED.identifier
            `, [
                txId,
                tx.hash,
                index++,
                identifier
            ]);
    }
}


/**
 * トランザクション結果セグメントをインポートします。
 * @param client データベースクライアント
 * @param tx トランザクション結果セグメントを含むトランザクション
 * @param txId トランザクションID
 * @returns トランザクション結果セグメントのインデックス
 */
async function insertTransactionResultSegments(
    client: PoolClient,
    tx: RegularTransaction,
    txId: number
): Promise<number>
{
    if (!tx.transactionResult || !tx.transactionResult.segments || tx.transactionResult.segments.length === 0) {
        return 0;
    }

    let index = 0;
    for (const segment of tx.transactionResult.segments) {
        await client.query(`
            INSERT INTO tx_results
                (tx_id, tx_hash, segment_id, success)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (tx_id, segment_id) DO UPDATE SET
                    success = EXCLUDED.success
        `, [
            txId,
            tx.hash,
            segment.id,
            segment.success
        ]);
    }

    return index;
}

/**
 * アンシールドアドレスをインポートまたは更新します。
 * @param client データベースクライアント
 * @param unshielded_address アンシールドアドレス (HRS)
 * @param timestamp 作成日時
 * @returns アドレスID
 */
async function insertOrUpdateAddress(
    client: PoolClient,
    unshielded_address: string,
    timestamp: number
): Promise<number> {

    if (unshielded_address.startsWith('0x') || !unshielded_address.startsWith('mn_')) {
        unshielded_address = encodeToMnAddr(unshielded_address);
    }

    unshielded_address = unshielded_address.toLowerCase();

    const addressResult = await client.query(`
        INSERT INTO addresses
            (unshielded_address, unshielded_address_hex, created_at, updated_at)
            VALUES ($1, $2, $3, $3)
            ON CONFLICT (unshielded_address) DO UPDATE SET
                unshielded_address_hex = EXCLUDED.unshielded_address_hex,
                updated_at = EXCLUDED.updated_at
            RETURNING id
    `, [
        unshielded_address,
        decodeFromMnAddrPreview(unshielded_address, false),
        toDate(timestamp),
    ]);

    return addressResult.rows[0]?.id as number;
}

/**
 * アンシールド出力をインポートします。
 * @param client データベースクライアント
 * @param tx アンシールド出力を含むトランザクション
 * @param txId トランザクションID
 * @returns アンシールド出力のインデックス
 */
async function insertUnshieldedOutputs(
    client: PoolClient,
    tx: RegularTransaction | SystemTransaction,
    txId: number
): Promise<number> {

    let index = 0;
    for (const output of tx.unshieldedSpentOutputs) {

        const outputId = await insertUnshieldedOutput(
            client,
            output,
            'tx_outputs',
            tx,
            txId,
            index++
        );

    }

    return index;
}


async function insertUnshieldedInputs(
    client: PoolClient,
    tx: RegularTransaction | SystemTransaction,
    txId: number
): Promise<number> {

    let index = 0;
    for (const output of tx.unshieldedCreatedOutputs) {

        const outputId = await insertUnshieldedOutput(
            client,
            output,
            'tx_inputs',
            tx,
            txId,
            index++
        );

    }

    return index;
}


async function insertUnshieldedOutput(
    client: PoolClient,
    io: UnshieldedUtxo,
    table: 'tx_inputs' | 'tx_outputs',
    tx: RegularTransaction | SystemTransaction,
    txId: number,
    index: number
): Promise<number>
{

    if (io.owner.startsWith('0x')) {
        io.owner = encodeToMnAddr(io.owner);
    }
    io.owner = io.owner.toString().toLowerCase();

    const addressId = await insertOrUpdateAddress(
        client,
        io.owner,
        io.ctime ?? tx.block.timestamp
    );

    const inputResult = await client.query(`
        INSERT INTO ${table}
            (tx_id, index, account_addr, value, shielded, address_id, created_at_tx_hash, spent_at_tx_hash, intent_hash, ctime, initial_nonce, registered_for_dust_generation, token_type, spent_at_transaction_id, spent_at_transaction_hash, raw)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            ON CONFLICT (tx_id, index) DO UPDATE SET
                account_addr = EXCLUDED.account_addr,
                value = EXCLUDED.value,
                shielded = EXCLUDED.shielded,
                address_id = EXCLUDED.address_id,
                created_at_tx_hash = EXCLUDED.created_at_tx_hash,
                spent_at_tx_hash = EXCLUDED.spent_at_tx_hash,
                intent_hash = EXCLUDED.intent_hash,
                ctime = EXCLUDED.ctime,
                initial_nonce = EXCLUDED.initial_nonce,
                registered_for_dust_generation = EXCLUDED.registered_for_dust_generation,
                token_type = EXCLUDED.token_type,
                spent_at_transaction_id = EXCLUDED.spent_at_transaction_id,
                spent_at_transaction_hash = EXCLUDED.spent_at_transaction_hash,
                raw = EXCLUDED.raw
            RETURNING id
        `, [
            txId,
            index,
            io.owner,
            Number(io.value),
            false,
            addressId,
            io.createdAtTransaction?.hash.toString().toLowerCase(),
            io.spentAtTransaction?.hash.toString().toLowerCase(),
            io.intentHash.toString().toLowerCase(),
            toDate(io.ctime ?? 0),
            io.initialNonce.toString().toLowerCase(),
            io.registeredForDustGeneration,
            io.tokenType.toString().toLowerCase(),
            io.spentAtTransaction?.id ?? null,
            io.spentAtTransaction?.hash.toString().toLowerCase() ?? null,
            JSON.stringify(io)
        ]
    );

    return inputResult.rows[0]?.id as number;
}



async function insertContractActions(
    client: PoolClient,
    tx: RegularTransaction | SystemTransaction,
    txId: number
): Promise<void> {

    if (tx.contractActions && tx.contractActions.length > 0) {
    
        let index = 0;
        for (const action of tx.contractActions) {

            if (!isContractCall(action)) {
                continue;
            }

            const addressId = await insertOrUpdateAddress(
                client,
                action.address,
                tx.block.timestamp
            );

            const contractActionResult = await client.query(`
                INSERT INTO tx_contract_actions
                    (tx_id, index_in_tx, type_name, address, address_id, state, tx_hash, zswap_state, deploy, entry_point)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    ON CONFLICT (tx_id, index_in_tx) DO UPDATE SET
                        address_id = EXCLUDED.address_id,
                        state = EXCLUDED.state,
                        tx_hash = EXCLUDED.tx_hash,
                        zswap_state = EXCLUDED.zswap_state,
                        deploy = EXCLUDED.deploy,
                        entry_point = EXCLUDED.entry_point
                    RETURNING id
                `, [
                    txId,
                    index++,
                    action.__typename,
                    action.address,
                    addressId,
                    action.state,
                    action.transaction.hash,
                    action.zswapState,
                    action.deploy,
                    action.entryPoint
                ]
            );

            const contractActionId = contractActionResult.rows[0]?.id as number;
            if (contractActionId) {
                await insertContractActionBalances(client, action, contractActionId);
            }
        }
    }
}


async function insertContractActionBalances(client: PoolClient, action: ContractCall, contractActionId: number): Promise<void> {
    for (const balance of action.unshieldedBalances) {
        if (isContractBalance(balance)) {
            await insertContractActionBalance(client, balance, contractActionId);
        }
    }
}

async function insertContractActionBalance(client: PoolClient, balance: ContractBalance, contractActionId: number): Promise<void> {
    await client.query(`
        INSERT INTO tx_contract_action_balances
            (tx_contract_action_id, type_name, amount, token_type)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (tx_contract_action_id, type_name) DO UPDATE SET
                amount = EXCLUDED.amount,
                token_type = EXCLUDED.token_type
        `, [
            contractActionId,
            balance.__typename,
            balance.amount,
            balance.tokenType
        ]);
}


/**
 * ZSwapレジャーイベントをインポートします。
 * @param client データベースクライアント
 * @param tx ZSwapレジャーイベントを含むトランザクション
 * @param txId トランザクションID
 */
async function insertZSwapLedgerEvents(client: PoolClient, tx: RegularTransaction | SystemTransaction, txId: number)
    : Promise<void> {

    if (!tx.zswapLedgerEvents || tx.zswapLedgerEvents.length === 0) {
        return;
    }

    let index = 0;
    for (const event of tx.zswapLedgerEvents) {

        await client.query(`
            INSERT INTO tx_zswap_ledger_events
                (tx_id, index_in_tx, type_name, event_id, max_id, raw)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (tx_id, index_in_tx, event_id) DO UPDATE SET
                    type_name = EXCLUDED.type_name,
                    max_id = EXCLUDED.max_id,
                    raw = EXCLUDED.raw
        `, [
            txId,
            index++,
            event.__typename,
            event.id,
            event.maxId,
            event.raw
        ]);

    }
}


/**
 * DUSTレジャーイベントをインポートします。
 * @param client データベースクライアント
 * @param tx DUSTレジャーイベントを含むトランザクション
 * @param txId トランザクションID
 */
async function insertDustLedgerEvents(client: PoolClient, tx: RegularTransaction | SystemTransaction, txId: number)
    : Promise<void> {

    let index = 0;
    for (const event of tx.dustLedgerEvents) {

        if (isDustGenerationDtimeUpdate(event)
            || isDustInitialUtxo(event)
            || isDustSpendProcessed(event)
            || isParamChange(event)
        ) {
            const eventName = event.__typename as string | null;
            if (!eventName) {
                throw new Error("Unknown event name");
            }

            let outputNonce = isDustInitialUtxo(event)
                ? event.output?.nonce : null;

            await client.query(`
                INSERT INTO tx_dust_ledger_events
                (tx_id, index_in_tx, event_id, event_name, event_raw, output_nonce)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (tx_id, index_in_tx) DO UPDATE SET
                    event_id = EXCLUDED.event_id,
                    event_name = EXCLUDED.event_name,
                    event_raw = EXCLUDED.event_raw,
                    output_nonce = EXCLUDED.output_nonce
            `, [
                txId,
                index++,
                event.id,
                eventName,
                event.raw,
                outputNonce
            ]);
        }
        else {
            throw new Error("Unknown event type");
        }
    }

}

/**
 * ブロックをインポートします。
 * @param client データベースクライアント
 * @param data ブロックデータ
 */
async function insertBlock(client: PoolClient, data: Block): Promise<void> {

    const blockResult = await client.query(`
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
            RETURNING id
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
    ]);

    const blockId = blockResult.rows[0]?.id as number | null;
    if (!blockId) {
        throw new Error("Block ID is null");
    }

    await insertExtrinsics(client, blockId, data.extrinsics);
}


/**
 * トランザクションをインポートします。
 * @param client データベースクライアント
 * @param extrinsics トランザクション
 * @returns トランザクションID
 */
async function insertExtrinsics(client: PoolClient, blockId: number, extrinsics: Extrinsic[]): Promise<number[]> {

    const extrinsicIds: Array<number> = [];

    for (let i = 0; i < extrinsics.length; i++) {
        const extrinsic = extrinsics[i];
        if (!extrinsic) continue;

        const extrinsicResult = await client.query(`
            INSERT INTO extrinsics
                (block_id, index_in_block, section, method, signer, args, data, hash)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (block_id, index_in_block) DO UPDATE SET
                    section = EXCLUDED.section,
                    method = EXCLUDED.method,
                    signer = EXCLUDED.signer,
                    args = EXCLUDED.args,
                    data = EXCLUDED.data,
                    hash = EXCLUDED.hash
                RETURNING id
        `, [
            blockId,
            i,
            extrinsic.method.section,
            extrinsic.method.method,
            extrinsic.signer,
            { 'args': extrinsic.method.args },
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
 * 最大ブロック高さを取得します。
 * データベースが空の場合は0を返します。
 * 
 * @param client データベースクライアント
 * @returns 最大ブロック高さ
 */
async function getMaxBlockHeight(client: PoolClient): Promise<number> {
    const result = await client.query(`
        SELECT MAX(height) FROM blocks
    `);
    const maxHeight = result.rows[0]?.max as number | null;
    if (!maxHeight) {
        return 0;
    }
    return maxHeight;
}

/**
 * 最小ブロック高さを取得します。
 * データベースが空の場合は0を返します。
 * 
 * @param client データベースクライアント
 * @returns 最小ブロック高さ
 */
async function getMinBlockHeight(client: PoolClient): Promise<number> {
    const result = await client.query(`
        SELECT MIN(height) FROM blocks
    `);
    const minHeight = result.rows[0]?.min as number | null;
    if (!minHeight) {
        return 0;
    }
    return minHeight;
}

/**
 * 抜けているブロック高を検出し、そのブロック情報をインポートします。
 * @param batchSize 一度に処理するブロック数（デフォルト: 10）
 * @returns インポートされたブロック数
 */
export async function detectAndImportMissingBlocks(batchSize: number = 10): Promise<number> {
    console.log('🔍 抜けているブロック高を検出中...');

    const pool = await connectPostgres();
    const client = await pool.connect();

    try {
        // 最小と最大のブロック高を取得
        const minHeight = await getMinBlockHeight(client);
        const maxHeight = await getMaxBlockHeight(client);

        if (minHeight === 0 || maxHeight === 0) {
            console.log('⚠️ データベースにブロックが存在しません');
            return 0;
        }

        console.log(`📊 ブロック高範囲: ${minHeight} - ${maxHeight}`);

        // 抜けているブロック高を検出
        const missingHeightsResult = await client.query<{ height: number }>(`
            SELECT s.height
            FROM generate_series($1::BIGINT, $2::BIGINT) AS s(height)
            LEFT JOIN blocks b ON b.height = s.height
            WHERE b.height IS NULL
            ORDER BY s.height
        `, [minHeight, maxHeight]);

        const missingHeights = missingHeightsResult.rows.map(row => row.height);

        if (missingHeights.length === 0) {
            console.log('✅ 抜けているブロックはありません');
            return 0;
        }

        console.log(`📦 ${missingHeights.length}個の抜けているブロックを検出しました`);

        // Polkadot APIに接続（まだ接続されていない場合）
        await connectToChain();

        let importedCount = 0;
        const startTime = Date.now();

        // バッチで処理
        for (let i = 0; i < missingHeights.length; i += batchSize) {
            const batch = missingHeights.slice(i, i + batchSize);
            const batchEnd = Math.min(i + batchSize, missingHeights.length);

            console.log(`🔄 処理中: ${i + 1}/${missingHeights.length} (ブロック: ${batch[0]} - ${batch[batch.length - 1]})`);

            for (const height of batch) {
                let polkadotBlock = null;
                let graphqlBlock = null;

                try {
                    // Polkadot APIからブロックを取得
                    polkadotBlock = await getBlockDataByHeight(height);
                } catch (error) {
                    console.warn(`⚠️ ブロック ${height} のPolkadot API取得エラー:`, error);
                }

                try {
                    // GraphQLからブロックを取得（失敗しても続行）
                    graphqlBlock = await getBlockByHeight(height);
                } catch (error) {
                    console.warn(`⚠️ ブロック ${height} のGraphQL取得エラー:`, error);
                    // GraphQLの取得に失敗してもPolkadot APIのデータはインポートする
                }

                // Polkadot APIのデータが取得できた場合のみインポート
                if (polkadotBlock || graphqlBlock) {
                    try {
                        await withPgClient(async (client) => {
                            await client.query('BEGIN');

                            try {
                                // Polkadot APIから取得したブロックをインポート
                                if (polkadotBlock) {
                                    await insertBlock(client, polkadotBlock);
                                }

                                // GraphQLから取得したブロックをインポート
                                if (graphqlBlock) {
                                    await insertGraphQLBlock(client, graphqlBlock);
                                }

                                await client.query('COMMIT');
                                importedCount++;
                                console.log(`✅ ブロック ${height} をインポートしました (Polkadot: ${polkadotBlock ? '✓' : '✗'}, GraphQL: ${graphqlBlock ? '✓' : '✗'})`);
                            }
                            catch (error) {
                                await client.query('ROLLBACK');
                                console.error(`❌ ブロック ${height} のインポートエラー:`, error);
                                throw error;
                            }
                        });
                    } catch (error) {
                        console.error(`❌ ブロック ${height} のインポートエラー:`, error);
                        // エラーが発生しても次のブロックを処理し続ける
                    }
                } else {
                    console.warn(`⚠️ ブロック ${height} はPolkadot APIとGraphQLの両方から取得できませんでした`);
                }
            }

            // 進捗を表示
            const elapsed = (Date.now() - startTime) / 1000;
            const speed = importedCount / elapsed;
            const remaining = missingHeights.length - (i + batchSize);
            const eta = remaining / speed;

            console.log(
                `📈 進捗: ${Math.min(batchEnd, missingHeights.length)}/${missingHeights.length} | ` +
                `インポート済み: ${importedCount} | ` +
                `速度: ${speed.toFixed(2)} ブロック/秒 | ` +
                `ETA: ${Math.floor(eta / 60)}分${Math.floor(eta % 60)}秒`
            );
        }

        const totalTime = (Date.now() - startTime) / 1000;
        const totalMinutes = Math.floor(totalTime / 60);
        const totalSeconds = Math.floor(totalTime % 60);

        console.log(`\n✅ 抜けているブロックのインポートが完了しました！`);
        console.log(`📊 インポートされたブロック数: ${importedCount}/${missingHeights.length}`);
        console.log(`⏱️ 総処理時間: ${totalMinutes}分${totalSeconds}秒`);

        return importedCount;
    } finally {
        client.release();
    }
}
