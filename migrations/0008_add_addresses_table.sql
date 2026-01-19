-- =========================================================
-- Migration: Add addresses table
-- =========================================================

SET search_path TO mn_preview_indexer;

CREATE TABLE IF NOT EXISTS addresses (
    id BIGSERIAL PRIMARY KEY,

    unshielded_address VARCHAR(100) NOT NULL UNIQUE,
    unshielded_address_hex VARCHAR(66) NOT NULL UNIQUE,

    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
