import 'dotenv/config';
import { startIndexing, startWatchingGraphQL, indexBlock, connectToChain } from './indexer';
import { connectPostgres, clearAllData, backfillExtrinsicHashes } from './database';
import { getBlockByHeight, isRegularTransaction, isSystemTransaction } from './midnight-indexer';

async function main() {
  // コマンドライン引数からブロック番号を取得
  const args = process.argv.slice(2);
  
  if (args.length > 0) {
    const command = args[0].toLowerCase();
    
    // データクリアコマンド
    if (command === '--clear' || command === 'clear') {
      console.log('🗑️  全てのデータをクリアします...');
      
      try {
        await connectPostgres();
        await clearAllData();
        console.log('✅ データクリアが完了しました');
        process.exit(0);
      } catch (err) {
        console.error('[indexer] fatal error', err);
        process.exit(1);
      }
      return;
    }
    
    // hashバックフィルコマンド
    if (command === '--backfill-hash' || command === 'backfill-hash') {
      console.log('🔄 既存データのhashをrawカラムから取得して更新します...');
      
      try {
        await connectPostgres();
        await backfillExtrinsicHashes();
        console.log('✅ hashバックフィルが完了しました');
        process.exit(0);
      } catch (err) {
        console.error('[indexer] fatal error', err);
        process.exit(1);
      }
      return;
    }
    
    // ブロック表示コマンド
    if (command === '--show' || command === 'show') {
      const heightArg = args[1];
      
      if (!heightArg) {
        console.error('❌ ブロック高さが指定されていません。');
        console.error('使用方法:');
        console.error('  npm run dev --show <ブロック高さ>');
        process.exit(1);
      }
      
      const height = parseInt(heightArg, 10);
      
      if (isNaN(height) || height < 0) {
        console.error('❌ 無効なブロック高さです。正の整数を指定してください。');
        process.exit(1);
      }
      
      console.log(`📦 高さ ${height.toLocaleString()} のブロックを取得します...`);
      
      try {
        const block = await getBlockByHeight(height);
        
        if (!block) {
          console.log(`❌ 高さ ${height.toLocaleString()} のブロックが見つかりませんでした。`);
          process.exit(1);
        }
        
        console.log('\n' + '='.repeat(80));
        console.log('📦 ブロック情報');
        console.log('='.repeat(80));
        console.log(`高さ:        ${block.height.toLocaleString()}`);
        console.log(`ハッシュ:    ${block.hash}`);
        console.log(`タイムスタンプ: ${new Date(block.timestamp).toISOString()} (${block.timestamp})`);
        console.log(`作成者:      ${block.author || 'N/A'}`);
        console.log(`プロトコルバージョン: ${block.protocolVersion}`);
        console.log(`レジャーパラメータ: ${block.ledgerParameters}`);
        
        if (block.parent) {
          console.log(`親ブロック:  高さ ${block.parent.height.toLocaleString()}, ハッシュ ${block.parent.hash}`);
        }
        
        console.log(`\nトランザクション数: ${block.transactions.length}`);
        
        if (block.transactions.length > 0) {
          console.log('\n' + '-'.repeat(80));
          console.log('トランザクション一覧');
          console.log('-'.repeat(80));
          
          block.transactions.forEach((tx, index) => {
            console.log(`\n[${index + 1}] ${tx.__typename}`);
            console.log(`    ハッシュ: ${tx.hash}`);
            console.log(`    ブロック高さ: ${tx.block.height.toLocaleString()}`);
            console.log(`    ID: ${tx.id}`);
            console.log(`    プロトコルバージョン: ${tx.protocolVersion}`);
            
            if (isRegularTransaction(tx)) {
              console.log(`    開始インデックス: ${tx.startIndex}`);
              console.log(`    終了インデックス: ${tx.endIndex}`);
              console.log(`    手数料: ${tx.fees.paidFees} (推定: ${tx.fees.estimatedFees})`);
              console.log(`    トランザクション結果: ${tx.transactionResult.status}`);
              if (tx.unshieldedCreatedOutputs && tx.unshieldedCreatedOutputs.length > 0) {
                console.log(`    作成されたアンシールド出力数: ${tx.unshieldedCreatedOutputs.length}`);
              }
              if (tx.unshieldedSpentOutputs && tx.unshieldedSpentOutputs.length > 0) {
                console.log(`    使用されたアンシールド出力数: ${tx.unshieldedSpentOutputs.length}`);
              }
              if (tx.contractActions && tx.contractActions.length > 0) {
                console.log(`    コントラクトアクション数: ${tx.contractActions.length}`);
              }
            } else if (isSystemTransaction(tx)) {
              if (tx.unshieldedCreatedOutputs && tx.unshieldedCreatedOutputs.length > 0) {
                console.log(`    作成されたアンシールド出力数: ${tx.unshieldedCreatedOutputs.length}`);
              }
              if (tx.unshieldedSpentOutputs && tx.unshieldedSpentOutputs.length > 0) {
                console.log(`    使用されたアンシールド出力数: ${tx.unshieldedSpentOutputs.length}`);
              }
              if (tx.contractActions && tx.contractActions.length > 0) {
                console.log(`    コントラクトアクション数: ${tx.contractActions.length}`);
              }
            }
          });
        }
        
        console.log('\n' + '='.repeat(80));
        
        process.exit(0);
      } catch (err) {
        console.error('[indexer] fatal error', err);
        process.exit(1);
      }
      return;
    }
    
    // GraphQLを使用して最新のブロックを購読するモード
    if (command === '--watch-graphql' || command === 'watch-graphql' || command === '--subscribe-graphql' || command === 'subscribe-graphql') {
      console.log('👀 GraphQLを使用して最新のブロックを購読するモードを開始します...');
      
      try {
        let unsubscribe: (() => void) | null = null;
        
        // シグナルハンドラーを設定してクリーンアップ
        const cleanup = () => {
          if (unsubscribe) {
            unsubscribe();
          }
          process.exit(0);
        };
        
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
        
        unsubscribe = await startWatchingGraphQL();
        
        // startWatchingGraphQLは継続的に実行されるため、ここには到達しない
      } catch (err) {
        console.error('[indexer] fatal error', err);
        process.exit(1);
      }
      return;
    }
    
    // 特定のブロック番号を指定した場合
    const blockNumber = parseInt(args[0], 10);
    
    if (isNaN(blockNumber) || blockNumber < 0) {
      console.error('❌ 無効なブロック番号です。正の整数を指定してください。');
      console.error('使用方法:');
      console.error('  npm run dev                    # 通常のインデックス処理');
      console.error('  npm run dev <ブロック番号>     # 特定のブロックをインデックス');
      console.error('  npm run dev --clear            # 全てのデータをクリア');
      console.error('  npm run dev --backfill-hash    # 既存データのhashをrawから更新');
      console.error('  npm run dev --show <高さ>      # 指定された高さのブロックを表示');
      console.error('  npm run dev --watch-graphql    # GraphQLを使用して最新のブロックを購読');
      process.exit(1);
    }
    
    console.log(`📦 Block ${blockNumber.toLocaleString()} をインデックスします...`);
    
    try {
      const api = await connectToChain();
      await connectPostgres();
      
      // ファイナライズされたブロックの高さを取得
      let finalizedBlockHeight: number | undefined;
      try {
        const finalizedHash = await api.rpc.chain.getFinalizedHead();
        const finalizedHeader = await api.rpc.chain.getHeader(finalizedHash);
        finalizedBlockHeight = finalizedHeader.number.toNumber();
      } catch (err) {
        console.warn(`Failed to get finalized block height:`, err);
      }
      
      const extrinsicCount = await indexBlock(api, blockNumber, 0, finalizedBlockHeight);
      console.log(`✅ Block ${blockNumber.toLocaleString()} indexed (${extrinsicCount} extrinsics)`);
      
      process.exit(0);
    } catch (err) {
      console.error('[indexer] fatal error', err);
      process.exit(1);
    }
  } else {
    // 通常のインデックス処理を開始
    await startIndexing();
  }
}

main().catch((err) => {
  console.error('[indexer] fatal error', err);
  process.exit(1);
});
