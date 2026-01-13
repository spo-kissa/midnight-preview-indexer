import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Pool, PoolClient } from 'pg';
import { connectPostgres, getPostgresPool, withPgClient } from './database';

interface MigrationFile {
  version: string;
  name: string;
  filename: string;
  content: string;
}

/**
 * マイグレーションファイルを読み込む
 */
function loadMigrationFiles(migrationsDir: string): MigrationFile[] {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`マイグレーションディレクトリが見つかりません: ${migrationsDir}`);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  return files.map((filename) => {
    const match = filename.match(/^(\d+)_(.+)\.sql$/);
    if (!match) {
      throw new Error(`不正なマイグレーションファイル名: ${filename} (形式: NNNN_name.sql)`);
    }

    const version = match[1];
    const name = match[2];
    const filePath = path.join(migrationsDir, filename);
    const content = fs.readFileSync(filePath, 'utf-8');

    return { version, name, filename, content };
  });
}

/**
 * 適用済みのマイグレーションを取得
 */
async function getAppliedMigrations(client: PoolClient): Promise<Set<string>> {
  try {
    // publicスキーマのschema_migrationsテーブルから取得
    const result = await client.query<{ version: string }>(
      'SELECT version FROM schema_migrations ORDER BY version'
    );
    return new Set(result.rows.map((r) => r.version));
  } catch (error: any) {
    // schema_migrationsテーブルが存在しない場合は空のセットを返す
    if (error.code === '42P01') {
      return new Set();
    }
    throw error;
  }
}

/**
 * マイグレーション管理テーブルが存在するかチェックし、なければ作成
 */
async function ensureMigrationsTable(client: PoolClient): Promise<void> {
  // publicスキーマのschema_migrationsテーブルをチェック
  const checkResult = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'mn_preview_indexer'
      AND table_name = 'schema_migrations'
    )
  `);

  if (!checkResult.rows[0].exists) {
    console.log('📋 マイグレーション管理テーブルを作成中...');
    await client.query('BEGIN');
    try {
      // search_pathをpublicに設定（トランザクション内でのみ有効）
      await client.query('SET search_path TO mn_preview_indexer');
      
      // テーブルを作成（IF NOT EXISTSを使用しない、エラーは後で処理）
      await client.query(`
        CREATE TABLE schema_migrations (
          version VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      
      // インデックスを作成
      await client.query(`
        CREATE INDEX idx_schema_migrations_applied_at 
        ON schema_migrations (applied_at DESC)
      `);
      
      // テーブルが作成されたことを確認
      const verifyResult = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'mn_preview_indexer'
          AND table_name = 'schema_migrations'
        )
      `);
      
      if (!verifyResult.rows[0].exists) {
        throw new Error('schema_migrationsテーブルの作成に失敗しました');
      }
      
      // 0000_create_migrations_tableマイグレーションを記録
      await client.query(
        'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
        ['0000', 'create_migrations_table']
      );
      
      await client.query('COMMIT');
      console.log('✅ マイグレーション管理テーブルを作成しました');
    } catch (error: any) {
      await client.query('ROLLBACK');
      // テーブルが既に存在する場合はエラーを無視して続行
      if (error.code === '42P07') {
        console.log('ℹ️  schema_migrationsテーブルは既に存在します');
        // テーブルは存在するが、マイグレーション記録がない場合は追加
        try {
          const existingCheck = await client.query(`
            SELECT version FROM mn_preview_indexer.schema_migrations WHERE version = $1
          `, ['0000']);
          
          if (existingCheck.rows.length === 0) {
            await client.query(
              'INSERT INTO mn_preview_indexer.schema_migrations (version, name) VALUES ($1, $2)',
              ['0000', 'create_migrations_table']
            );
          }
        } catch (insertError) {
          // 挿入エラーは無視（既に存在する可能性がある）
        }
      } else {
        throw error;
      }
    }
  }
}

/**
 * マイグレーションを適用
 */
async function applyMigration(
  client: PoolClient,
  migration: MigrationFile
): Promise<void> {
  console.log(`🔄 マイグレーション ${migration.version}_${migration.name} を適用中...`);

  await client.query('BEGIN');
  try {
    await client.query('SET search_path TO mn_preview_indexer');
    // SQLを実行（複数の文が含まれる場合に対応）
    // より正確な分割方法: セミコロンで終わる文を分割（改行やコメントを考慮）
    // コメント行を除去
    const contentWithoutComments = migration.content
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');
    
    // セミコロンで分割し、空の文を除外
    const statements = contentWithoutComments
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // SET search_pathコマンドを先に実行
    for (const statement of statements) {
      const upperStatement = statement.toUpperCase().trim();
      if (upperStatement.startsWith('SET SEARCH_PATH') || upperStatement.startsWith('SET LOCAL SEARCH_PATH')) {
        try {
          await client.query(statement);
          console.log(`  📍 search_pathを設定: ${statement.substring(0, 80)}...`);
        } catch (error: any) {
          console.warn(`  ⚠️  search_pathの設定で警告: ${error.message}`);
        }
      }
    }

    // CREATE SCHEMAを実行
    for (const statement of statements) {
      const upperStatement = statement.toUpperCase().trim();
      if (upperStatement.startsWith('CREATE SCHEMA')) {
        try {
          await client.query(statement);
          console.log(`  📦 スキーマを作成: ${statement.substring(0, 80)}...`);
        } catch (error: any) {
          // スキーマが既に存在する場合はエラーを無視
          if (error.code === '42P06') {
            console.log(`  ℹ️  スキーマは既に存在します`);
          } else {
            throw error;
          }
        }
      }
    }

    // 残りのSQL文を実行（CREATE TABLE, CREATE INDEX, etc.）
    for (const statement of statements) {
      const upperStatement = statement.toUpperCase().trim();
      if (!upperStatement.startsWith('SET SEARCH_PATH') && 
          !upperStatement.startsWith('SET LOCAL SEARCH_PATH') &&
          !upperStatement.startsWith('CREATE SCHEMA')) {
        try {
          await client.query(statement);
        } catch (error: any) {
          // より詳細なエラー情報を表示
          const preview = statement.substring(0, 100).replace(/\n/g, ' ');
          console.error(`  ❌ SQLエラー: ${error.message}`);
          console.error(`  ❌ エラーコード: ${error.code}`);
          console.error(`  ❌ SQL文: ${preview}...`);
          throw error;
        }
      }
    }

    // マイグレーションを記録（publicスキーマを明示的に指定）
    // search_pathを一時的にpublicに設定してからINSERT
    await client.query('SET search_path TO mn_preview_indexer');
    await client.query(
      'INSERT INTO mn_preview_indexer.schema_migrations (version, name) VALUES ($1, $2)',
      [migration.version, migration.name]
    );

    await client.query('COMMIT');
    console.log(`✅ マイグレーション ${migration.version}_${migration.name} を適用しました`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`❌ マイグレーション ${migration.version}_${migration.name} の適用に失敗しました:`, error);
    throw error;
  }
}

/**
 * マイグレーションを実行
 */
export async function runMigrations(migrationsDir?: string): Promise<void> {
  let migrationsPath = migrationsDir;
  if (!migrationsPath) {
    // migrationsディレクトリを探す: 現在のディレクトリまたは親ディレクトリから
    migrationsPath = path.join(process.cwd(), 'src', 'migrations');
    if (!fs.existsSync(migrationsPath)) {
      // 親ディレクトリ（プロジェクトルート）を確認
      migrationsPath = path.join(process.cwd(), 'migrations');
      if (!fs.existsSync(migrationsPath)) {
        // __dirnameから相対的に探す（コンパイル後のdistからの場合）
        migrationsPath = path.join(process.cwd(), '..', 'migrations');
      }
    }
  }
  console.log(`📂 マイグレーションディレクトリ: ${migrationsPath}`);

  // PostgreSQLに接続
  await connectPostgres();
  const pool = getPostgresPool();

  await withPgClient(async (client) => {
    // search_pathを設定（mn_preview_indexerを優先、publicはマイグレーション管理用）
    await client.query('SET search_path TO mn_preview_indexer');

    // マイグレーション管理テーブルを確認・作成
    await ensureMigrationsTable(client);

    // 適用済みマイグレーションを取得
    const appliedMigrations = await getAppliedMigrations(client);
    console.log(`📊 適用済みマイグレーション: ${appliedMigrations.size}件`);

    // マイグレーションファイルを読み込み
    const migrationFiles = loadMigrationFiles(migrationsPath);
    console.log(`📄 マイグレーションファイル: ${migrationFiles.length}件`);

    // 未適用のマイグレーションをフィルタリング
    const pendingMigrations = migrationFiles.filter(
      (m) => !appliedMigrations.has(m.version)
    );

    if (pendingMigrations.length === 0) {
      console.log('✅ すべてのマイグレーションが適用済みです');
      return;
    }

    console.log(`🚀 ${pendingMigrations.length}件のマイグレーションを適用します`);

    // マイグレーションを順番に適用
    for (const migration of pendingMigrations) {
      await applyMigration(client, migration);
    }

    console.log('✅ すべてのマイグレーションを適用しました');
  });
}

/**
 * マイグレーション状態を表示
 */
export async function showMigrationStatus(migrationsDir?: string): Promise<void> {
  let migrationsPath = migrationsDir;
  if (!migrationsPath) {
    // migrationsディレクトリを探す: 現在のディレクトリまたは親ディレクトリから
    migrationsPath = path.join(process.cwd(), 'migrations');
    if (!fs.existsSync(migrationsPath)) {
      // 親ディレクトリ（プロジェクトルート）を確認
      migrationsPath = path.join(process.cwd(), '..', 'migrations');
      if (!fs.existsSync(migrationsPath)) {
        // __dirnameから相対的に探す（コンパイル後のdistからの場合）
        migrationsPath = path.join(__dirname, '..', 'migrations');
      }
    }
  }
  
  await connectPostgres();
  
  await withPgClient(async (client) => {
    const migrationFiles = loadMigrationFiles(migrationsPath);
    const appliedMigrations = await getAppliedMigrations(client);

    console.log('\n📊 マイグレーション状態:');
    console.log('─'.repeat(80));

    for (const migration of migrationFiles) {
      const isApplied = appliedMigrations.has(migration.version);
      const status = isApplied ? '✅ 適用済み' : '⏳ 未適用';
      console.log(`${status} | ${migration.version.padStart(4, '0')}_${migration.name}`);
    }

    console.log('─'.repeat(80));
    console.log(
      `合計: ${migrationFiles.length}件 | 適用済み: ${appliedMigrations.size}件 | 未適用: ${migrationFiles.length - appliedMigrations.size}件`
    );
  });
}

// コマンドラインから実行された場合
if (require.main === module) {
  const command = process.argv[2] || 'migrate';

  if (command === 'migrate' || command === 'up') {
    runMigrations()
      .then(() => {
        console.log('✅ マイグレーション完了');
        process.exit(0);
      })
      .catch((error) => {
        console.error('❌ マイグレーションエラー:', error);
        process.exit(1);
      });
  } else if (command === 'status') {
    showMigrationStatus()
      .then(() => {
        process.exit(0);
      })
      .catch((error) => {
        console.error('❌ エラー:', error);
        process.exit(1);
      });
  } else {
    console.log('使用方法:');
    console.log('  npm run migrate        - マイグレーションを実行');
    console.log('  npm run migrate:status - マイグレーション状態を表示');
    process.exit(1);
  }
}
