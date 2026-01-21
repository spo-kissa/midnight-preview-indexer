-- =========================================================
-- Migration: Add tx_contract_actions table for contract actions management
-- =========================================================

SET search_path TO mn_preview_indexer;

CREATE TABLE IF NOT EXISTS tx_contract_actions (
    id BIGSERIAL PRIMARY KEY,
    tx_id BIGINT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    index_in_tx INT NOT NULL,
    type_name VARCHAR(50),
    address VARCHAR(66) NOT NULL,
    address_id BIGINT REFERENCES accounts(id) ON DELETE CASCADE,
    state TEXT NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    zswap_state TEXT NOT NULL,
    deploy TEXT DEFAULT NULL,
    entry_point TEXT DEFAULT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_contract_actions_tx_id_index_index_in_tx ON tx_contract_actions(tx_id, index_in_tx);
CREATE INDEX IF NOT EXISTS idx_tx_contract_actions_tx_hash ON tx_contract_actions(tx_hash);
CREATE INDEX IF NOT EXISTS idx_tx_contract_actions_address_id ON tx_contract_actions(address_id);

CREATE TABLE IF NOT EXISTS tx_contract_action_balances (
    id BIGSERIAL PRIMARY KEY,
    type_name VARCHAR(50) NOT NULL,
    tx_contract_action_id BIGINT NOT NULL REFERENCES tx_contract_actions(id) ON DELETE CASCADE,
    token_type VARCHAR(50) NOT NULL,
    amount NUMERIC(38,0) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_contract_action_balances_tx_contract_action_id_type_name ON tx_contract_action_balances(tx_contract_action_id, type_name);