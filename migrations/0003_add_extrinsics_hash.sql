-- =========================================================
-- Migration: Add hash column to extrinsics table
-- =========================================================

SET search_path TO mn_preview_indexer;

ALTER TABLE extrinsics ADD COLUMN IF NOT EXISTS hash VARCHAR(66);

CREATE INDEX IF NOT EXISTS idx_extrinsics_hash ON extrinsics (hash);
