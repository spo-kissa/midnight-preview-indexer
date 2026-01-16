import 'dotenv/config';
import { startIndexing, indexBlock, connectToChain } from './indexer';
import { connectPostgres, clearAllData, backfillExtrinsicHashes } from './database';

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
    
    // 特定のブロック番号を指定した場合
    const blockNumber = parseInt(args[0], 10);
    
    if (isNaN(blockNumber) || blockNumber < 0) {
      console.error('❌ 無効なブロック番号です。正の整数を指定してください。');
      console.error('使用方法:');
      console.error('  npm run dev                    # 通常のインデックス処理');
      console.error('  npm run dev <ブロック番号>     # 特定のブロックをインデックス');
      console.error('  npm run dev --clear            # 全てのデータをクリア');
      console.error('  npm run dev --backfill-hash    # 既存データのhashをrawから更新');
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
