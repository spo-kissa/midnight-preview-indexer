import type { ConnectionOptions } from "tls";

declare module "pg" {
  interface QueryResult<R = any> {
    rows: R[];
    rowCount: number;
    command: string;
  }

  interface QueryConfig {
    text: string;
    values?: unknown[];
  }

  interface PoolConfig {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
    application_name?: string;
    ssl?: boolean | ConnectionOptions;
  }

  interface PoolClient {
    release(): void;
    query<R = any>(queryText: string, values?: unknown[]): Promise<QueryResult<R>>;
    query<R = any>(config: QueryConfig): Promise<QueryResult<R>>;
  }

  class Pool {
    constructor(config?: PoolConfig);
    connect(): Promise<PoolClient>;
    query<R = any>(queryText: string, values?: unknown[]): Promise<QueryResult<R>>;
    query<R = any>(config: QueryConfig): Promise<QueryResult<R>>;
    end(): Promise<void>;
    on(event: "error", listener: (err: Error, client: PoolClient) => void): this;
  }

  export { Pool, PoolClient, PoolConfig, QueryConfig, QueryResult };
  export default Pool;
}

