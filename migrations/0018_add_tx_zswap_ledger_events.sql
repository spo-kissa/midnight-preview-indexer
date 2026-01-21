-- =========================================================
-- Migration: Add zswap_ledger_events table for zswap ledger events management
-- =========================================================

SET search_path TO mn_preview_indexer;

CREATE TABLE IF NOT EXISTS zswap_ledger_events (
    tx_id BIGINT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    index_in_tx INT NOT NULL,
    type_name VARCHAR(255),
    event_id INT NOT NULL,
    max_id INT NOT NULL,
    raw TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_zswap_ledger_events_tx_id_index_event_id ON zswap_ledger_events(tx_id, index_in_tx, event_id);
CREATE INDEX IF NOT EXISTS idx_zswap_ledger_events_tx_id_index ON zswap_ledger_events(tx_id, index_in_tx);
CREATE INDEX IF NOT EXISTS idx_zswap_ledger_events_event_id ON zswap_ledger_events(event_id);
CREATE INDEX IF NOT EXISTS idx_zswap_ledger_events_max_id ON zswap_ledger_events(max_id);
