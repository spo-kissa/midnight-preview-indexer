import { request, gql } from 'graphql-request';
import { createClient } from 'graphql-ws';
import WebSocket from 'ws';
import type {
    GetBlockByHeightQuery,
    GetBlockByHeightQueryVariables,
    SystemTransaction,
    RegularTransaction,
    BlocksSubscriptionVariables,
    BlocksSubscription,
    ConnectWalletMutationVariables,
    ConnectWalletMutation,
    DisconnectWalletMutationVariables,
    DisconnectWalletMutation
} from './graphql/generated';
import {
    GetBlockByHeightDocument,
    BlocksDocument,
    ConnectWalletDocument,
    DisconnectWalletDocument
} from './graphql/generated';
import { print } from 'graphql';

const MIDNIGHT_GRAPHQL_URL = process.env.MIDNIGHT_GRAPHQL_URL || 'https://indexer.preview.midnight.network/api/v3/graphql';
// WebSocketエンドポイント: 環境変数が指定されていない場合は、複数の候補を試す
function getWebSocketUrl(): string {
    if (process.env.MIDNIGHT_GRAPHQL_WS_URL) {
        return process.env.MIDNIGHT_GRAPHQL_WS_URL;
    }
    
    // HTTPエンドポイントと同じパスを使用（多くのGraphQLサーバーでこれが標準）
    // const baseUrl = MIDNIGHT_GRAPHQL_URL.replace(/^https?:\/\//, 'wss://').replace(/^http:\/\//, 'ws://') + '/ws';
    return 'wss://indexer.preview.midnight.network/api/v3/graphql'; //baseUrl;
}

const MIDNIGHT_GRAPHQL_WS_URL = getWebSocketUrl();


/**
 * ブロックを高さから取得します。
 * @param height ブロック高さ
 * @returns ブロックデータ
 */
export async function getBlockByHeight(
    height: number
): Promise<GetBlockByHeightQuery['block']>
{
    var variables: GetBlockByHeightQueryVariables = { height };
    const data: GetBlockByHeightQuery = await request(
        MIDNIGHT_GRAPHQL_URL,
        GetBlockByHeightDocument,
        variables
    );
    return data.block;
}


/**
 * ブロックを購読します（GraphQL WebSocketサブスクリプション）。
 * @param onBlock ブロックが受信されたときに呼び出されるコールバック関数
 * @returns サブスクリプションを停止する関数
 */
export function subscribeBlocksGraphQL(
    onBlock: (block: BlocksSubscription['blocks']) => void | Promise<void>
): () => void {
    console.log(`[GraphQL Subscription] Connecting to WebSocket: ${MIDNIGHT_GRAPHQL_WS_URL}`);
    console.log(`[GraphQL Subscription] Note: If you get a 503 error, the WebSocket endpoint might be different.`);
    console.log(`[GraphQL Subscription] Try setting MIDNIGHT_GRAPHQL_WS_URL environment variable to:`);
    console.log(`[GraphQL Subscription]   - wss://indexer.preview.midnight.network/api/v3/graphql (same as HTTP)`);
    console.log(`[GraphQL Subscription]   - wss://indexer.preview.midnight.network/api/v3/graphql/ws`);
    console.log(`[GraphQL Subscription]   - wss://indexer.preview.midnight.network/api/v3/graphql/subscriptions`);
    
    const client = createClient({
        url: MIDNIGHT_GRAPHQL_WS_URL,
        webSocketImpl: WebSocket,
        connectionParams: {},
        shouldRetry: () => true,
        retryAttempts: Infinity,
        retryWait: async (retries: number) => {
            // 指数バックオフでリトライ: 1秒、2秒、4秒、8秒、16秒...
            const delay = Math.min(1000 * Math.pow(2, retries - 1), 30000); // 最大30秒
            await new Promise(resolve => setTimeout(resolve, delay));
        },
        on: {
            opened: () => {
                console.log('[GraphQL Subscription] ✅ WebSocket connection opened');
            },
            closed: () => {
                console.log('[GraphQL Subscription] ❌ WebSocket connection closed');
            },
            error: (err) => {
                console.error('[GraphQL Subscription] ❌ WebSocket connection error:', err);
            },
        },
    });

    let disposed = false;

    const unsubscribe = client.subscribe<BlocksSubscription>(
        {
            query: print(BlocksDocument),
            variables: {},
        },
        {
            next: (data) => {
                if (data.data?.blocks && !disposed) {
                    onBlock(data.data.blocks);
                }
            },
            error: (err: unknown) => {
                if (!disposed) {
                    // エラーの詳細を出力
                    if (err instanceof Error) {
                        console.error('[GraphQL Subscription] Error:', err.message);
                        console.error('[GraphQL Subscription] Stack:', err.stack);
                    } else if (err && typeof err === 'object' && 'message' in err) {
                        const errorMessage = (err as { message: string }).message;
                        console.error('[GraphQL Subscription] Error:', errorMessage);
                        
                        // 503エラーの場合は特別なメッセージを表示
                        if (errorMessage.includes('503')) {
                            console.error('[GraphQL Subscription] 💡 Tip: The WebSocket endpoint might be incorrect or the server might not support WebSocket subscriptions.');
                            console.error('[GraphQL Subscription] 💡 Please check the Midnight GraphQL API documentation for the correct WebSocket endpoint URL.');
                        }
                    } else {
                        console.error('[GraphQL Subscription] Error:', err);
                    }
                }
            },
            complete: () => {
                if (!disposed) {
                    console.log('[GraphQL Subscription] Completed');
                }
            },
        }
    );

    // サブスクリプションを停止する関数を返す
    return () => {
        disposed = true;
        unsubscribe(); // subscribe()は() => voidを返す
        client.dispose();
    };
}


/**
 * ウォレットを接続します。
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
