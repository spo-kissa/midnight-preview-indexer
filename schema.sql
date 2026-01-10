-- =========================================================
-- Midnight Explorer DB Schema
-- =========================================================

-- 任意: 専用スキーマを作る場合
CREATE SCHEMA IF NOT EXISTS mn_preview_explorer;
SET search_path TO mn_preview_explorer, public;

-- =========================================================
-- 1. Blocks
-- =========================================================

CREATE TABLE IF NOT EXISTS blocks (
    id              BIGSERIAL PRIMARY KEY,
    hash            VARCHAR(66)  NOT NULL UNIQUE,
    height          BIGINT       NOT NULL UNIQUE,
    parent_hash     VARCHAR(66)  NOT NULL,
    slot            BIGINT       NOT NULL,
    timestamp       TIMESTAMPTZ  NOT NULL,
    tx_count        INT          NOT NULL DEFAULT 0,
    state_root      VARCHAR(66),
    is_finalized    BOOLEAN      NOT NULL DEFAULT FALSE,
    raw             JSONB        NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_blocks_timestamp_desc ON blocks (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_blocks_parent_hash    ON blocks (parent_hash);

-- =========================================================
-- 2. Transactions
-- =========================================================

CREATE TABLE IF NOT EXISTS transactions (
    id               BIGSERIAL PRIMARY KEY,
    hash             VARCHAR(66)  NOT NULL UNIQUE,
    block_id         BIGINT       NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
    index_in_block   INT          NOT NULL,
    timestamp        TIMESTAMPTZ  NOT NULL,
    is_shielded      BOOLEAN      NOT NULL DEFAULT FALSE,
    fee              NUMERIC(38,0),
    total_input      NUMERIC(38,0),
    total_output     NUMERIC(38,0),
    status           SMALLINT     NOT NULL DEFAULT 1,   -- 1: committed, 0: pending etc.
    raw              JSONB        NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_txs_block_id_index ON transactions (block_id, index_in_block);
CREATE INDEX IF NOT EXISTS idx_txs_timestamp      ON transactions (timestamp DESC);

-- =========================================================
-- 3. Transaction Outputs
-- =========================================================

CREATE TABLE IF NOT EXISTS tx_outputs (
    id               BIGSERIAL PRIMARY KEY,
    tx_id            BIGINT       NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    index            INT          NOT NULL,
    account_addr     VARCHAR(128),
    asset_id         VARCHAR(128) NOT NULL DEFAULT 'MID',
    value            NUMERIC(38,0) NOT NULL,
    shielded         BOOLEAN      NOT NULL DEFAULT FALSE,
    note_commitment  VARCHAR(128),
    raw              JSONB        NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_outputs_tx_index
  ON tx_outputs (tx_id, index);

CREATE INDEX IF NOT EXISTS idx_tx_outputs_addr
  ON tx_outputs (account_addr);

-- =========================================================
-- 4. Transaction Inputs
-- =========================================================

CREATE TABLE IF NOT EXISTS tx_inputs (
    id                BIGSERIAL PRIMARY KEY,
    tx_id             BIGINT       NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    index             INT          NOT NULL,
    prev_tx_hash      VARCHAR(66),
    prev_tx_output_ix INT,
    prev_output_id    BIGINT       REFERENCES tx_outputs(id),
    raw               JSONB        NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_inputs_tx_index
  ON tx_inputs (tx_id, index);

CREATE INDEX IF NOT EXISTS idx_tx_inputs_prev_ref
  ON tx_inputs (prev_tx_hash, prev_tx_output_ix);

-- =========================================================
-- 5. Accounts
-- =========================================================

CREATE TABLE IF NOT EXISTS accounts (
    id                   BIGSERIAL PRIMARY KEY,
    address              VARCHAR(128) NOT NULL UNIQUE,
    first_seen_block_id  BIGINT REFERENCES blocks(id),
    last_seen_block_id   BIGINT REFERENCES blocks(id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================
-- 6. Account Balances (Snapshots)
-- =========================================================

CREATE TABLE IF NOT EXISTS account_balances (
    id          BIGSERIAL PRIMARY KEY,
    account_id  BIGINT       NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    asset_id    VARCHAR(128) NOT NULL DEFAULT 'MID',
    block_id    BIGINT       NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
    balance     NUMERIC(38,0) NOT NULL,
    UNIQUE (account_id, asset_id, block_id)
);

CREATE INDEX IF NOT EXISTS idx_acc_bal_account_latest
  ON account_balances (account_id, asset_id, block_id DESC);

-- =========================================================
-- 7. Account ↔ Tx Mapping
-- =========================================================

CREATE TABLE IF NOT EXISTS account_tx (
    id          BIGSERIAL PRIMARY KEY,
    account_id  BIGINT   NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    tx_id       BIGINT   NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    block_id    BIGINT   NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
    direction   SMALLINT NOT NULL,          -- 0: unknown, 1: in, 2: out, 3: self
    value       NUMERIC(38,0),
    UNIQUE (account_id, tx_id)
);

CREATE INDEX IF NOT EXISTS idx_account_tx_account_block
  ON account_tx (account_id, block_id DESC, tx_id);

-- =========================================================
-- 8. Shielded Notes
-- =========================================================

CREATE TABLE IF NOT EXISTS shielded_notes (
    id               BIGSERIAL PRIMARY KEY,
    commitment       VARCHAR(128) NOT NULL UNIQUE,
    asset_id         VARCHAR(128) NOT NULL DEFAULT 'MID',
    value            NUMERIC(38,0) NOT NULL,
    created_tx_id    BIGINT       NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    created_block_id BIGINT       NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
    spent_tx_id      BIGINT       REFERENCES transactions(id) ON DELETE SET NULL,
    spent_block_id   BIGINT       REFERENCES blocks(id) ON DELETE SET NULL,
    nullifier        VARCHAR(128),
    status           SMALLINT     NOT NULL DEFAULT 0,  -- 0: unspent, 1: spent
    raw              JSONB        NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_status_value
  ON shielded_notes (status, value DESC);

CREATE INDEX IF NOT EXISTS idx_notes_nullifier
  ON shielded_notes (nullifier);

CREATE INDEX IF NOT EXISTS idx_notes_created_block
  ON shielded_notes (created_block_id DESC);

-- =========================================================
-- 9. Extrinsics
-- =========================================================

CREATE TABLE IF NOT EXISTS extrinsics (
    id             BIGSERIAL PRIMARY KEY,
    block_id       BIGINT       NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
    index_in_block INT          NOT NULL,
    section        VARCHAR(64)  NOT NULL,
    method         VARCHAR(64)  NOT NULL,
    signer         VARCHAR(128),
    args           JSONB        NOT NULL,
    raw            JSONB        NOT NULL,
    UNIQUE (block_id, index_in_block)
);

CREATE INDEX IF NOT EXISTS idx_extrinsics_section_method
  ON extrinsics (section, method);

-- =========================================================
-- 10. Events
-- =========================================================

CREATE TABLE IF NOT EXISTS events (
    id              BIGSERIAL PRIMARY KEY,
    block_id        BIGINT       NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
    extrinsic_id    BIGINT       REFERENCES extrinsics(id) ON DELETE SET NULL,
    index_in_block  INT          NOT NULL,
    section         VARCHAR(64)  NOT NULL,
    method          VARCHAR(64)  NOT NULL,
    data            JSONB        NOT NULL,
    topics          JSONB,
    UNIQUE (block_id, index_in_block)
);

CREATE INDEX IF NOT EXISTS idx_events_section_method
  ON events (section, method);

CREATE INDEX IF NOT EXISTS idx_events_topics_gin
  ON events USING GIN (topics);

-- =========================================================
-- EOF
-- =========================================================
