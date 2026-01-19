-- =========================================================
-- Migration: Add tx_results table for transaction result management
-- =========================================================

SET search_path TO mn_preview_indexer;

CREATE TABLE IF NOT EXISTS tx_results (
    id BIGSERIAL PRIMARY KEY,
    tx_id BIGINT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    tx_hash VARCHAR(66) NOT NULL,
    segment_id INT NOT NULL,
    success BOOLEAN NOT NULL,

    UNIQUE (tx_id, segment_id)
);

CREATE INDEX IF NOT EXISTS idx_tx_results_tx_id ON tx_results(tx_id);
CREATE INDEX IF NOT EXISTS idx_tx_results_tx_hash ON tx_results(tx_hash);
CREATE INDEX IF NOT EXISTS idx_tx_results_segment_id ON tx_results(segment_id);
