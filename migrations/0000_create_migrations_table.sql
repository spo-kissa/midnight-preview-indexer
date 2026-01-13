-- =========================================================
-- Migration: Create migrations tracking table
-- =========================================================

-- マイグレーション管理テーブルはpublicスキーマに明示的に作成
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at 
  ON schema_migrations (applied_at DESC);
