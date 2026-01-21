-- =========================================================
-- Migration: Alter transactions table for status column drop not null constraint
-- =========================================================

SET search_path TO mn_preview_indexer;

ALTER TABLE transactions
    ALTER COLUMN protocol_version SET DEFAULT NULL;

ALTER TABLE transactions
    ALTER COLUMN start_index SET DEFAULT NULL;

ALTER TABLE transactions
    ALTER COLUMN end_index SET DEFAULT NULL;
