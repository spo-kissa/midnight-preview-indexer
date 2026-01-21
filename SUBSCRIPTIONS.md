# GraphQL サブスクリプション一覧

このドキュメントでは、Midnight Preview Indexer GraphQL APIで利用可能なすべてのサブスクリプションについて説明します。

## 目次

- [1. blocks](#1-blocks)
- [2. contractActions](#2-contractactions)
- [3. dustLedgerEvents](#3-dustledgerevents)
- [4. shieldedTransactions](#4-shieldedtransactions)
- [5. unshieldedTransactions](#5-unshieldedtransactions)
- [6. zswapLedgerEvents](#6-zswapledgerevents)
- [セッション管理](#セッション管理)
- [使用例](#使用例)

---

## 1. blocks

ブロックチェーン上の新しいブロックをリアルタイムで購読します。

### パラメータ

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `offset` | `BlockOffset` | いいえ | 開始位置を指定。省略時は最新ブロックから開始。 |

#### BlockOffset

```graphql
input BlockOffset {
  hash: HexEncoded   # ブロックハッシュ（16進数エンコード）
  height: Int        # ブロック高さ
}
```

### 戻り値

- **型**: `Block!`
- **説明**: ブロックデータを含むオブジェクト

#### Block 型の主要フィールド

- `hash: HexEncoded!` - ブロックハッシュ
- `height: Int!` - ブロック高さ
- `protocolVersion: Int!` - プロトコルバージョン
- `timestamp: Int!` - UNIXタイムスタンプ
- `author: HexEncoded` - ブロック作成者（16進数エンコード）
- `parent: Block` - 親ブロック
- `transactions: [Transaction!]!` - このブロックに含まれるトランザクション
- `ledgerParameters: HexEncoded!` - レジャーパラメータ

### 使用例

```graphql
subscription {
  blocks(offset: { height: 1000 }) {
    height
    hash
    timestamp
    transactions {
      id
      hash
    }
  }
}
```

---

## 2. contractActions

指定されたコントラクトアドレスのコントラクトアクションを購読します。

### パラメータ

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `address` | `HexEncoded!` | はい | コントラクトアドレス（16進数エンコード） |
| `offset` | `BlockOffset` | いいえ | 開始位置を指定。省略時は最新ブロックから開始。 |

### 戻り値

- **型**: `ContractAction!`
- **説明**: コントラクトアクション（`ContractDeploy`、`ContractCall`、または`ContractUpdate`）

#### ContractAction インターフェースの主要フィールド

- `address: HexEncoded!` - コントラクトアドレス
- `state: HexEncoded!` - コントラクトの状態
- `zswapState: HexEncoded!` - zswap状態
- `transaction: Transaction!` - 関連するトランザクション
- `unshieldedBalances: [ContractBalance!]!` - アンシールドされたトークンバランス

#### 実装型

- `ContractDeploy` - コントラクトデプロイ
- `ContractCall` - コントラクト呼び出し（追加フィールド: `entryPoint: String!`, `deploy: ContractDeploy!`）
- `ContractUpdate` - コントラクト更新

### 使用例

```graphql
subscription {
  contractActions(
    address: "0x1234..."
    offset: { height: 5000 }
  ) {
    __typename
    address
    state
    transaction {
      id
      hash
    }
    ... on ContractCall {
      entryPoint
    }
  }
}
```

---

## 3. dustLedgerEvents

DUST ledgerイベントを購読します。

### パラメータ

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `id` | `Int` | いいえ | 開始イベントID。省略時は最初から開始。 |

### 戻り値

- **型**: `DustLedgerEvent!`
- **説明**: DUST ledgerイベント

#### DustLedgerEvent インターフェースのフィールド

- `id: Int!` - イベントID
- `raw: HexEncoded!` - シリアライズされたイベントデータ
- `maxId: Int!` - 現在の最大イベントID

#### 実装型

- `DustInitialUtxo` - DUST初期UTXO（追加フィールド: `output: DustOutput!`）
- `DustSpendProcessed` - DUST使用処理済み
- `DustGenerationDtimeUpdate` - DUST生成時間更新
- `ParamChange` - パラメータ変更

### 使用例

```graphql
subscription {
  dustLedgerEvents(id: 100) {
    __typename
    id
    raw
    maxId
    ... on DustInitialUtxo {
      output {
        nonce
      }
    }
  }
}
```

---

## 4. shieldedTransactions

シールドされた（秘匿化された）トランザクションイベントを購読します。

**注意**: このサブスクリプションを使用する前に、`Mutation.connect`でセッションIDを取得する必要があります。

### パラメータ

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `sessionId` | `HexEncoded!` | はい | `Mutation.connect`で取得したセッションID |
| `index` | `Int` | いいえ | 開始インデックス。省略時は0から開始。 |

### 戻り値

- **型**: `ShieldedTransactionsEvent!`
- **説明**: シールドトランザクションイベント（Union型）

#### ShieldedTransactionsEvent (Union)

- `RelevantTransaction` - ウォレットに関連するトランザクション
  - `transaction: RegularTransaction!` - 関連するトランザクション
  - `collapsedMerkleTree: CollapsedMerkleTree` - 折りたたまれたマークルツリー（オプション）

- `ShieldedTransactionsProgress` - インデックス進行状況
  - `highestEndIndex: Int!` - すべてのトランザクションの最高zswap状態終了インデックス（ブロックチェーンの既知の状態）
  - `highestCheckedEndIndex: Int!` - 関連性がチェックされたトランザクションの最高zswap状態終了インデックス
  - `highestRelevantEndIndex: Int!` - 購読中のウォレットに関連するトランザクションの最高zswap状態終了インデックス

### 使用例

```graphql
subscription {
  shieldedTransactions(sessionId: "0xabcd...", index: 0) {
    __typename
    ... on RelevantTransaction {
      transaction {
        id
        hash
        fees {
          paidFees
        }
      }
      collapsedMerkleTree {
        startIndex
        endIndex
      }
    }
    ... on ShieldedTransactionsProgress {
      highestEndIndex
      highestCheckedEndIndex
      highestRelevantEndIndex
    }
  }
}
```

---

## 5. unshieldedTransactions

アンシールドされた（非秘匿化された）トランザクションイベントを購読します。

### パラメータ

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `address` | `UnshieldedAddress!` | はい | アンシールドアドレス（Bech32mエンコード） |
| `transactionId` | `Int` | いいえ | 開始トランザクションID。省略時は0から開始。 |

### 戻り値

- **型**: `UnshieldedTransactionsEvent!`
- **説明**: アンシールドトランザクションイベント（Union型）

#### UnshieldedTransactionsEvent (Union)

- `UnshieldedTransaction` - アンシールドトランザクション
  - `transaction: Transaction!` - トランザクション
  - `createdUtxos: [UnshieldedUtxo!]!` - 作成されたUTXO（空の場合あり）
  - `spentUtxos: [UnshieldedUtxo!]!` - 使用されたUTXO（空の場合あり）

- `UnshieldedTransactionsProgress` - インデックス進行状況
  - `highestTransactionId: Int!` - 購読中のアドレスの既知のトランザクションの最高ID

### 使用例

```graphql
subscription {
  unshieldedTransactions(
    address: "midnight1..."
    transactionId: 0
  ) {
    __typename
    ... on UnshieldedTransaction {
      transaction {
        id
        hash
      }
      createdUtxos {
        owner
        tokenType
        value
      }
      spentUtxos {
        owner
        tokenType
        value
      }
    }
    ... on UnshieldedTransactionsProgress {
      highestTransactionId
    }
  }
}
```

---

## 6. zswapLedgerEvents

Zswap ledgerイベントを購読します。

### パラメータ

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `id` | `Int` | いいえ | 開始イベントID。省略時は最初から開始。 |

### 戻り値

- **型**: `ZswapLedgerEvent!`
- **説明**: Zswap ledgerイベント

#### ZswapLedgerEvent 型のフィールド

- `id: Int!` - イベントID
- `raw: HexEncoded!` - シリアライズされたイベントデータ
- `maxId: Int!` - 現在の最大イベントID

### 使用例

```graphql
subscription {
  zswapLedgerEvents(id: 50) {
    id
    raw
    maxId
  }
}
```

---

## セッション管理

`shieldedTransactions`サブスクリプションを使用するには、まずセッションを確立する必要があります。

### セッションの接続

```graphql
mutation {
  connect(viewingKey: "your-viewing-key") {
    # セッションIDが返されます
  }
}
```

### セッションの切断

```graphql
mutation {
  disconnect(sessionId: "0xabcd...") {
    # Unit型が返されます
  }
}
```

---

## 使用例

### 例1: 最新ブロックの購読

```graphql
subscription LatestBlocks {
  blocks {
    height
    hash
    timestamp
    transactions {
      id
      __typename
    }
  }
}
```

### 例2: 特定のコントラクトのアクションを監視

```graphql
subscription ContractMonitoring {
  contractActions(address: "0x1234...") {
    __typename
    address
    transaction {
      id
      hash
      block {
        height
      }
    }
    ... on ContractCall {
      entryPoint
    }
  }
}
```

### 例3: シールドトランザクションの完全なフロー

```graphql
# ステップ1: セッションの確立
mutation ConnectSession {
  connect(viewingKey: "your-viewing-key")
}

# ステップ2: サブスクリプションの開始（取得したsessionIdを使用）
subscription ShieldedTx {
  shieldedTransactions(sessionId: "0xabcd...") {
    __typename
    ... on RelevantTransaction {
      transaction {
        id
        hash
        transactionResult {
          status
        }
      }
    }
    ... on ShieldedTransactionsProgress {
      highestEndIndex
      highestCheckedEndIndex
      highestRelevantEndIndex
    }
  }
}
```

### 例4: アンシールドトランザクションとUTXOの追跡

```graphql
subscription UnshieldedMonitoring {
  unshieldedTransactions(address: "midnight1...") {
    __typename
    ... on UnshieldedTransaction {
      transaction {
        id
        hash
        block {
          height
          timestamp
        }
      }
      createdUtxos {
        owner
        tokenType
        value
        outputIndex
        ctime
      }
      spentUtxos {
        owner
        tokenType
        value
      }
    }
  }
}
```

---

## 注意事項

1. **セッションID**: `shieldedTransactions`を使用する場合、必ず先に`Mutation.connect`でセッションIDを取得してください。

2. **オフセットパラメータ**: オフセットパラメータを省略すると、最新の状態から購読が開始されます。過去のデータから開始する場合は、適切なオフセット値を指定してください。

3. **Union型**: `ShieldedTransactionsEvent`と`UnshieldedTransactionsEvent`はUnion型です。`__typename`フィールドを使用して、返された型を判定してください。

4. **エラーハンドリング**: ネットワークエラーや接続エラーが発生した場合、適切な再接続ロジックを実装してください。

5. **パフォーマンス**: 大量のイベントを購読する場合、フィルタリングや適切なフィールド選択を行い、不要なデータの転送を避けてください。

---

## 関連ドキュメント

- GraphQLスキーマ: `src/midnight-indexer-preview.graphql`
- 型定義: `src/graphql/generated.ts`

---

最終更新: 2024年
