-- =========================================================
-- Migration: Drop extrinsics table for extrinsics not null constraints
-- =========================================================

SET search_path TO mn_preview_indexer;

ALTER TABLE extrinsics
    ALTER COLUMN raw DROP NOT NULL;
