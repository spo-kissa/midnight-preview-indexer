-- =========================================================
-- Migration: Drop accounts table and related foreign key constraints
-- =========================================================

SET search_path TO mn_preview_indexer;

-- 1. tx_contract_actionsテーブルのaddress_idへの外部キー制約を削除
ALTER TABLE tx_contract_actions
    DROP CONSTRAINT IF EXISTS tx_contract_actions_address_id_fkey;

-- 2. account_balancesテーブルのaccount_idへの外部キー制約を削除
ALTER TABLE account_balances
    DROP CONSTRAINT IF EXISTS account_balances_account_id_fkey;

-- 3. account_txテーブルのaccount_idへの外部キー制約を削除
ALTER TABLE account_tx
    DROP CONSTRAINT IF EXISTS account_tx_account_id_fkey;

-- 4. accountsテーブルを削除
DROP TABLE IF EXISTS accounts CASCADE;
