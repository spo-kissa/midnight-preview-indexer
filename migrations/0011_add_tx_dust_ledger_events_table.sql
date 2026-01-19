-- =========================================================
-- Migration: Add tx_dust_ledger_events table for transaction dust ledger events management
-- =========================================================

SET search_path TO mn_preview_indexer;

CREATE TABLE IF NOT EXISTS tx_dust_ledger_events (
    id BIGSERIAL PRIMARY KEY,
    tx_id BIGINT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    index_in_tx INT NOT NULL,
    event_id INT NOT NULL,
    event_name INT NOT NULL,
    event_raw TEXT NOT NULL,

    output_nonce VARCHAR(66) DEFAULT NULL,

    UNIQUE (tx_id, index_in_tx)
);

CREATE INDEX IF NOT EXISTS idx_tx_dust_ledger_events_tx_id ON tx_dust_ledger_events(tx_id);
CREATE INDEX IF NOT EXISTS idx_tx_dust_ledger_events_index_in_tx ON tx_dust_ledger_events(index_in_tx);
CREATE INDEX IF NOT EXISTS idx_tx_dust_ledger_events_event_id ON tx_dust_ledger_events(event_id);
CREATE INDEX IF NOT EXISTS idx_tx_dust_ledger_events_event_name ON tx_dust_ledger_events(event_name);
