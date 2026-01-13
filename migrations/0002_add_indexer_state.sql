-- =========================================================
-- Migration: Add indexer_state table for application state management
-- =========================================================

SET search_path TO mn_preview_indexer;

CREATE TABLE IF NOT EXISTS indexer_state (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_indexer_state_key ON indexer_state(key);
