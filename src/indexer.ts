import 'dotenv/config';
import { ApiPromise, WsProvider } from "@polkadot/api";
import type { ProviderInterface } from "@polkadot/rpc-provider/types";
import { connectPostgres, getLastBlockNumber, initializeDatabase, setState, withPgClient } from "./database";

const WS_RPC_ENDPOINT = process.env.MIDNIGHT_WS_ENDPOINT || 'wss://rpc.preview.midnight.network';
const BATCH_SIZE = 100;

let api: ApiPromise | null = null;
let isIndexing = false;

export async function connectToChain(): Promise<ApiPromise> {
    if (api && api.isConnected) return api;

    console.log('[indexer] 🔌 Connecting to Midnight RPC: ', WS_RPC_ENDPOINT);

    const provider = new WsProvider(WS_RPC_ENDPOINT);
    api = await ApiPromise.create({
        provider: provider as ProviderInterface,
        noInitWarn: false
    });

    const chain = await api.rpc.system.chain();
    const nodeName = await api.rpc.system.name();
    const nodeVersion = await api.rpc.system.version();

    console.log(`[indexer] ✅ Connected to ${chain} via ${nodeName} v${nodeVersion}`)
    
    return api;
}


export async function indexBlock(api: ApiPromise, blockNumber: number): Promise<number> {
    try {
        const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
        const signedBlock = await api.rpc.chain.getBlock(blockHash);
        const timestamp = Number(await api.query.timestamp?.now?.at(blockHash));
        
        // blockから全rawデータを取得
        const header = signedBlock.block.header;
        const stateRoot = header.stateRoot.toString();
        const block = signedBlock.block;
        
        // イベント情報も取得（可能であれば）
        let events: any = null;
        try {
            const eventsAtHash = await api.query.system.events.at(blockHash);
            if (eventsAtHash) {
                // eventsAtHashはCodec型なので、unknown経由でキャスト
                const eventsArray = (eventsAtHash as unknown) as any[];
                events = Array.isArray(eventsArray) ? eventsArray.map((ev, idx) => {
                    try {
                        return {
                            index: idx,
                            phase: ev.phase?.toHuman ? ev.phase.toHuman() : ev.phase?.toString(),
                            event: ev.event?.toHuman ? ev.event.toHuman() : ev.event?.toString(),
                            topics: ev.topics?.map ? ev.topics.map((t: any) => t.toString()) : []
                        };
                    } catch {
                        return {
                            index: idx,
                            error: 'Failed to parse event'
                        };
                    }
                }) : [];
            }
        } catch (err) {
            // イベント取得に失敗しても続行
            console.warn(`Failed to fetch events for block ${blockNumber}:`, err);
        }
        
        // 全extrinsicsの詳細情報を取得
        const extrinsicsRaw = block.extrinsics.map((extrinsic, idx) => {
            try {
                const method = extrinsic.method;
                return {
                    index: idx,
                    hash: extrinsic.hash.toString(),
                    method: {
                        section: method.section,
                        method: method.method,
                        args: method.args.map((arg: any) => {
                            try {
                                return arg.toHuman ? arg.toHuman() : arg.toString();
                            } catch {
                                return arg.toString();
                            }
                        })
                    },
                    signer: extrinsic.signer ? extrinsic.signer.toString() : null,
                    signature: extrinsic.signature ? extrinsic.signature.toString() : null,
                    era: extrinsic.era ? extrinsic.era.toHuman() : null,
                    nonce: extrinsic.nonce ? extrinsic.nonce.toString() : null,
                    tip: extrinsic.tip ? extrinsic.tip.toString() : null,
                    isSigned: extrinsic.isSigned,
                    length: extrinsic.length,
                    data: Buffer.from(extrinsic.data).toString('hex')
                };
            } catch (err) {
                // エクストリンジックのパースに失敗した場合
                return {
                    index: idx,
                    error: `Failed to parse extrinsic: ${err}`
                };
            }
        });
        
        // 全情報を含むrawオブジェクトを作成
        const rawData = {
            blockHash: blockHash.toString(),
            blockNumber: blockNumber,
            timestamp: timestamp,
            header: {
                ...header.toHuman(),
                number: header.number.toString(),
                parentHash: header.parentHash.toString(),
                stateRoot: header.stateRoot.toString(),
                extrinsicsRoot: header.extrinsicsRoot.toString(),
                digest: header.digest.toHuman(),
                // 追加のヘッダー情報
                encodedLength: header.encodedLength,
                isEmpty: header.isEmpty,
                registry: (header.registry as any).chainSS58 || null
            },
            extrinsics: extrinsicsRaw,
            extrinsicsCount: block.extrinsics.length,
            events: events,
            eventsCount: events ? events.length : null,
            justifications: signedBlock.justifications ? signedBlock.justifications.toString() : null,
            // ブロック全体のメタデータ
            encodedLength: block.encodedLength,
            isEmpty: block.isEmpty
        };
        
        // トランザクション内で全てのデータを保存
        await withPgClient(async (client) => {
            await client.query('BEGIN');
            
            try {
                // 1. Blockを保存
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
                    blockHash.toString().substring(2).toLowerCase(),
                    blockNumber,
                    header.parentHash.toString().substring(2).toLowerCase(),
                    blockNumber, // slotはheightと同じ値
                    new Date(timestamp * 1000),
                    block.extrinsics.length,
                    stateRoot.substring(2).toLowerCase(),
                    false,
                    rawData
                ]);

                // 2. Block IDを取得
                const blockResult = await client.query<{ id: number }>(
                    `SELECT id FROM blocks WHERE height = $1`,
                    [blockNumber]
                );
                const blockId = blockResult.rows[0]?.id;
                
                if (!blockId) {
                    throw new Error(`Failed to get block ID for block ${blockNumber}`);
                }

                // 3. Extrinsicsを保存
                const extrinsicIds: Map<number, number> = new Map(); // index -> extrinsic_id
                
                for (let i = 0; i < block.extrinsics.length; i++) {
                    const extrinsic = block.extrinsics[i];
            if (!extrinsic) continue;
                    
                    const method = extrinsic.method;
                    const signer = extrinsic.signer ? extrinsic.signer.toString() : null;
                    
                    // rawデータを構築（argsを含める）
                    const extrinsicRaw: any = {
                        hash: extrinsic.hash.toString(),
                        data: Buffer.from(extrinsic.data).toString('hex'),
                        signature: extrinsic.signature ? extrinsic.signature.toString() : null,
                        era: extrinsic.era ? extrinsic.era.toHuman() : null,
                        nonce: extrinsic.nonce ? extrinsic.nonce.toString() : null,
                        tip: extrinsic.tip ? extrinsic.tip.toString() : null,
                        isSigned: extrinsic.isSigned,
                        length: extrinsic.length,
                        args: extrinsicsRaw[i]?.method?.args || []
                    };
                    
                    const extrinsicResult = await client.query<{ id: number }>(`
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
                        i,
                        method.section,
                        method.method,
                        signer,
                        { 'args': extrinsicRaw.args }, // rawオブジェクトのargsキーの値を使用
                        extrinsicRaw
                    ]);
                    
                    const extrinsicId = extrinsicResult.rows[0]?.id;
                    if (extrinsicId) {
                        extrinsicIds.set(i, extrinsicId);
                    }
                }

                // 4. Eventsを保存し、各extrinsicに紐づくeventsをマッピング
                const extrinsicEventsMap: Map<number, any[]> = new Map(); // extrinsic index -> events
                
                if (events && Array.isArray(events)) {
                    let eventIndexInBlock = 0;
                    
                    for (const eventData of events) {
                        if (!eventData || eventData.error) continue;
                        
                        // phaseからextrinsic_idを特定
                        let eventExtrinsicId: number | null = null;
                        let eventExtrinsicIndex: number | null = null;
                        if (eventData.phase) {
                            // phase.isApplyExtrinsicの場合、extrinsic indexを取得
                            try {
                                const phase = eventData.phase as any;
                                if (phase.ApplyExtrinsic !== undefined) {
                                    const extrinsicIndex = typeof phase.ApplyExtrinsic === 'number' 
                                        ? phase.ApplyExtrinsic 
                                        : parseInt(phase.ApplyExtrinsic);
                                    
                                    if (!isNaN(extrinsicIndex)) {
                                        eventExtrinsicIndex = extrinsicIndex;
                                        eventExtrinsicId = extrinsicIds.get(extrinsicIndex) || null;
                                        
                                        // extrinsicに紐づくeventsを記録
                                        if (!extrinsicEventsMap.has(extrinsicIndex)) {
                                            extrinsicEventsMap.set(extrinsicIndex, []);
                                        }
                                        extrinsicEventsMap.get(extrinsicIndex)!.push(eventData);
                                    }
                                }
                            } catch {
                                // phase解析失敗時はnullのまま
                            }
                        }
                        
                        // event情報を取得
                        let eventSection = 'unknown';
                        let eventMethod = 'unknown';
                        let eventDataJson: any = {};
                        
                        if (eventData.event) {
                            try {
                                const event = eventData.event as any;
                                if (typeof event === 'object') {
                                    eventSection = event.section || Object.keys(event)[0] || 'unknown';
                                    eventMethod = event.method || (event[eventSection]?.method) || 'unknown';
                                    eventDataJson = event;
                                }
                            } catch {
                                eventDataJson = { raw: eventData.event };
                            }
                        }
                        
                        await client.query(`
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
                            blockId,
                            eventExtrinsicId,
                            eventIndexInBlock++,
                            eventSection,
                            eventMethod,
                            eventDataJson,
                            eventData.topics || null
                        ]);
                    }
                }

                // 5. Transactionsを保存（Txとして扱うextrinsicを判定）
                for (let i = 0; i < block.extrinsics.length; i++) {
                    const extrinsic = block.extrinsics[i];
            if (!extrinsic) continue;
                    
                    const method = extrinsic.method;
                    const section = method.section;
                    const methodName = method.method;
                    const isSigned = extrinsic.isSigned;
                    const signerAddress = extrinsic.signer ? extrinsic.signer.toString() : null;
                    
                    // Txとして扱うか判定
                    if (isTransactionLike(section, methodName, isSigned)) {
                        const extrinsicId = extrinsicIds.get(i);
                        if (!extrinsicId) continue;
                        
                        const extrinsicEvents = extrinsicEventsMap.get(i) || [];
                        const hash = extrinsic.hash.toString();
                        
                        // eventsからfee、shielded、status、total_input、total_outputを判定
                        let fee: string | null = null;
                        let isShielded = false;
                        let status = 1; // 1: committed (デフォルト)
                        let totalInput: bigint = 0n;
                        let totalOutput: bigint = 0n;
                        
                        // extrinsicのargsから直接amountを取得（イベントがない場合のフォールバック）
                        try {
                            if (method.args && method.args.length > 0) {
                                // balances.transferやmidnightTx系のメソッドの場合、argsからamountを取得
                                if (section === 'balances' && (methodName === 'transfer' || methodName === 'transferKeepAlive')) {
                                    // balances.transfer(dest, value) - valueが2番目の引数
                                    if (method.args.length >= 2) {
                                        const value = method.args[1] as any;
                                        if (value) {
                                            try {
                                                const valueStr = (value?.toString ? value.toString() : String(value)).replace(/[,._]/g, '');
                                                const valueBigInt = BigInt(valueStr || '0');
                                                if (valueBigInt > 0n) {
                                                    totalInput += valueBigInt;
                                                    totalOutput += valueBigInt;
                                                }
                                            } catch {
                                                // argsからのパース失敗は無視
                                            }
                                        }
                                    }
                                }
                                // midnightTx系のメソッド
                                if (section === 'midnightTx' || section === 'compact' || section === 'shielded') {
                                    // argsからamount/valueを探す
                                    const argsArray = method.args as any[];
                                    for (let argIdx = 0; argIdx < argsArray.length; argIdx++) {
                                        const arg = argsArray[argIdx];
                                        try {
                                            if (typeof arg === 'object' && arg !== null) {
                                                const argObj = arg as any;
                                                if (argObj.amount || argObj.value) {
                                                    const amount = argObj.amount || argObj.value;
                                                    const amountStr = (amount?.toString ? amount.toString() : String(amount)).replace(/[,._]/g, '');
                                                    const amountBigInt = BigInt(amountStr || '0');
                                                    if (amountBigInt > 0n) {
                                                        totalInput += amountBigInt;
                                                        totalOutput += amountBigInt;
                                                    }
                                                    break;
                                                }
                                            } else if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'bigint') {
                                                // 文字列や数値の場合、amountとして扱う可能性
                                                try {
                                                    const amountStr = String(arg).replace(/[,._]/g, '');
                                                    const amountBigInt = BigInt(amountStr || '0');
                                                    // 妥当な範囲の数値のみをamountとして扱う（例: 1000以上）
                                                    if (amountBigInt > 1000n && amountBigInt < BigInt('1' + '0'.repeat(40))) {
                                                        // 最後の数値引数をamountとして扱う（簡易的な推測）
                                                        if (argIdx === argsArray.length - 1) {
                                                            totalInput += amountBigInt;
                                                            totalOutput += amountBigInt;
                                                        }
                                                    }
                                                } catch {
                                                    // 数値変換失敗は無視
                                                }
                                            }
                                        } catch {
                                            // arg解析失敗は無視
                                        }
                                    }
                                }
                            }
                        } catch {
                            // args解析失敗は無視
                        }
                        
                        // eventsを解析してfee、shielded、status、total_input、total_outputを取得
                        for (const eventData of extrinsicEvents) {
                            if (!eventData?.event) continue;
                            
                            try {
                                const event = eventData.event as any;
                                const eventSection = event.section || Object.keys(event)[0];
                                const eventMethod = event.method || (event[eventSection]?.method);
                                
                                // fee関連のイベントを検索
                                if (eventSection === 'transactionPayment' && eventMethod === 'TransactionFeePaid') {
                                    const feeData = event[eventSection]?.[eventMethod] || event;
                                    if (feeData?.actualFee) {
                                        fee = feeData.actualFee.toString();
                                        // feeもtotal_inputに含める
                                        try {
                                            const feeAmount = BigInt(feeData.actualFee.toString().replace(/,/g, ''));
                                            totalInput += feeAmount;
                                        } catch {
                                            // feeのパース失敗は無視
                                        }
                                    }
                                }
                                
                                // balances.Transfer イベントから転送額を取得
                                if (eventSection === 'balances' && eventMethod === 'Transfer') {
                                    const transferData = event[eventSection]?.[eventMethod] || event;
                                    
                                    try {
                                        // Transferイベントの構造: [from, to, amount] または { from, to, amount }
                                        let amount: any = null;
                                        let from: any = null;
                                        let to: any = null;
                                        
                                        // イベントデータの構造を解析（複数の形式に対応）
                                        if (transferData.amount) {
                                            amount = transferData.amount;
                                            from = transferData.from;
                                            to = transferData.to;
                                        } else if (Array.isArray(transferData)) {
                                            // 配列形式: [from, to, amount]
                                            from = transferData[0];
                                            to = transferData[1];
                                            amount = transferData[2];
                                        } else if (transferData.data && Array.isArray(transferData.data)) {
                                            from = transferData.data[0];
                                            to = transferData.data[1];
                                            amount = transferData.data[2];
                                        } else if (transferData[2]) {
                                            // インデックスアクセス
                                            from = transferData[0];
                                            to = transferData[1];
                                            amount = transferData[2];
                                        } else if (typeof transferData === 'object') {
                                            // オブジェクトのキーから推測
                                            const keys = Object.keys(transferData);
                                            if (keys.length >= 3) {
                                                from = transferData[keys[0]];
                                                to = transferData[keys[1]];
                                                amount = transferData[keys[2]];
                                            }
                                        }
                                        
                                        if (amount) {
                                            // amountをBigIntに変換
                                            let amountStr = amount.toString();
                                            // カンマやその他の区切り文字を削除
                                            amountStr = amountStr.replace(/[,._]/g, '');
                                            const amountBigInt = BigInt(amountStr || '0');
                                            
                                            // signerがfromの場合、total_inputに追加
                                            if (signerAddress && from) {
                                                const fromStr = from.toString().toLowerCase();
                                                const signerStr = signerAddress.toString().toLowerCase();
                                                if (fromStr === signerStr) {
                                                    totalInput += amountBigInt;
                                                }
                                            }
                                            
                                            // toへの転送はtotal_outputに追加
                                            if (to) {
                                                totalOutput += amountBigInt;
                                            }
                                        }
                                    } catch (err) {
                                        // Transferイベントのパース失敗は無視
                                        console.warn(`Failed to parse Transfer event for block ${blockNumber}:`, err);
                                    }
                                }
                                
                                // balances.Withdraw イベント（出金）
                                if (eventSection === 'balances' && eventMethod === 'Withdraw') {
                                    const withdrawData = event[eventSection]?.[eventMethod] || event;
                                    try {
                                        let amount: any = null;
                                        
                                        if (withdrawData?.amount) {
                                            amount = withdrawData.amount;
                                        } else if (Array.isArray(withdrawData)) {
                                            amount = withdrawData[1] || withdrawData[withdrawData.length - 1];
                                        } else if (withdrawData?.data && Array.isArray(withdrawData.data)) {
                                            amount = withdrawData.data[1] || withdrawData.data[withdrawData.data.length - 1];
                                        } else if (typeof withdrawData === 'object') {
                                            // オブジェクトからamountを探す
                                            const keys = Object.keys(withdrawData);
                                            for (const key of keys) {
                                                if (key.toLowerCase().includes('amount') || key.toLowerCase().includes('value')) {
                                                    amount = withdrawData[key];
                                                    break;
                                                }
                                            }
                                            // amountが見つからない場合、最後の数値プロパティを使用
                                            if (!amount && keys.length > 0) {
                                                amount = withdrawData[keys[keys.length - 1]];
                                            }
                                        }
                                        
                                        if (amount) {
                                            let amountStr = amount.toString().replace(/[,._]/g, '');
                                            const amountBigInt = BigInt(amountStr || '0');
                                            totalInput += amountBigInt;
                                        }
                                    } catch {
                                        // Withdrawイベントのパース失敗は無視
                                    }
                                }
                                
                                // balances.Deposit イベント（入金）
                                if (eventSection === 'balances' && eventMethod === 'Deposit') {
                                    const depositData = event[eventSection]?.[eventMethod] || event;
                                    try {
                                        let amount: any = null;
                                        
                                        if (depositData?.amount) {
                                            amount = depositData.amount;
                                        } else if (Array.isArray(depositData)) {
                                            amount = depositData[1] || depositData[depositData.length - 1];
                                        } else if (depositData?.data && Array.isArray(depositData.data)) {
                                            amount = depositData.data[1] || depositData.data[depositData.data.length - 1];
                                        } else if (typeof depositData === 'object') {
                                            // オブジェクトからamountを探す
                                            const keys = Object.keys(depositData);
                                            for (const key of keys) {
                                                if (key.toLowerCase().includes('amount') || key.toLowerCase().includes('value')) {
                                                    amount = depositData[key];
                                                    break;
                                                }
                                            }
                                            // amountが見つからない場合、最後の数値プロパティを使用
                                            if (!amount && keys.length > 0) {
                                                amount = depositData[keys[keys.length - 1]];
                                            }
                                        }
                                        
                                        if (amount) {
                                            let amountStr = amount.toString().replace(/[,._]/g, '');
                                            const amountBigInt = BigInt(amountStr || '0');
                                            totalOutput += amountBigInt;
                                        }
                                    } catch {
                                        // Depositイベントのパース失敗は無視
                                    }
                                }
                                
                                // assets.Transferred イベント（アセット転送）
                                if (eventSection === 'assets' && (eventMethod === 'Transferred' || eventMethod === 'Transfer')) {
                                    const transferData = event[eventSection]?.[eventMethod] || event;
                                    try {
                                        let amount: any = null;
                                        let from: any = null;
                                        let to: any = null;
                                        
                                        if (transferData?.amount) {
                                            amount = transferData.amount;
                                            from = transferData.from || transferData.owner;
                                            to = transferData.to || transferData.target;
                                        } else if (Array.isArray(transferData)) {
                                            from = transferData[0];
                                            to = transferData[1];
                                            amount = transferData[2] || transferData[3]; // asset_id, amount
                                        } else if (transferData?.data && Array.isArray(transferData.data)) {
                                            from = transferData.data[0];
                                            to = transferData.data[1];
                                            amount = transferData.data[2] || transferData.data[3];
                                        }
                                        
                                        if (amount) {
                                            let amountStr = amount.toString().replace(/[,._]/g, '');
                                            const amountBigInt = BigInt(amountStr || '0');
                                            
                                            if (signerAddress && from) {
                                                const fromStr = from.toString().toLowerCase();
                                                const signerStr = signerAddress.toString().toLowerCase();
                                                if (fromStr === signerStr) {
                                                    totalInput += amountBigInt;
                                                }
                                            }
                                            
                                            if (to) {
                                                totalOutput += amountBigInt;
                                            }
                                        }
                                    } catch {
                                        // Assets転送イベントのパース失敗は無視
                                    }
                                }
                                
                                // Midnight特有のshielded transferイベント
                                if (eventSection === 'midnight' || eventSection === 'shielded' || 
                                    eventSection?.toLowerCase().includes('midnight')) {
                                    isShielded = true;
                                    
                                    // Midnightのshielded transferイベントからamountを取得
                                    try {
                                        const midnightData = event[eventSection]?.[eventMethod] || event;
                                        
                                        // 複数の形式に対応
                                        let amount: any = null;
                                        if (midnightData?.amount) {
                                            amount = midnightData.amount;
                                        } else if (midnightData?.value) {
                                            amount = midnightData.value;
                                        } else if (Array.isArray(midnightData)) {
                                            // 配列形式からamountを取得
                                            amount = midnightData.find((item: any) => 
                                                typeof item === 'object' && (item.amount || item.value)
                                            )?.amount || midnightData[midnightData.length - 1];
                                        } else if (typeof midnightData === 'object') {
                                            // オブジェクトからamount/valueを探す
                                            const keys = Object.keys(midnightData);
                                            for (const key of keys) {
                                                if (key.toLowerCase().includes('amount') || 
                                                    key.toLowerCase().includes('value')) {
                                                    amount = midnightData[key];
                                                    break;
                                                }
                                            }
                                        }
                                        
                                        if (amount) {
                                            let amountStr = amount.toString().replace(/[,._]/g, '');
                                            const amountBigInt = BigInt(amountStr || '0');
                                            
                                            // shielded transferの場合、実際のMidnight仕様に合わせて調整が必要
                                            // 通常、shielded transferではinputとoutputが等しい
                                            totalInput += amountBigInt;
                                            totalOutput += amountBigInt;
                                        }
                                    } catch {
                                        // Midnightイベントのパース失敗は無視
                                    }
                                }
                                
                                // shielded transaction関連のイベント（Midnight以外も考慮）
                                if (eventMethod?.toLowerCase().includes('shielded') ||
                                    eventMethod?.toLowerCase().includes('private')) {
                                    isShielded = true;
                                }
                                
                                // method名からもshielded判定
                                if (section === 'midnightTx' || section === 'shielded' || 
                                    methodName?.toLowerCase().includes('shielded') ||
                                    methodName?.toLowerCase().includes('private')) {
                                    isShielded = true;
                                }
                                
                                // 実行失敗のイベント
                                if (eventSection === 'system' && eventMethod === 'ExtrinsicFailed') {
                                    status = 0; // failed
                                }
                                
                                // 実行成功のイベント
                                if (eventSection === 'system' && eventMethod === 'ExtrinsicSuccess') {
                                    status = 1; // success
                                }
                            } catch {
                                // event解析エラーは無視
                            }
                        }
                        
                        // total_inputとtotal_outputを文字列に変換（nullの場合はnull）
                        const totalInputStr = totalInput > 0n ? totalInput.toString() : null;
                        const totalOutputStr = totalOutput > 0n ? totalOutput.toString() : null;
                        
                        // Transactionを保存
                        const txResult = await client.query<{ id: number }>(`
                            INSERT INTO transactions (
                                hash, block_id, index_in_block, timestamp,
                                is_shielded, fee, total_input, total_output,
                                status, raw
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
                            RETURNING id
                        `, [
                            hash.substring(2).toLowerCase(),
                            blockId,
                            i,
                            new Date(timestamp * 1000),
                            isShielded,
                            fee,
                            totalInputStr, // total_input (イベントから取得)
                            totalOutputStr, // total_output (イベントから取得)
                            status,
                            {
                                extrinsicId: extrinsicId,
                                section: section,
                                method: methodName,
                                signer: signerAddress,
                                totalInput: totalInputStr,
                                totalOutput: totalOutputStr,
                                events: extrinsicEvents.map((e: any) => ({
                                    section: e.event?.section || Object.keys(e.event || {})[0],
                                    method: e.event?.method || 'unknown',
                                    data: e.event
                                }))
                            }
                        ]);
                        
                        const txId = txResult.rows[0]?.id;
                        if (!txId) continue;
                        
                        // 6. tx_outputsとtx_inputsを保存
                        let outputIndex = 0;
                        let inputIndex = 0;
                        
                        // アカウント情報を追跡するためのセット
                        const accountsInvolved = new Set<string>();
                        const accountTxData = new Map<string, { direction: number; value: bigint }>();
                        const shieldedNotesToCreate = new Array<{ commitment: string; assetId: string; value: bigint; outputId: number }>();
                        
                        // イベントからoutputsとinputsを抽出
                        for (const eventData of extrinsicEvents) {
                            if (!eventData?.event) continue;
                            
                            try {
                                const event = eventData.event as any;
                                const eventSection = event.section || Object.keys(event)[0];
                                const eventMethod = event.method || (event[eventSection]?.method);
                                
                                // balances.Transfer イベントからoutputs/inputsを抽出
                                if (eventSection === 'balances' && eventMethod === 'Transfer') {
                                    const transferData = event[eventSection]?.[eventMethod] || event;
                                    
                                    try {
                                        let amount: any = null;
                                        let from: any = null;
                                        let to: any = null;
                                        
                                        // イベントデータの構造を解析
                                        if (transferData.amount) {
                                            amount = transferData.amount;
                                            from = transferData.from;
                                            to = transferData.to;
                                        } else if (Array.isArray(transferData)) {
                                            from = transferData[0];
                                            to = transferData[1];
                                            amount = transferData[2];
                                        } else if (transferData.data && Array.isArray(transferData.data)) {
                                            from = transferData.data[0];
                                            to = transferData.data[1];
                                            amount = transferData.data[2];
                                        } else if (typeof transferData === 'object') {
                                            const keys = Object.keys(transferData);
                                            if (keys.length >= 3) {
                                                from = transferData[keys[0]];
                                                to = transferData[keys[1]];
                                                amount = transferData[keys[2]];
                                            }
                                        }
                                        
                                        if (amount && to) {
                                            let amountStr = amount.toString().replace(/[,._]/g, '');
                                            const amountBigInt = BigInt(amountStr || '0');
                                            
                                            if (amountBigInt > 0n) {
                                                // tx_outputsに保存
                                                const toAddress = to.toString();
                                                const outputResult = await client.query<{ id: number }>(`
                                                    INSERT INTO tx_outputs (
                                                        tx_id, index, account_addr, asset_id, value, shielded, note_commitment, raw
                                                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                                                    ON CONFLICT (tx_id, index) DO UPDATE SET
                                                        account_addr = EXCLUDED.account_addr,
                                                        asset_id = EXCLUDED.asset_id,
                                                        value = EXCLUDED.value,
                                                        shielded = EXCLUDED.shielded,
                                                        note_commitment = EXCLUDED.note_commitment,
                                                        raw = EXCLUDED.raw
                                                    RETURNING id
                                                `, [
                                                    txId,
                                                    outputIndex++,
                                                    toAddress,
                                                    'MID', // デフォルトアセットID
                                                    amountBigInt.toString(),
                                                    false, // 通常のtransferはshieldedではない
                                                    null,
                                                    {
                                                        event: event,
                                                        from: from?.toString(),
                                                        to: toAddress,
                                                        amount: amountBigInt.toString()
                                                    }
                                                ]);
                                                
                                                const outputId = outputResult.rows[0]?.id;
                                                
                                                // アカウント情報を追跡
                                                if (toAddress) {
                                                    accountsInvolved.add(toAddress.toLowerCase());
                                                    const existing = accountTxData.get(toAddress.toLowerCase());
                                                    if (existing) {
                                                        existing.value += amountBigInt;
                                                    } else {
                                                        accountTxData.set(toAddress.toLowerCase(), { direction: 1, value: amountBigInt }); // 1 = in
                                                    }
                                                }
                                                
                                                if (from) {
                                                    const fromStr = from.toString().toLowerCase();
                                                    accountsInvolved.add(fromStr);
                                                    const existing = accountTxData.get(fromStr);
                                                    if (existing) {
                                                        existing.direction = existing.direction === 1 ? 3 : 2; // 3 = self, 2 = out
                                                        existing.value += amountBigInt;
                                                    } else {
                                                        accountTxData.set(fromStr, { direction: 2, value: amountBigInt }); // 2 = out
                                                    }
                                                }
                                                
                                                // signerがfromの場合、tx_inputsにも記録
                                                if (signerAddress && from) {
                                                    const fromStr = from.toString().toLowerCase();
                                                    const signerStr = signerAddress.toString().toLowerCase();
                                                    if (fromStr === signerStr) {
                                                        // 以前のoutputを検索してprev_output_idを取得
                                                        // fromアドレスとamountが一致する未使用のoutputを検索
                                                        let prevOutputId: number | null = null;
                                                        let prevTxHash: string | null = null;
                                                        let prevTxOutputIx: number | null = null;
                                                        
                                                        try {
                                                            // 同じaccount_addrで、同じかそれ以上のvalueを持つoutputを検索
                                                            // 未使用のoutputを特定するため、tx_inputsで参照されていないoutputを探す
                                                            const prevOutputResult = await client.query<{
                                                                id: number;
                                                                tx_id: number;
                                                                index: number;
                                                                value: string;
                                                                tx_hash: string;
                                                            }>(`
                                                                SELECT 
                                                                    to_out.id,
                                                                    to_out.tx_id,
                                                                    to_out.index,
                                                                    to_out.value,
                                                                    t.hash as tx_hash
                                                                FROM tx_outputs to_out
                                                                INNER JOIN transactions t ON t.id = to_out.tx_id
                                                                WHERE to_out.account_addr = $1
                                                                    AND to_out.asset_id = $2
                                                                    AND to_out.value >= $3
                                                                    AND to_out.shielded = false
                                                                    AND NOT EXISTS (
                                                                        SELECT 1 FROM tx_inputs ti
                                                                        WHERE ti.prev_output_id = to_out.id
                                                                    )
                                                                ORDER BY t.timestamp DESC, to_out.id DESC
                                                                LIMIT 1
                                                            `, [
                                                                fromStr,
                                                                'MID',
                                                                amountBigInt.toString()
                                                            ]);
                                                        
                                                            if (prevOutputResult.rows.length > 0) {
                                                                prevOutputId = prevOutputResult.rows[0].id;
                                                                prevTxOutputIx = prevOutputResult.rows[0].index;
                                                                prevTxHash = prevOutputResult.rows[0].tx_hash;
                                                            }
                                                        } catch (err) {
                                                            // 検索エラーは無視（prev_output_idはnullのまま）
                                                            console.warn(`Failed to find previous output for ${fromStr}:`, err);
                                                        }
                                                        
                                                        await client.query(`
                                                            INSERT INTO tx_inputs (
                                                                tx_id, index, prev_tx_hash, prev_tx_output_ix, prev_output_id, raw
                                                            ) VALUES ($1, $2, $3, $4, $5, $6)
                                                            ON CONFLICT (tx_id, index) DO UPDATE SET
                                                                prev_tx_hash = EXCLUDED.prev_tx_hash,
                                                                prev_tx_output_ix = EXCLUDED.prev_tx_output_ix,
                                                                prev_output_id = EXCLUDED.prev_output_id,
                                                                raw = EXCLUDED.raw
                                                        `, [
                                                            txId,
                                                            inputIndex++,
                                                            prevTxHash,
                                                            prevTxOutputIx,
                                                            prevOutputId,
                                                            {
                                                                event: event,
                                                                from: fromStr,
                                                                to: toAddress,
                                                                amount: amountBigInt.toString(),
                                                                type: 'transfer',
                                                                prev_tx_hash: prevTxHash,
                                                                prev_output_id: prevOutputId
                                                            }
                                                        ]);
                                                    }
                                                }
                                            }
                                        }
                                    } catch (err) {
                                        console.warn(`Failed to parse Transfer event for tx_inputs/tx_outputs:`, err);
                                    }
                                }
                                
                                // balances.Deposit イベントからoutputを抽出
                                if (eventSection === 'balances' && eventMethod === 'Deposit') {
                                    const depositData = event[eventSection]?.[eventMethod] || event;
                                    try {
                                        let amount: any = null;
                                        let to: any = null;
                                        
                                        if (depositData?.amount) {
                                            amount = depositData.amount;
                                            to = depositData.who || depositData.account;
                                        } else if (Array.isArray(depositData)) {
                                            to = depositData[0];
                                            amount = depositData[1];
                                        } else if (depositData?.data && Array.isArray(depositData.data)) {
                                            to = depositData.data[0];
                                            amount = depositData.data[1];
                                        } else if (typeof depositData === 'object') {
                                            const keys = Object.keys(depositData);
                                            to = depositData.who || depositData.account || depositData[keys[0]];
                                            amount = depositData.amount || depositData.value || depositData[keys[1]];
                                        }
                                        
                                        if (amount && to) {
                                            let amountStr = amount.toString().replace(/[,._]/g, '');
                                            const amountBigInt = BigInt(amountStr || '0');
                                            
                                            if (amountBigInt > 0n) {
                                                const toAddress = to.toString();
                                                await client.query(`
                                                    INSERT INTO tx_outputs (
                                                        tx_id, index, account_addr, asset_id, value, shielded, note_commitment, raw
                                                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                                                    ON CONFLICT (tx_id, index) DO UPDATE SET
                                                        account_addr = EXCLUDED.account_addr,
                                                        asset_id = EXCLUDED.asset_id,
                                                        value = EXCLUDED.value,
                                                        shielded = EXCLUDED.shielded,
                                                        note_commitment = EXCLUDED.note_commitment,
                                                        raw = EXCLUDED.raw
                                                `, [
                                                    txId,
                                                    outputIndex++,
                                                    toAddress,
                                                    'MID',
                                                    amountBigInt.toString(),
                                                    false,
                                                    null,
                                                    { event: event, type: 'deposit' }
                                                ]);
                                                
                                                // アカウント情報を追跡
                                                if (toAddress) {
                                                    accountsInvolved.add(toAddress.toLowerCase());
                                                    const existing = accountTxData.get(toAddress.toLowerCase());
                                                    if (existing) {
                                                        existing.value += amountBigInt;
                                                    } else {
                                                        accountTxData.set(toAddress.toLowerCase(), { direction: 1, value: amountBigInt }); // 1 = in
                                                    }
                                                }
                                            }
                                        }
                                    } catch {
                                        // Depositイベントのパース失敗は無視
                                    }
                                }
                                
                                // assets.Transferred イベントからoutputを抽出
                                if (eventSection === 'assets' && (eventMethod === 'Transferred' || eventMethod === 'Transfer')) {
                                    const transferData = event[eventSection]?.[eventMethod] || event;
                                    try {
                                        let amount: any = null;
                                        let from: any = null;
                                        let to: any = null;
                                        let assetId = 'MID';
                                        
                                        if (transferData?.amount) {
                                            amount = transferData.amount;
                                            from = transferData.from || transferData.owner;
                                            to = transferData.to || transferData.target;
                                            assetId = transferData.assetId || transferData.asset_id || 'MID';
                                        } else if (Array.isArray(transferData)) {
                                            assetId = transferData[0]?.toString() || 'MID';
                                            from = transferData[1];
                                            to = transferData[2];
                                            amount = transferData[3] || transferData[4];
                                        } else if (transferData?.data && Array.isArray(transferData.data)) {
                                            assetId = transferData.data[0]?.toString() || 'MID';
                                            from = transferData.data[1];
                                            to = transferData.data[2];
                                            amount = transferData.data[3] || transferData.data[4];
                                        }
                                        
                                        if (amount && to) {
                                            let amountStr = amount.toString().replace(/[,._]/g, '');
                                            const amountBigInt = BigInt(amountStr || '0');
                                            
                                            if (amountBigInt > 0n) {
                                                const toAddress = to.toString();
                                                await client.query(`
                                                    INSERT INTO tx_outputs (
                                                        tx_id, index, account_addr, asset_id, value, shielded, note_commitment, raw
                                                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                                                    ON CONFLICT (tx_id, index) DO UPDATE SET
                                                        account_addr = EXCLUDED.account_addr,
                                                        asset_id = EXCLUDED.asset_id,
                                                        value = EXCLUDED.value,
                                                        shielded = EXCLUDED.shielded,
                                                        note_commitment = EXCLUDED.note_commitment,
                                                        raw = EXCLUDED.raw
                                                `, [
                                                    txId,
                                                    outputIndex++,
                                                    toAddress,
                                                    assetId,
                                                    amountBigInt.toString(),
                                                    false,
                                                    null,
                                                    { event: event, type: 'asset_transfer' }
                                                ]);
                                                
                                                // アカウント情報を追跡
                                                if (toAddress) {
                                                    accountsInvolved.add(toAddress.toLowerCase());
                                                    const existing = accountTxData.get(toAddress.toLowerCase());
                                                    if (existing) {
                                                        existing.value += amountBigInt;
                                                    } else {
                                                        accountTxData.set(toAddress.toLowerCase(), { direction: 1, value: amountBigInt }); // 1 = in
                                                    }
                                                }
                                                
                                                if (from) {
                                                    const fromStr = from.toString().toLowerCase();
                                                    accountsInvolved.add(fromStr);
                                                    const existing = accountTxData.get(fromStr);
                                                    if (existing) {
                                                        existing.direction = existing.direction === 1 ? 3 : 2; // 3 = self, 2 = out
                                                        existing.value += amountBigInt;
                                                    } else {
                                                        accountTxData.set(fromStr, { direction: 2, value: amountBigInt }); // 2 = out
                                                    }
                                                }
                                            }
                                        }
                                    } catch {
                                        // Assets転送イベントのパース失敗は無視
                                    }
                                }
                                
                                // Midnight特有のshielded transferイベントからoutputを抽出
                                if (eventSection === 'midnight' || eventSection === 'shielded' || 
                                    eventSection?.toLowerCase().includes('midnight')) {
                                    try {
                                        const midnightData = event[eventSection]?.[eventMethod] || event;
                                        
                                        let amount: any = null;
                                        let noteCommitment: any = null;
                                        let assetId = 'MID';
                                        
                                        // amountとnote_commitmentを取得
                                        if (midnightData?.amount) {
                                            amount = midnightData.amount;
                                            noteCommitment = midnightData.noteCommitment || midnightData.commitment || midnightData.note_commitment;
                                            assetId = midnightData.assetId || midnightData.asset_id || 'MID';
                                        } else if (midnightData?.value) {
                                            amount = midnightData.value;
                                            noteCommitment = midnightData.noteCommitment || midnightData.commitment;
                                            assetId = midnightData.assetId || 'MID';
                                        } else if (Array.isArray(midnightData)) {
                                            amount = midnightData.find((item: any) => 
                                                typeof item === 'object' && (item.amount || item.value)
                                            )?.amount || midnightData[midnightData.length - 1];
                                        } else if (typeof midnightData === 'object') {
                                            const keys = Object.keys(midnightData);
                                            for (const key of keys) {
                                                if (key.toLowerCase().includes('amount') || key.toLowerCase().includes('value')) {
                                                    amount = midnightData[key];
                                                }
                                                if (key.toLowerCase().includes('commitment') || key.toLowerCase().includes('note')) {
                                                    noteCommitment = midnightData[key];
                                                }
                                                if (key.toLowerCase().includes('asset')) {
                                                    assetId = midnightData[key]?.toString() || 'MID';
                                                }
                                            }
                                        }
                                        
                                        if (amount) {
                                            let amountStr = amount.toString().replace(/[,._]/g, '');
                                            const amountBigInt = BigInt(amountStr || '0');
                                            
                                            if (amountBigInt > 0n) {
                                                // shielded outputとして保存
                                                const shieldedOutputResult = await client.query<{ id: number }>(`
                                                    INSERT INTO tx_outputs (
                                                        tx_id, index, account_addr, asset_id, value, shielded, note_commitment, raw
                                                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                                                    ON CONFLICT (tx_id, index) DO UPDATE SET
                                                        account_addr = EXCLUDED.account_addr,
                                                        asset_id = EXCLUDED.asset_id,
                                                        value = EXCLUDED.value,
                                                        shielded = EXCLUDED.shielded,
                                                        note_commitment = EXCLUDED.note_commitment,
                                                        raw = EXCLUDED.raw
                                                    RETURNING id
                                                `, [
                                                    txId,
                                                    outputIndex++,
                                                    null, // shielded outputにはaccount_addrがない場合がある
                                                    assetId,
                                                    amountBigInt.toString(),
                                                    true, // shielded
                                                    noteCommitment?.toString() || null,
                                                    {
                                                        event: event,
                                                        type: 'shielded_output',
                                                        commitment: noteCommitment?.toString()
                                                    }
                                                ]);
                                                
                                                const shieldedOutputId = shieldedOutputResult.rows[0]?.id;
                                                
                                                // shielded_notesに追加するデータを収集
                                                if (noteCommitment && shieldedOutputId) {
                                                    shieldedNotesToCreate.push({
                                                        commitment: noteCommitment.toString(),
                                                        assetId: assetId,
                                                        value: amountBigInt,
                                                        outputId: shieldedOutputId
                                                    });
                                                }
                                                
                                                // shielded inputも記録（同じamountで）
                                                // note_commitmentを使って以前のshielded outputを検索
                                                let prevShieldedOutputId: number | null = null;
                                                let prevShieldedTxHash: string | null = null;
                                                let prevShieldedTxOutputIx: number | null = null;
                                                
                                                if (noteCommitment) {
                                                    try {
                                                        // note_commitmentが一致するshielded outputを検索
                                                        const prevShieldedResult = await client.query<{
                                                            id: number;
                                                            tx_id: number;
                                                            index: number;
                                                            tx_hash: string;
                                                        }>(`
                                                            SELECT 
                                                                to_out.id,
                                                                to_out.tx_id,
                                                                to_out.index,
                                                                t.hash as tx_hash
                                                            FROM tx_outputs to_out
                                                            INNER JOIN transactions t ON t.id = to_out.tx_id
                                                            WHERE to_out.note_commitment = $1
                                                                AND to_out.shielded = true
                                                                AND to_out.value >= $2
                                                                AND NOT EXISTS (
                                                                    SELECT 1 FROM tx_inputs ti
                                                                    WHERE ti.prev_output_id = to_out.id
                                                                )
                                                            ORDER BY t.timestamp DESC, to_out.id DESC
                                                            LIMIT 1
                                                        `, [
                                                            noteCommitment.toString(),
                                                            amountBigInt.toString()
                                                        ]);
                                                        
                                                        if (prevShieldedResult.rows.length > 0) {
                                                            prevShieldedOutputId = prevShieldedResult.rows[0].id;
                                                            prevShieldedTxOutputIx = prevShieldedResult.rows[0].index;
                                                            prevShieldedTxHash = prevShieldedResult.rows[0].tx_hash;
                                                            
                                                            // shielded_notesを更新（spentとしてマーク）
                                                            if (noteCommitment) {
                                                                await client.query(`
                                                                    UPDATE shielded_notes
                                                                    SET spent_tx_id = $1,
                                                                        spent_block_id = $2,
                                                                        status = 1
                                                                    WHERE commitment = $3
                                                                        AND status = 0
                                                                `, [txId, blockId, noteCommitment.toString()]);
                                                            }
                                                        }
                                                    } catch (err) {
                                                        console.warn(`Failed to find previous shielded output for commitment ${noteCommitment}:`, err);
                                                    }
                                                }
                                                
                                                await client.query(`
                                                    INSERT INTO tx_inputs (
                                                        tx_id, index, prev_tx_hash, prev_tx_output_ix, prev_output_id, raw
                                                    ) VALUES ($1, $2, $3, $4, $5, $6)
                                                    ON CONFLICT (tx_id, index) DO UPDATE SET
                                                        prev_tx_hash = EXCLUDED.prev_tx_hash,
                                                        prev_tx_output_ix = EXCLUDED.prev_tx_output_ix,
                                                        prev_output_id = EXCLUDED.prev_output_id,
                                                        raw = EXCLUDED.raw
                                                `, [
                                                    txId,
                                                    inputIndex++,
                                                    prevShieldedTxHash,
                                                    prevShieldedTxOutputIx,
                                                    prevShieldedOutputId,
                                                    {
                                                        event: event,
                                                        type: 'shielded_input',
                                                        commitment: noteCommitment?.toString(),
                                                        amount: amountBigInt.toString(),
                                                        prev_tx_hash: prevShieldedTxHash,
                                                        prev_output_id: prevShieldedOutputId
                                                    }
                                                ]);
                                            }
                                        }
                                    } catch {
                                        // Midnightイベントのパース失敗は無視
                                    }
                                }
                            } catch {
                                // event解析エラーは無視
                            }
                        }
                        
                        // extrinsicのargsから直接outputを抽出（イベントがない場合のフォールバック）
                        if (outputIndex === 0 && method.args && method.args.length > 0) {
                            try {
                                if (section === 'balances' && (methodName === 'transfer' || methodName === 'transferKeepAlive')) {
                                    // balances.transfer(dest, value)
                                    if (method.args.length >= 2) {
                                        const dest = method.args[0] as any;
                                        const value = method.args[1] as any;
                                        
                                        if (dest && value) {
                                            try {
                                                const destAddr = dest.toString();
                                                const valueStr = (value?.toString ? value.toString() : String(value)).replace(/[,._]/g, '');
                                                const valueBigInt = BigInt(valueStr || '0');
                                                
                                                if (valueBigInt > 0n) {
                                                    await client.query(`
                                                        INSERT INTO tx_outputs (
                                                            tx_id, index, account_addr, asset_id, value, shielded, note_commitment, raw
                                                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                                                        ON CONFLICT (tx_id, index) DO UPDATE SET
                                                            account_addr = EXCLUDED.account_addr,
                                                            asset_id = EXCLUDED.asset_id,
                                                            value = EXCLUDED.value,
                                                            shielded = EXCLUDED.shielded,
                                                            note_commitment = EXCLUDED.note_commitment,
                                                            raw = EXCLUDED.raw
                                                    `, [
                                                        txId,
                                                        0,
                                                        destAddr,
                                                        'MID',
                                                        valueBigInt.toString(),
                                                        false,
                                                        null,
                                                        {
                                                            source: 'extrinsic_args',
                                                            section: section,
                                                            method: methodName
                                                        }
                                                    ]);
                                                    
                                                    // アカウント情報を追跡
                                                    if (destAddr) {
                                                        accountsInvolved.add(destAddr.toLowerCase());
                                                        const existing = accountTxData.get(destAddr.toLowerCase());
                                                        if (existing) {
                                                            existing.value += valueBigInt;
                                                        } else {
                                                            accountTxData.set(destAddr.toLowerCase(), { direction: 1, value: valueBigInt }); // 1 = in
                                                        }
                                                    }
                                                    
                                                    if (signerAddress) {
                                                        const signerStr = signerAddress.toString().toLowerCase();
                                                        accountsInvolved.add(signerStr);
                                                        const existing = accountTxData.get(signerStr);
                                                        if (existing) {
                                                            existing.direction = existing.direction === 1 ? 3 : 2; // 3 = self, 2 = out
                                                            existing.value += valueBigInt;
                                                        } else {
                                                            accountTxData.set(signerStr, { direction: 2, value: valueBigInt }); // 2 = out
                                                        }
                                                    }
                                                    
                                                    // signerが存在する場合、tx_inputsにも記録
                                                    if (signerAddress) {
                                                        const signerStr = signerAddress.toString().toLowerCase();
                                                        let prevOutputId: number | null = null;
                                                        let prevTxHash: string | null = null;
                                                        let prevTxOutputIx: number | null = null;
                                                        
                                                        try {
                                                            // 以前のoutputを検索
                                                            const prevOutputResult = await client.query<{
                                                                id: number;
                                                                tx_id: number;
                                                                index: number;
                                                                tx_hash: string;
                                                            }>(`
                                                                SELECT 
                                                                    to_out.id,
                                                                    to_out.tx_id,
                                                                    to_out.index,
                                                                    t.hash as tx_hash
                                                                FROM tx_outputs to_out
                                                                INNER JOIN transactions t ON t.id = to_out.tx_id
                                                                WHERE to_out.account_addr = $1
                                                                    AND to_out.asset_id = $2
                                                                    AND to_out.value >= $3
                                                                    AND to_out.shielded = false
                                                                    AND NOT EXISTS (
                                                                        SELECT 1 FROM tx_inputs ti
                                                                        WHERE ti.prev_output_id = to_out.id
                                                                    )
                                                                ORDER BY t.timestamp DESC, to_out.id DESC
                                                                LIMIT 1
                                                            `, [
                                                                signerStr,
                                                                'MID',
                                                                valueBigInt.toString()
                                                            ]);
                                                        
                                                            if (prevOutputResult.rows.length > 0) {
                                                                prevOutputId = prevOutputResult.rows[0].id;
                                                                prevTxOutputIx = prevOutputResult.rows[0].index;
                                                                prevTxHash = prevOutputResult.rows[0].tx_hash;
                                                            }
                                                        } catch (err) {
                                                            console.warn(`Failed to find previous output for ${signerStr} from extrinsic args:`, err);
                                                        }
                                                        
                                                        await client.query(`
                                                            INSERT INTO tx_inputs (
                                                                tx_id, index, prev_tx_hash, prev_tx_output_ix, prev_output_id, raw
                                                            ) VALUES ($1, $2, $3, $4, $5, $6)
                                                            ON CONFLICT (tx_id, index) DO UPDATE SET
                                                                prev_tx_hash = EXCLUDED.prev_tx_hash,
                                                                prev_tx_output_ix = EXCLUDED.prev_tx_output_ix,
                                                                prev_output_id = EXCLUDED.prev_output_id,
                                                                raw = EXCLUDED.raw
                                                        `, [
                                                            txId,
                                                            inputIndex++,
                                                            prevTxHash,
                                                            prevTxOutputIx,
                                                            prevOutputId,
                                                            {
                                                                source: 'extrinsic_args',
                                                                section: section,
                                                                method: methodName,
                                                                signer: signerStr,
                                                                amount: valueBigInt.toString(),
                                                                prev_tx_hash: prevTxHash,
                                                                prev_output_id: prevOutputId
                                                            }
                                                        ]);
                                                    }
                                                }
                                            } catch {
                                                // argsからのパース失敗は無視
                                            }
                                        }
                                    }
                                }
                            } catch {
                                // args解析失敗は無視
                            }
                        }
                        
                        // 7. accounts, account_tx, account_balances, shielded_notesを更新
                        await updateAccountsAndRelatedTables(client, txId, blockId, timestamp, accountsInvolved, accountTxData, shieldedNotesToCreate);
                    }
                }
                
                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            }
        });

        return block.extrinsics.length;
    } catch (error) {
        console.error(`❌ Error indexing block ${blockNumber}:`, error);
        return 0;
    }
}

/**
 * accounts, account_tx, account_balances, shielded_notesテーブルを更新
 */
async function updateAccountsAndRelatedTables(
    client: any,
    txId: number,
    blockId: number,
    timestamp: number,
    accountsInvolved: Set<string>,
    accountTxData: Map<string, { direction: number; value: bigint }>,
    shieldedNotesToCreate: Array<{ commitment: string; assetId: string; value: bigint; outputId: number }>
): Promise<void> {
    try {
        // 1. accountsテーブルの更新
        for (const address of accountsInvolved) {
            if (!address) continue;
            
            // accountsテーブルに挿入または更新
            await client.query(`
                INSERT INTO accounts (address, first_seen_block_id, last_seen_block_id)
                VALUES ($1, $2, $3)
                ON CONFLICT (address) DO UPDATE SET
                    last_seen_block_id = GREATEST(accounts.last_seen_block_id, $3),
                    updated_at = now()
            `, [address, blockId, blockId]);
        }
        
        // 2. account_txテーブルの更新
        for (const [address, txInfo] of accountTxData.entries()) {
            if (!address) continue;
            
            // account_idを取得
            const accountResult = await client.query(`
                SELECT id FROM accounts WHERE address = $1
            `, [address]) as { rows: Array<{ id: number }> };
            
            if (accountResult.rows.length === 0) continue;
            const accountId = accountResult.rows[0].id;
            
            // account_txに挿入
            await client.query(`
                INSERT INTO account_tx (account_id, tx_id, block_id, direction, value)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (account_id, tx_id) DO UPDATE SET
                    direction = EXCLUDED.direction,
                    value = EXCLUDED.value
            `, [
                accountId,
                txId,
                blockId,
                txInfo.direction,
                txInfo.value.toString()
            ]);
        }
        
        // 3. account_balancesテーブルの更新（各アカウントの残高を計算）
        for (const address of accountsInvolved) {
            if (!address) continue;
            
            const accountResult = await client.query(`
                SELECT id FROM accounts WHERE address = $1
            `, [address]) as { rows: Array<{ id: number }> };
            
            if (accountResult.rows.length === 0) continue;
            const accountId = accountResult.rows[0].id;
            
            // 前のブロックでの残高を取得
            const prevBalanceResult = await client.query(`
                SELECT balance FROM account_balances
                WHERE account_id = $1 AND asset_id = $2
                ORDER BY block_id DESC
                LIMIT 1
            `, [accountId, 'MID']) as { rows: Array<{ balance: string }> };
            
            let currentBalance = BigInt(0);
            if (prevBalanceResult.rows.length > 0) {
                currentBalance = BigInt(prevBalanceResult.rows[0].balance);
            }
            
            // このトランザクションでの入出金を計算
            const txInfo = accountTxData.get(address);
            if (txInfo) {
                if (txInfo.direction === 1 || txInfo.direction === 3) {
                    // 入金または自己送金（入金分を加算）
                    currentBalance += txInfo.value;
                }
                if (txInfo.direction === 2 || txInfo.direction === 3) {
                    // 出金または自己送金（出金分を減算）
                    currentBalance -= txInfo.value;
                }
            }
            
            // account_balancesにスナップショットを保存
            await client.query(`
                INSERT INTO account_balances (account_id, asset_id, block_id, balance)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (account_id, asset_id, block_id) DO UPDATE SET
                    balance = EXCLUDED.balance
            `, [
                accountId,
                'MID',
                blockId,
                currentBalance.toString()
            ]);
        }
        
        // 4. shielded_notesテーブルの更新
        for (const note of shieldedNotesToCreate) {
            if (!note.commitment) continue;
            
            // shielded_notesにノートを作成
            await client.query(`
                INSERT INTO shielded_notes (
                    commitment, asset_id, value, created_tx_id, created_block_id, status, raw
                ) VALUES ($1, $2, $3, $4, $5, 0, $6)
                ON CONFLICT (commitment) DO UPDATE SET
                    value = EXCLUDED.value,
                    created_tx_id = EXCLUDED.created_tx_id,
                    created_block_id = EXCLUDED.created_block_id,
                    status = CASE WHEN shielded_notes.status = 1 THEN 1 ELSE 0 END
            `, [
                note.commitment,
                note.assetId,
                note.value.toString(),
                txId,
                blockId,
                {
                    output_id: note.outputId,
                    created_at: new Date(timestamp * 1000).toISOString()
                }
            ]);
        }
    } catch (err) {
        console.error(`Failed to update accounts and related tables:`, err);
        // エラーを再スローして、トランザクション全体をロールバックさせる
        throw err;
    }
}

/**
 * ExtrinsicがTransactionとして扱うべきか判定
 */
function isTransactionLike(section: string, method: string, isSigned: boolean): boolean {
    // トランザクションとして扱わないextrinsic
    const excludedPatterns = [
        'timestamp.set',
        'parachainSystem.setValidationData',
        'system.remark',
        'system.remarkWithEvent'
    ];
    
    const key = `${section}.${method}`;
    if (excludedPatterns.includes(key)) {
        return false;
    }
    
    // 署名されているextrinsicは基本的にトランザクションとして扱う
    if (isSigned) {
        return true;
    }
    
    // トランザクションとして扱うextrinsicのパターン
    const txLikePrefixes = [
        'balances.',
        'assets.',
        'midnightTx.',
        'compact.',
        'utility.batch',
        'utility.batchAll',
        'utility.forceBatch'
    ];
    
    return txLikePrefixes.some((prefix) => key.startsWith(prefix));
}


export async function startIndexing(): Promise<void> {
    if (isIndexing) {
        console.log('⚠️ Already indexing');
        return;
    }

    isIndexing = true;
    
    const api = await connectToChain();
    await connectPostgres();
    await initializeDatabase();
    const header = await api.rpc.chain.getHeader();
    const latestBlock = header.number.toNumber();

    console.log(`📊 Latest block on chain: ${latestBlock.toLocaleString()}`);

    let startBlock: number;
    const lastBlockNumber = await getLastBlockNumber();

    if (lastBlockNumber > 0) {
        startBlock = lastBlockNumber + 1;
        console.log(`📍 Starting from block ${startBlock.toLocaleString()}`);
    } else {
        startBlock = 1;
        console.log(`📍 Starting from genesis`);
    }

    console.log(`🚀 Indexing blocks ${startBlock.toLocaleString()} to ${latestBlock.toLocaleString()}`);
    console.log(`📦 Batch size: ${BATCH_SIZE} blocks`);

    let currentBlock = startBlock;
    let totalExtrinsics = 0;
    const startTime = Date.now();

    while (currentBlock <= latestBlock && isIndexing) {
        const batchEnd = Math.min(currentBlock + BATCH_SIZE - 1, latestBlock);

        const promises: Promise<number>[] = [];
        for (let i = currentBlock; i <= batchEnd; i++) {
            promises.push(indexBlock(api, i));
        }

        const results = await Promise.all(promises);
        const batchExtrinsecs = results.reduce((a, b) => a + b, 0);
        totalExtrinsics += batchExtrinsecs;

        setState('last_indexed_block', batchEnd.toString());
        
        const progress = ((batchEnd - startBlock) / (latestBlock - startBlock) * 100).toFixed(1);
        const elapsed = (Date.now() - startTime) / 1000;
        const blocksPerSec = ((batchEnd - startBlock) / elapsed).toFixed(1);

        console.log(`📦 Block ${batchEnd.toLocaleString()} / ${latestBlock.toLocaleString()} (${progress}%) | ${blocksPerSec} blocks/sec | ${totalExtrinsics.toLocaleString()} extrinsics`);

        currentBlock = batchEnd + 1;
    }

    console.log(`✅ Initial indexing complete!`);
    console.log(`🔍 Last block: ${lastBlockNumber.toLocaleString()}`);

    console.log('👀 Subscribing to new blocks...');
    await api.rpc.chain.subscribeNewHeads(async (header) => {
        const blockNumber = header.number.toNumber();
        const extrinsicCount = await indexBlock(api, blockNumber);

        console.log(`🆕 Block ${blockNumber.toLocaleString()} indexed (${extrinsicCount} extrinsics)`);
    });
}

export function stopIndexing(): void {
    isIndexing = false;
    console.log('⏹️ Stopping indexing...');
}
