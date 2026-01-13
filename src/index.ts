import { startIndexing } from './indexer';

async function main() {
  await startIndexing();
}

main().catch((err) => {
  console.error('[indexer] fatal error', err);
  process.exit(1);
});
