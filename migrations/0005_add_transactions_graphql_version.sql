-- =========================================================
-- Migration: Add GraphQL version columns to transactions table
-- =========================================================

SET search_path TO mn_preview_indexer;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS block_height BIGINT;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS block_hash VARCHAR(66);

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS protocol_version INT NOT NULL DEFAULT 0;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transaction_id BIGINT;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS start_index INT NOT NULL DEFAULT 0;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS end_index INT NOT NULL DEFAULT 0;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS paid_fees TEXT;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS estimated_fees TEXT;

ALTER TABLE transactions ALTER COLUMN status TYPE VARCHAR(50) USING status::TEXT;
ALTER TABLE transactions ALTER COLUMN status SET DEFAULT 'SUCCESS';

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS unshielded_total_input NUMERIC(17, 0) NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS unshielded_total_output NUMERIC(17, 0) NOT NULL DEFAULT 0;

ALTER TABLE transactions ALTER COLUMN
    "raw" TYPE TEXT;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS
    block_ledger_parameters TEXT;