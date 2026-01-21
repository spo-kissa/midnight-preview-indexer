-- =========================================================
-- Migration: Add tx_inputs table for transaction inputs management
-- =========================================================

SET search_path TO mn_preview_indexer;

ALTER TABLE tx_inputs ADD COLUMN IF NOT EXISTS
    account_addr VARCHAR(128);

ALTER TABLE tx_inputs ADD COLUMN IF NOT EXISTS
    value NUMERIC(38,0);

ALTER TABLE tx_inputs ADD COLUMN IF NOT EXISTS
    shielded BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_tx_inputs_account_addr ON tx_inputs(account_addr);
CREATE INDEX IF NOT EXISTS idx_tx_inputs_value ON tx_inputs(value);
CREATE INDEX IF NOT EXISTS idx_tx_inputs_shielded ON tx_inputs(shielded);
