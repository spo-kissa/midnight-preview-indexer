-- =========================================================
-- Migration: Add GraphQL version columns to blocks table
-- =========================================================

SET search_path TO mn_preview_indexer;

-- authorカラムを追加（ブロック作成者のアドレス、16進数エンコード）
ALTER TABLE blocks ADD COLUMN IF NOT EXISTS author VARCHAR(66);

-- protocol_versionカラムを追加（プロトコルバージョン）
ALTER TABLE blocks ADD COLUMN IF NOT EXISTS protocol_version INT NOT NULL DEFAULT 0;

-- authorカラムにインデックスを作成（検索用）
CREATE INDEX IF NOT EXISTS idx_blocks_author ON blocks (author);

-- ledger_parametersカラムを追加（レジャーパラメータ、16進数エンコード）
ALTER TABLE blocks ADD COLUMN IF NOT EXISTS ledger_parameters TEXT;
