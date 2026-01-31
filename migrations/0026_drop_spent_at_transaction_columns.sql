-- =========================================================
-- Migration: Drop spent_at_transaction_id
--
-- spent_at_transaction_id はチェーンのトランザクションIDとDBのidが一致しないため問題を引き起こす。
-- spent_at_tx_hash / spent_at_transaction_hash を残し、参照が必要な場合は
-- JOIN transactions t ON t.hash = spent_at_tx_hash で解決する。
-- =========================================================

SET search_path TO mn_preview_indexer;

-- tx_outputs: FK付きの spent_at_transaction_id を削除
ALTER TABLE tx_outputs
    DROP CONSTRAINT IF EXISTS tx_outputs_spent_at_transaction_id_fkey;
