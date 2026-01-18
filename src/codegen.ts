import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: './midnight-indexer-preview.graphql',
  documents: './graphql/**/*.graphql',
  generates: {
    './graphql/generated.ts': {
      plugins: [
        'typescript',
        'typescript-operations',
        'typed-document-node'
      ],
    },
  },
};

export default config;
