-- =========================================================
-- Migration: Drop foreign key tx_inputs_spent_at_transaction_id_fkey
-- =========================================================

SET search_path TO mn_preview_indexer;

ALTER TABLE tx_inputs
    DROP CONSTRAINT tx_inputs_spent_at_transaction_id_fkey;
