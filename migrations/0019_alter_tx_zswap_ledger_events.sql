-- =========================================================
-- Migration: Alter name zswap_ledger_events table to tx_zswap_ledger_events
-- =========================================================

SET search_path TO mn_preview_indexer;

ALTER TABLE zswap_ledger_events RENAME TO tx_zswap_ledger_events;
