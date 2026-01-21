-- =========================================================
-- Migration: Add extrinsics table for extrinsics management
-- =========================================================

SET search_path TO mn_preview_indexer;

ALTER TABLE extrinsics ADD COLUMN IF NOT EXISTS
    data TEXT;
