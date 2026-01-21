-- =========================================================
-- Migration: Alter transactions table for status column drop not null constraint
-- =========================================================

SET search_path TO mn_preview_indexer;

ALTER TABLE transactions
    ALTER COLUMN status DROP NOT NULL;
