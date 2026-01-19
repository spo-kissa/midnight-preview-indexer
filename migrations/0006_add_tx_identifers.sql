-- =========================================================
-- Migration: Add tx_identifiers table for application state management
-- =========================================================

SET search_path TO mn_preview_indexer;

CREATE TABLE IF NOT EXISTS tx_identifiers (
    id BIGSERIAL PRIMARY KEY,
    tx_id BIGINT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    tx_hash VARCHAR(66) NOT NULL,
    index_in_tx INT NOT NULL,
    identifier VARCHAR(66) NOT NULL,

    UNIQUE (tx_id, index_in_tx)
);

CREATE INDEX IF NOT EXISTS idx_tx_identifiers_tx_id ON tx_identifiers(tx_id);
CREATE INDEX IF NOT EXISTS idx_tx_identifiers_tx_hash ON tx_identifiers(tx_hash);
CREATE INDEX IF NOT EXISTS idx_tx_identifiers_identifier ON tx_identifiers(identifier);
