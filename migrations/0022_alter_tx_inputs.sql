-- =========================================================
-- Migration: Alter tx_ table for event_name column drop not null constraint
-- =========================================================

SET search_path TO mn_preview_indexer;

ALTER TABLE tx_inputs
    ADD COLUMN initial_nonce VARCHAR(66);
