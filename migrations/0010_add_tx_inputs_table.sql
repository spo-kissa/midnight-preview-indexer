-- =========================================================
-- Migration: Add columns to tx_inputs table
-- =========================================================

SET search_path TO mn_preview_indexer;

-- 
ALTER TABLE tx_inputs ADD COLUMN IF NOT EXISTS
    address_id BIGINT REFERENCES addresses(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tx_inputs_address_id ON tx_inputs(address_id);

ALTER TABLE tx_inputs ADD COLUMN IF NOT EXISTS
    created_at_tx_hash VARCHAR(66);

ALTER TABLE tx_inputs ADD COLUMN IF NOT EXISTS
    spent_at_tx_hash VARCHAR(66);

ALTER TABLE tx_inputs ADD COLUMN IF NOT EXISTS
    intent_hash VARCHAR(66);

ALTER TABLE tx_inputs ADD COLUMN IF NOT EXISTS
    ctime TIMESTAMPTZ;

ALTER TABLE tx_outputs ADD COLUMN IF NOT EXISTS
    initial_nonce VARCHAR(66);

ALTER TABLE tx_inputs ADD COLUMN IF NOT EXISTS
    registered_for_dust_generation BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE tx_inputs ADD COLUMN IF NOT EXISTS
    token_type VARCHAR(66);

ALTER TABLE tx_inputs ADD COLUMN IF NOT EXISTS
    spent_at_transaction_id BIGINT REFERENCES transactions(id) ON DELETE SET NULL;

ALTER TABLE tx_inputs ADD COLUMN IF NOT EXISTS
    spent_at_transaction_hash VARCHAR(66);
