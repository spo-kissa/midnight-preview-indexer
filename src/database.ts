
import { Pool, type PoolClient, type PoolConfig } from "pg";
import { Block, Extrinsic } from "types/chain";

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
  const raw = (process.env.PGSSLMODE ?? process.env.PGSSL ?? "").toLowerCase();

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
  } catch (error) {
    await pool.end().catch(() => {
      // ignore secondary errors
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

export async function initializeDatabase(): Promise<void> {
    await pool?.query(`CREATE TABLE IF NOT EXISTS blocks (
        height BIGINT PRIMARY KEY,
        hash VARCHAR(64) NOT NULL,
        parent_hash VARCHAR(64) NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        extrinsics_count INT DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);

    await pool?.query(`CREATE TABLE IF NOT EXISTS extrinsics (
        id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        hash VARCHAR(64) NOT NULL,
        block_height BIGINT NOT NULL,
        block_hash VARCHAR(64) NOT NULL,
        index_in_block INT NOT NULL,
        section TEXT NOT NULL,
        method TEXT NOT NULL,
        args TEXT NOT NULL,
        data TEXT,
        success INT NOT NULL DEFAULT 1,
        timestamp TIMESTAMP NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (block_height) REFERENCES blocks (height)
    )`);

    await pool?.query(`CREATE TABLE IF NOT EXISTS indexer_state (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL
    )`);

    await pool?.query(`CREATE INDEX IF NOT EXISTS idx_blocks_hash ON blocks(hash)`);
    await pool?.query('CREATE INDEX IF NOT EXISTS idx_extrinsics_hash ON extrinsics(hash)');
    await pool?.query(`CREATE INDEX IF NOT EXISTS idx_extrinsics_block_height ON extrinsics(block_height)`);
    await pool?.query(`CREATE INDEX IF NOT EXISTS idx_extrinsics_block_hash ON extrinsics(block_hash)`);
    await pool?.query(`CREATE INDEX IF NOT EXISTS idx_extrinsics_section ON extrinsics(section)`);
    await pool?.query(`CREATE INDEX IF NOT EXISTS idx_indexer_state_key ON indexer_state(key)`);

    console.log('✅ Database initialized');
}


export async function getState(key: string): Promise<string | null> {
    const row = await pool?.query<{ value: string }>(`SELECT value FROM indexer_state WHERE key = $1`, [key]);
    return row?.rows[0]?.value ?? null;
}

export async function setState(key: string, value: string): Promise<void> {
    await pool?.query(`INSERT INTO indexer_state (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2`, [key, value]);
}

export async function insertBlock(block: Block): Promise<void> {
    await pool?.query(`INSERT INTO blocks
        (height, hash, parent_hash, timestamp, extrinsics_count)
        VALUES ($1, $2, $3, $4, $5)`,
        [block.height, block.hash, block.parent_hash, new Date(block.timestamp), block.extrinsics_count]
    );
}

export async function insertExtrinsic(extrinsic: Extrinsic): Promise<void> {
    await pool?.query(`INSERT INTO extrinsics
        (hash, block_height, block_hash, index_in_block, section, method, args, data, success, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [extrinsic.hash, extrinsic.block_height, extrinsic.block_hash, extrinsic.index_in_block, extrinsic.section, extrinsic.method, extrinsic.args, extrinsic.data, extrinsic.success, new Date(extrinsic.timestamp)]
    );
}

export async function getLastBlockNumber(): Promise<number> {
    const row = await pool?.query<{ value: number }>(`SELECT MAX(height) AS value FROM blocks`);
    return row?.rows[0]?.value ?? 0;
}
