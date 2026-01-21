-- =========================================================
-- Migration: Alter tx_dust_ledger_events table for event_name column drop not null constraint
-- =========================================================

SET search_path TO mn_preview_indexer;

ALTER TABLE tx_dust_ledger_events
    ALTER COLUMN event_name DROP NOT NULL;
