import { request } from 'graphql-request';
import { bech32m } from 'bech32';
import { ApiPromise, WsProvider } from '@polkadot/api';
import type { ProviderInterface } from '@polkadot/rpc-provider/types';
import type { SignedBlock, Header, BlockHash } from '@polkadot/types/interfaces';
import type {
    GetBlockByHeightQuery,
    GetBlockByHeightQueryVariables,
    SystemTransaction,
    RegularTransaction,
    ConnectWalletMutationVariables,
    ConnectWalletMutation,
    DisconnectWalletMutationVariables,
    DisconnectWalletMutation,
    UnshieldedUtxo,
    DustGenerationDtimeUpdate,
    DustInitialUtxo,
    DustSpendProcessed,
    ParamChange,
    ContractCall,
    ContractDeploy,
    ContractUpdate,
    ContractBalance,
} from './graphql/generated';
import {
    GetBlockByHeightDocument,
    ConnectWalletDocument,
    DisconnectWalletDocument
} from './graphql/generated';
import { Block, BlockRaw, Extrinsic } from 'types/chain';

const MIDNIGHT_GRAPHQL_URL = process.env.MIDNIGHT_GRAPHQL_URL || 'https://indexer.preview.midnight.network/api/v3/graphql';

let api: ApiPromise | null = null;

// WebSocketエンドポイント: 環境変数が指定されていない場合は、複数の候補を試す
function getWebSocketUrl(): string {
    if (process.env.MIDNIGHT_GRAPHQL_WS_URL) {
        return process.env.MIDNIGHT_GRAPHQL_WS_URL;
    }
    
    // HTTPエンドポイントと同じパスを使用（多くのGraphQLサーバーでこれが標準）
    // const baseUrl = MIDNIGHT_GRAPHQL_URL.replace(/^https?:\/\//, 'wss://').replace(/^http:\/\//, 'ws://') + '/ws';
    return 'wss://rpc.preview.midnight.network'; //baseUrl;
    // return 'wss://indexer.preview.midnight.network/api/v3/graphql/ws';
}

const MIDNIGHT_GRAPHQL_WS_URL = getWebSocketUrl();


/**
 * ブロックを高さから取得します。
 * @param height ブロック高さ
 * @returns ブロックデータ。ブロックが見つからない場合はnullを返します。
 */
export async function getBlockByHeight(
    height: number
): Promise<GetBlockByHeightQuery['block'] | null>
{
    var variables: GetBlockByHeightQueryVariables = { height };
    try {
        const data = await request(
            MIDNIGHT_GRAPHQL_URL,
            GetBlockByHeightDocument,
            variables
        );
        return data.block;
    } catch (error: any) {
        return null;
    }
}

/**
 * GraphQLで取得可能な最大ブロック高を取得します。
 * バイナリサーチを使用して効率的に最大ブロック高を見つけます。
 * @param initialMaxHeight 初期探索範囲の最大高さ（デフォルト: 1000000）
 * @returns 最大ブロック高さ。ブロックが見つからない場合は0を返します。
 */
export async function getMaxBlockHeightFromGraphQL(
    initialMaxHeight: number = 1000000
): Promise<number> {
    let min = 0;
    let max = initialMaxHeight;
    let lastValidHeight = 0;

    // まず初期最大高さでブロックが存在するか確認
    try {
        const testBlock = await getBlockByHeight(max);
        if (testBlock) {
            // 初期最大高さより大きいブロックが存在する可能性があるため、
            // より大きな範囲を探索する
            while (true) {
                const nextHeight = max * 2;
                try {
                    const nextBlock = await getBlockByHeight(nextHeight);
                    if (nextBlock) {
                        max = nextHeight;
                        lastValidHeight = nextHeight;
                    } else {
                        break;
                    }
                } catch {
                    break;
                }
            }
        }
    } catch {
        // 初期最大高さでブロックが見つからない場合は、その範囲内で探索
    }

    // バイナリサーチで最大ブロック高を見つける
    while (min <= max) {
        const mid = Math.floor((min + max) / 2);
        
        try {
            const block = await getBlockByHeight(mid);
            if (block) {
                lastValidHeight = mid;
                min = mid + 1; // より高いブロックを探索
            } else {
                max = mid - 1; // より低いブロックを探索
            }
        } catch (error: any) {
            // エラーが発生した場合（ブロックが存在しないなど）、より低いブロックを探索
            max = mid - 1;
        }
    }

    return lastValidHeight;
}


/**
 * ウォレットを接続します。
 * @deprecated 使用しないでください
 * @param viewingKey ウォレットのビューキー
 * @returns セッションID
 */
export async function connectWallet(
    viewingKey: string
): Promise<string> {
    const variables: ConnectWalletMutationVariables = { viewingKey };
    const data: ConnectWalletMutation = await request(
        MIDNIGHT_GRAPHQL_URL,
        ConnectWalletDocument,
        variables
    );
    return data.connect;
}


/**
 * ウォレットを切断します。
 * @deprecated 使用しないでください
 * @param sessionId セッションID
 * @returns 成功時はUint型が返されます
 */
export async function disconnectWallet(
    sessionId: string
): Promise<string> {
    const variables: DisconnectWalletMutationVariables = { sessionId };
    const data: DisconnectWalletMutation = await request(
        MIDNIGHT_GRAPHQL_URL,
        DisconnectWalletDocument,
        variables
    );
    return data.disconnect;
}

/**
 * 通常のトランザクションかどうかを判定します。
 * @param tx トランザクションデータ
 * @returns 通常のトランザクションかどうか
 */
export function isRegularTransaction(tx: any): tx is RegularTransaction {
    return '__typename' in tx && tx.__typename === 'RegularTransaction';
}

/**
 * システムトランザクションかどうかを判定します。
 * @param tx トランザクションデータ
 * @returns システムトランザクションかどうか
 */
export function isSystemTransaction(tx: any): tx is SystemTransaction {
    return '__typename' in tx && tx.__typename === 'SystemTransaction';
}


/**
 * アンシールド出力かどうかを判定します。
 * @param output アンシールド出力データ
 * @returns アンシールド出力かどうか
 */
export function isUnshieldedOutput(output: any): output is UnshieldedUtxo {
    return '__typename' in output && output.__typename === 'UnshieldedUtxo';
}


export function isDustGenerationDtimeUpdate(event: any): event is DustGenerationDtimeUpdate {
    return '__typename' in event && event.__typename === 'DustGenerationDtimeUpdate';
}

export function isDustInitialUtxo(event: any): event is DustInitialUtxo {
    return '__typename' in event && event.__typename === 'DustInitialUtxo';
}

export function isDustSpendProcessed(event: any): event is DustSpendProcessed {
    return '__typename' in event && event.__typename === 'DustSpendProcessed';
}

export function isParamChange(event: any): event is ParamChange {
    return '__typename' in event && event.__typename === 'ParamChange';
}



export function isContractCall(action: any): action is ContractCall {
    return '__typename' in action && action.__typename === 'ContractCall';
}

export function isContractDeploy(action: any): action is ContractDeploy {
    return '__typename' in action && action.__typename === 'ContractDeploy';
}

export function isContractUpdate(action: any): action is ContractUpdate {
    return '__typename' in action && action.__typename === 'ContractUpdate';
}


export function isUnshieldedUtxo(output: any): output is UnshieldedUtxo {
    return '__typename' in output && output.__typename === 'UnshieldedUtxo';
}


export function isContractBalance(balance: any): balance is ContractBalance {
    return '__typename' in balance && balance.__typename === 'ContractBalance';
}


/**
 * 16進数文字列を mn_addr_preview 形式 (Bech32m) にエンコードします。
 * @param hexAddress 16進数エンコードされたアドレス (例: "0x1234...")
 * @returns Bech32m エンコード形式のアドレス (例: "mn_addr_preview1...")
 */
export function encodeToMnAddrPreview(hexAddress: string): string {

    // 0xプレフィックスを除去
    const hex = hexAddress.startsWith('0x')
        ? hexAddress.substring(2)
        : hexAddress;
    
    // 16進数文字列をバイト配列に変換
    const bytes = Buffer.from(hex, 'hex');

    // Bech32m エンコード
    // HRP: "mn_addr_preview" (プレビューネットワークのアンシールドアドレス)
    return bech32m.encode('mn_addr_preview', bech32m.toWords(bytes));
}

/**
 * mn_addr_preview 形式 (Bech32m) を 16進数文字列にデコードします。
 * @param bech32Address Bech32m エンコード 形式のアドレス
 * @param hexPrefix 16進数エンコードされたアドレスに0xプレフィックスを付与するかどうか
 * @returns 16進数エンコードされたアドレス
 */
export function decodeFromMnAddrPreview(bech32Address: string, hexPrefix: boolean = true): string {
    // Bech32m デコード
    // HRP: "mn_addr_preview" (プレビューネットワークのアンシールドアドレス)
    const { prefix, words } = bech32m.decode(bech32Address);

    // アドレスプレフィックスが一致しない場合はエラー
    if (prefix !== 'mn_addr_preview') {
        throw new Error(`Invalid address prefix: expected 'mn_addr_preview' but got '${prefix}'`);
    }

    // バイト配列に変換
    const bytes = Buffer.from(bech32m.fromWords(words));

    // バイト配列を16進数文字列に変換
    // 0xプレフィックスを付与 (hexPrefix = true の場合)
    return hexPrefix ? '0x' + bytes.toString('hex') : bytes.toString('hex');
}


/**
 * 16進数文字列を mn_addr 形式 (Bech32m) にエンコードします。
 * @param hexAddress 16進数エンコードされたアドレス (例: "0x1234...")
 * @param network ネットワーク (例: "preview", "test", "main")
 * @returns Bech32m エンコード形式のアドレス (例: "mn_addr_preview1...")
 */
export function encodeToMnAddr(
    hexAddress: string,
    network: 'preview' | 'test' | 'main' = 'preview'
): string {

    const hex = hexAddress.startsWith('0x')
        ? hexAddress.substring(2)
        : hexAddress;

    const bytes = Buffer.from(hex, 'hex');

    const hrp = `mn_addr_${network}`;

    return bech32m.encode(hrp, bech32m.toWords(bytes));
}


/**
 * トークンタイプ
 */
export enum TOKEN_TYPE {
    /**
     * ナイトトークン
     */
    NIGHT = '0000000000000000000000000000000000000000000000000000000000000000',
}



////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// PolkaDots API
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Midnight RPC に接続します。
 * @returns ApiPromise 接続成功時はApiPromiseが返されます
 */
export async function connectToChain(): Promise<ApiPromise> {
    if (api && api.isConnected) return api;

    console.log('[midnight-indexer] 🔌 Connecting to Midnight RPC:', MIDNIGHT_GRAPHQL_WS_URL);

    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const provider = new WsProvider(MIDNIGHT_GRAPHQL_WS_URL);

            api = await ApiPromise.create({
                provider: provider as ProviderInterface,
                noInitWarn: true,
                throwOnConnect: false,
            });
        
            const chain = await api.rpc.system.chain();
            const nodeName = await api.rpc.system.name();
            const nodeVersion = await api.rpc.system.version();
        
            console.log(`[midnight-indexer] ✅ Connected to ${chain} via ${nodeName} v${nodeVersion}`)
        
            return api;

        } catch (error: any) {
            lastError = error as Error;
            console.error(`[midnight-indexer] ❌ Failed to create API (attempt ${attempt}/${maxRetries}):`, error);

            if (attempt < maxRetries) {
                console.log(`[midnight-indexer] Retrying in 1 second...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }
    throw new Error(`Failed to connect to Midnight RPC after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
}


export async function getFinalizedBlockHash(): Promise<BlockHash> {
    if (!api || !api.isConnected) {
        api =await connectToChain();
    }
    return await api.rpc.chain.getFinalizedHead();
}


export async function getFinalizedBlockHeight(): Promise<number> {
    if (!api || !api.isConnected) {
        api =await connectToChain();
    }
    const hash = await getFinalizedBlockHash();
    const header = await api.rpc.chain.getHeader(hash);
    return header.number.toNumber();
}


/**
 * 新しいブロックを購読します。
 * @param onBlock 新しいブロックが受信されたときに呼び出されるコールバック関数
 */
export async function subscribeBlocks(
    onBlock: (header: Header, api: ApiPromise) => void | Promise<void>
): Promise<void> {

    console.log(`[midnight-indexer] 🔌 Subscribing to blocks...`);

    const api = await connectToChain();
    await api.rpc.chain.subscribeNewHeads(async (header) => {
        await onBlock(header, api);
    });
}

/**
 * ファイナライズされたブロックを購読します。
 * @param onFinalizedBlock ファイナライズされたブロックが受信されたときに呼び出されるコールバック関数
 */
export async function subscribeFinalizedBlocks(
    onFinalizedBlock: (header: Header, api: ApiPromise) => void | Promise<void>
): Promise<void>
{
    console.log(`[midnight-indexer] 🔌 Subscribing to finalized blocks...`);

    const api = await connectToChain();
    await api.rpc.chain.subscribeFinalizedHeads(async (header) => {
        await onFinalizedBlock(header, api);
    });
}

/**
 * すべてのブロックを購読します。
 * @param onBlock 新しいブロックが受信されたときに呼び出されるコールバック関数
 */
export async function subscribe(
    onBlock: (header: Header, api: ApiPromise) => void | Promise<void>,
    onFinalizedBlock: (header: Header, api: ApiPromise) => void | Promise<void>
): Promise<void>
{
    console.log(`[midnight-indexer] 🔌 Subscribing to blocks...`);
    const api = await connectToChain();

    await api.rpc.chain.subscribeNewHeads(async (header) => {
        await onBlock(header, api);
    });

    await api.rpc.chain.subscribeFinalizedHeads(async (header) => {
        await onFinalizedBlock(header, api);
    });
}

/**
 * ブロック高を取得します。
 * @param header ブロック高を取得したいヘッダー
 * @returns ブロック高
 */
export function getBlockHeight(header: Header): number {
    return header.number.toNumber();
}

/**
 * ブロックハッシュを取得します。
 * @param height ブロック高
 * @returns ブロックハッシュ
 */
export async function getBlockHashFromHeight(height: number): Promise<BlockHash> {
    if (!api || !api.isConnected) {
        api =await connectToChain();
    }
    return await api.rpc.chain.getBlockHash(height);
}

/**
 * ブロックハッシュからブロックを取得します。
 * @param hash ブロックハッシュ
 * @returns ブロック
 */
export async function getBlockFromHash(hash: BlockHash): Promise<SignedBlock> {
    if (!api || !api.isConnected) {
        api =await connectToChain();
    }
    return await api.rpc.chain.getBlock(hash);
}

/**
 * ブロックハッシュからタイムスタンプを取得します。
 * @param hash ブロックハッシュ
 * @returns タイムスタンプ
 */
export async function blockHashToTimestamp(hash: BlockHash): Promise<number> {
    if (!api || !api.isConnected) {
        console.log(`[midnight-indexer] 🔍 Connecting to chain...`);
        api =await connectToChain();
    }
    try {
        return Number(await api.query.timestamp.now.at(hash));
    } catch (error: any) {
        console.error('[midnight-indexer] fatal error', error);
        return 0;
    }
}

/**
 * timestampをDateに変換
 * @param timestamp Unix timestamp (ミリ秒単位)
 * @returns Dateオブジェクト（UTC）
 */
export function toDate(timestamp: number): Date | null {
    const dt = new Date(timestamp);
    if (dt.getFullYear() < 2025 || dt.getFullYear() > 2026) {
        const udt = new Date(timestamp * 1000);
        if (udt.getFullYear() < 2025 || udt.getFullYear() > 2026) {
            const ddt = new Date(timestamp / 1000);
            if (ddt.getFullYear() < 2025 || ddt.getFullYear() > 2026) {
                console.warn(`[midnight-indexer] 🔍 Invalid timestamp: ${timestamp}, returning default date: 2025-08-05 12:00:00`);
                return new Date(2025, 8, 5, 12);
//                throw new Error(`Invalid timestamp: ${timestamp}`);
            }
            return ddt;
        }
        return udt;
    }
    return dt;
}


export async function getBlockDataByHeight(height: number): Promise<Block> {
    if (!api || !api.isConnected) {
        api =await connectToChain();
    }
    if (height < 0) {
        throw new Error(`Invalid height: ${height}`);
    }

    const hash = await getBlockHashFromHeight(height);

    const block = await getBlockFromHash(hash);

    return await getBlockData(block.block.header);
}


/**
 * ブロックヘッダーからブロックデータを取得します。
 * @param header ブロックヘッダー
 * @returns ブロックデータ
 */
export async function getBlockData(header: Header): Promise<Block> {
    if (!api || !api.isConnected) {
        api =await connectToChain();
    }

    const hash = await getBlockHashFromHeight(header.number.toNumber());

    const block = await getBlockFromHash(hash);

    const extrinsics: Extrinsic[] = [];
    for (let index = 0; index < block.block.extrinsics.length; index++) {
        const extrinsic = block.block.extrinsics[index];

        const method = extrinsic.method;
        const timestamp = await blockHashToTimestamp(hash);
        const data = {
            index: index,
            blockHeight: header.number.toNumber(),
            blockHash: hash.toString().substring(2).toLowerCase(),
            indexInBlock: index,
            hash: extrinsic.hash.toString().substring(2).toLowerCase(),
            section: extrinsic.method.section,
            method: {
                section: method.section,
                method: method.method,
                args: method.args.map((args: any) => {
                    try {
                        return args.ToHuman ? args.ToHuman() : args.toString();
                    } catch {
                        return args.toString();
                    }
                }),
            },
            signer: extrinsic.signer ? extrinsic.signer.toString() : null,
            signature: extrinsic.signature ? extrinsic.signature.toString() : null,
            era: extrinsic.era ? extrinsic.era.toString() : null,
            nonce: extrinsic.nonce ? extrinsic.nonce.toString() : null,
            tip: extrinsic.tip ? extrinsic.tip.toString() : null,
            isSigned: extrinsic.isSigned,
            length: extrinsic.length,
            data: Buffer.from(extrinsic.data).toString('hex'),
            timestamp: timestamp,
        };

        extrinsics.push(data);
    }

    let parentHash = '0'.repeat(64);
    try {
        parentHash = header.number.toNumber() > 0 ? header.parentHash.toString().substring(2).toLowerCase() : '0'.repeat(62);
    } catch (error: any) {
        console.error('[midnight-indexer] fatal error', error);
        parentHash = '0'.repeat(64);
    }

    return {
        hash: header.hash.toString().substring(2).toLowerCase(),
        height: header.number.toNumber(),
        parentHash: parentHash,
        stateRoot: header.stateRoot.toString().substring(2).toLowerCase(),
        timestamp: await blockHashToTimestamp(hash),
        isFinalized: false,
        extrinsics: extrinsics,
        raw: {
            blockHash: block.block.hash.toString().substring(2).toLowerCase(),
            blockNumber: header.number.toNumber(),
            timestamp: await blockHashToTimestamp(hash),
            header: {
                header: header.toString(),
                number: header.number.toString(),
                parentHash: parentHash,
                stateRoot: header.stateRoot.toString().substring(2).toLowerCase(),
                extrinsicsRoot: header.extrinsicsRoot.toString().substring(2).toLowerCase(),
                digest: header.digest.toString(),
                encodedLength: header.encodedLength,
                isEmpty: header.isEmpty,
                registry: (header.registry as any).chainSS58 || null,
            },
            extrinsicsCount: extrinsics.length,
            events: [],
            eventsCount: 0,
            justifications: null,
            encodedLength: block.block.encodedLength,
            isEmpty: block.block.isEmpty,
        },
    };
}
