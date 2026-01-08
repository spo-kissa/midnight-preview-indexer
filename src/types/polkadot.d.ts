import "@polkadot/rpc-provider/types";

declare module "@polkadot/rpc-provider/types" {
  interface ProviderInterface {
    readonly ttl?: number | null | undefined;
  }
}

