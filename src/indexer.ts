import { ApiPromise, WsProvider } from "@polkadot/api";
import type { ProviderInterface } from "@polkadot/rpc-provider/types";
import { connectPostgres, getLastBlockNumber, initializeDatabase, insertBlock, insertExtrinsic, setState } from "./database";

const RPC_ENDPOINT = "wss://rpc.preview.midnight.network";
const BATCH_SIZE = 100;

let api: ApiPromise | null = null;
let isIndexing = false;

export async function connectToChain(): Promise<ApiPromise> {
    if (api && api.isConnected) return api;

    console.log('🔌 Connecting to', RPC_ENDPOINT);

    const provider = new WsProvider(RPC_ENDPOINT);
    api = await ApiPromise.create({
        provider: provider as ProviderInterface,
        noInitWarn: false
    });

    const chain = await api.rpc.system.chain();
    const nodeName = await api.rpc.system.name();
    const nodeVersion = await api.rpc.system.version();

    console.log(`✅ Connected to ${chain} via ${nodeName} v${nodeVersion}`)
    
    return api;
}


export async function indexBlock(api: ApiPromise, blockNumber: number): Promise<number> {
    try {
        const blockHash = await api.rpc.chain.getBlockHash(blockNumber);
        const block = await api.rpc.chain.getBlock(blockHash);
        const timestamp = Number(await api.query.timestamp?.now?.at(blockHash));
        
        await insertBlock({
            height: blockNumber,
            hash: blockHash.toString().substring(2).toLowerCase(),
            parent_hash: block.block.header.parentHash.toString().substring(2).toLowerCase(),
            timestamp: timestamp,
            extrinsics_count: block.block.extrinsics.length
        });

        let extrinsicsCount = 0;
        for (let i = 0; i < block.block.extrinsics.length; i++) {
            const extrinsic = block.block.extrinsics[i];
            if (!extrinsic) continue;
            const data = extrinsic.data;

            await insertExtrinsic({
                hash: extrinsic.hash.toString().substring(2).toLowerCase(),
                block_height: blockNumber,
                block_hash: blockHash.toString().substring(2).toLowerCase(),
                index_in_block: i,
                section: extrinsic.method.section,
                method: extrinsic.method.method,
                args: JSON.stringify(extrinsic.args.map(a => a.toString()) || []),
                data: Buffer.from(data).toString('hex'),
                success: 1,
                timestamp: timestamp,
            });
            extrinsicsCount++;
        }

        return extrinsicsCount;
    } catch (error) {
        console.error(`❌ Error indexing block ${blockNumber}:`, error);
        return 0;
    }
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
