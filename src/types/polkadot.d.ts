import "@polkadot/rpc-provider/types";
import { RpcInterface } from "@polkadot/rpc-core/types";

declare module "@polkadot/rpc-provider/types" {
  interface ProviderInterface {
    readonly ttl?: number | null | undefined;
  }
}

// カスタムRPCメソッドの型定義を拡張
declare module "@polkadot/api/types" {
  interface RpcInterface {
    archive_v1: {
      body: RpcMethod<(hash?: string) => Promise<any>>;
      call: RpcMethod<(call: any, at?: string) => Promise<any>>;
      finalizedHeight: RpcMethod<() => Promise<any>>;
      genesisHash: RpcMethod<() => Promise<any>>;
      hashByHeight: RpcMethod<(height: number) => Promise<any>>;
      header: RpcMethod<(hash?: string) => Promise<any>>;
      stopStorage: RpcMethod<(subscriptionId: string) => Promise<any>>;
      storage: RpcMethod<(key: string, hash?: string) => Promise<any>>;
      storageDiff: RpcMethod<(key: string, hash?: string) => Promise<any>>;
      storageDiff_stopStorageDiff: RpcMethod<(subscriptionId: string) => Promise<any>>;
    };
    chainHead_v1: {
      body: RpcMethod<(subscriptionId: string, blockHash: string) => Promise<any>>;
      call: RpcMethod<(subscriptionId: string, call: any, blockHash: string) => Promise<any>>;
      continue: RpcMethod<(subscriptionId: string, operationId: string) => Promise<any>>;
      follow: RpcMethod<(withRuntime: boolean) => Promise<any>>;
      header: RpcMethod<(subscriptionId: string, blockHash: string) => Promise<any>>;
      stopOperation: RpcMethod<(subscriptionId: string, operationId: string) => Promise<any>>;
      storage: RpcMethod<(subscriptionId: string, blockHash: string, key: string) => Promise<any>>;
      unfollow: RpcMethod<(subscriptionId: string) => Promise<any>>;
      unpin: RpcMethod<(subscriptionId: string, blockHash: string) => Promise<any>>;
    };
    chainSpec_v1: {
      chainName: RpcMethod<() => Promise<any>>;
      genesisHash: RpcMethod<() => Promise<any>>;
      properties: RpcMethod<() => Promise<any>>;
    };
    midnight: {
      apiVersions: RpcMethod<() => Promise<any>>;
      contractState: RpcMethod<(contractId: string, at?: string) => Promise<any>>;
      dustRootHistory: RpcMethod<(at?: string) => Promise<any>>;
      ledgerVersion: RpcMethod<(at?: string) => Promise<any>>;
      zswapStateRoot: RpcMethod<(at?: string) => Promise<any>>;
    };
    sidechain: {
      getAriadneParameters: RpcMethod<(at?: string) => Promise<any>>;
      getEpochCommittee: RpcMethod<(epoch: number, at?: string) => Promise<any>>;
      getParams: RpcMethod<(at?: string) => Promise<any>>;
      getRegistrations: RpcMethod<(at?: string) => Promise<any>>;
      getStatus: RpcMethod<(at?: string) => Promise<any>>;
    };
    transactionWatch_v1: {
      submitAndWatch: RpcMethod<(tx: any) => Promise<any>>;
      unwatch: RpcMethod<(subscriptionId: string) => Promise<any>>;
    };
    transaction_v1: {
      broadcast: RpcMethod<(tx: any) => Promise<any>>;
      stop: RpcMethod<(subscriptionId: string) => Promise<any>>;
    };
  }
}

// RpcMethodのヘルパー型
type RpcMethod<T extends (...args: any[]) => Promise<any>> = T;
