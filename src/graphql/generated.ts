import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  CardanoRewardAddress: { input: any; output: any; }
  DustAddress: { input: any; output: any; }
  HexEncoded: { input: any; output: any; }
  Unit: { input: any; output: any; }
  UnshieldedAddress: { input: any; output: any; }
  ViewingKey: { input: any; output: any; }
};

/** A block with its relevant data. */
export type Block = {
  __typename?: 'Block';
  /** The hex-encoded block author. */
  author?: Maybe<Scalars['HexEncoded']['output']>;
  /** The block hash. */
  hash: Scalars['HexEncoded']['output'];
  /** The block height. */
  height: Scalars['Int']['output'];
  /** The hex-encoded ledger parameters for this block. */
  ledgerParameters: Scalars['HexEncoded']['output'];
  /** The parent of this block. */
  parent?: Maybe<Block>;
  /** The protocol version. */
  protocolVersion: Scalars['Int']['output'];
  /** The UNIX timestamp. */
  timestamp: Scalars['Int']['output'];
  /** The transactions within this block. */
  transactions: Array<Transaction>;
};

/** Either a block hash or a block height. */
export type BlockOffset = {
  /** A hex-encoded block hash. */
  hash?: InputMaybe<Scalars['HexEncoded']['input']>;
  /** A block height. */
  height?: InputMaybe<Scalars['Int']['input']>;
};

export type CollapsedMerkleTree = {
  __typename?: 'CollapsedMerkleTree';
  /** The zswap state end index. */
  endIndex: Scalars['Int']['output'];
  /** The protocol version. */
  protocolVersion: Scalars['Int']['output'];
  /** The zswap state start index. */
  startIndex: Scalars['Int']['output'];
  /** The hex-encoded value. */
  update: Scalars['HexEncoded']['output'];
};

/** A contract action. */
export type ContractAction = {
  address: Scalars['HexEncoded']['output'];
  state: Scalars['HexEncoded']['output'];
  transaction: Transaction;
  unshieldedBalances: Array<ContractBalance>;
  zswapState: Scalars['HexEncoded']['output'];
};

/** Either a block offset or a transaction offset. */
export type ContractActionOffset = {
  /** Either a block hash or a block height. */
  blockOffset?: InputMaybe<BlockOffset>;
  /** Either a transaction hash or a transaction identifier. */
  transactionOffset?: InputMaybe<TransactionOffset>;
};

/**
 * Represents a token balance held by a contract.
 * This type is exposed through the GraphQL API to allow clients to query
 * unshielded token balances for any contract action (Deploy, Call, Update).
 */
export type ContractBalance = {
  __typename?: 'ContractBalance';
  /** Balance amount as string to support larger integer values (up to 16 bytes). */
  amount: Scalars['String']['output'];
  /** Hex-encoded token type identifier. */
  tokenType: Scalars['HexEncoded']['output'];
};

/** A contract call. */
export type ContractCall = ContractAction & {
  __typename?: 'ContractCall';
  /** The hex-encoded serialized address. */
  address: Scalars['HexEncoded']['output'];
  /** Contract deploy for this contract call. */
  deploy: ContractDeploy;
  /** The entry point. */
  entryPoint: Scalars['String']['output'];
  /** The hex-encoded serialized state. */
  state: Scalars['HexEncoded']['output'];
  /** Transaction for this contract call. */
  transaction: Transaction;
  /** Unshielded token balances held by this contract. */
  unshieldedBalances: Array<ContractBalance>;
  /** The hex-encoded serialized contract-specific zswap state. */
  zswapState: Scalars['HexEncoded']['output'];
};

/** A contract deployment. */
export type ContractDeploy = ContractAction & {
  __typename?: 'ContractDeploy';
  /** The hex-encoded serialized address. */
  address: Scalars['HexEncoded']['output'];
  /** The hex-encoded serialized state. */
  state: Scalars['HexEncoded']['output'];
  /** Transaction for this contract deploy. */
  transaction: Transaction;
  /** Unshielded token balances held by this contract. */
  unshieldedBalances: Array<ContractBalance>;
  /** The hex-encoded serialized contract-specific zswap state. */
  zswapState: Scalars['HexEncoded']['output'];
};

/** A contract update. */
export type ContractUpdate = ContractAction & {
  __typename?: 'ContractUpdate';
  /** The hex-encoded serialized address. */
  address: Scalars['HexEncoded']['output'];
  /** The hex-encoded serialized state. */
  state: Scalars['HexEncoded']['output'];
  /** Transaction for this contract update. */
  transaction: Transaction;
  /** Unshielded token balances held by this contract after the update. */
  unshieldedBalances: Array<ContractBalance>;
  /** The hex-encoded serialized contract-specific zswap state. */
  zswapState: Scalars['HexEncoded']['output'];
};

export type DustGenerationDtimeUpdate = DustLedgerEvent & {
  __typename?: 'DustGenerationDtimeUpdate';
  /** The ID of this dust ledger event. */
  id: Scalars['Int']['output'];
  /** The maximum ID of all dust ledger events. */
  maxId: Scalars['Int']['output'];
  /** The hex-encoded serialized event. */
  raw: Scalars['HexEncoded']['output'];
};

/** DUST generation status for a specific Cardano reward address. */
export type DustGenerationStatus = {
  __typename?: 'DustGenerationStatus';
  /** The Bech32-encoded Cardano reward address (e.g., stake_test1... or stake1...). */
  cardanoRewardAddress: Scalars['CardanoRewardAddress']['output'];
  /** Current generated DUST capacity in SPECK. */
  currentCapacity: Scalars['String']['output'];
  /** The Bech32m-encoded associated DUST address if registered. */
  dustAddress?: Maybe<Scalars['DustAddress']['output']>;
  /** DUST generation rate in SPECK per second. */
  generationRate: Scalars['String']['output'];
  /** Maximum DUST capacity in SPECK. */
  maxCapacity: Scalars['String']['output'];
  /** NIGHT balance backing generation in STAR. */
  nightBalance: Scalars['String']['output'];
  /** Whether this reward address is registered. */
  registered: Scalars['Boolean']['output'];
  /** Cardano UTXO output index for update/unregister operations. */
  utxoOutputIndex?: Maybe<Scalars['Int']['output']>;
  /** Cardano UTXO transaction hash for update/unregister operations. */
  utxoTxHash?: Maybe<Scalars['HexEncoded']['output']>;
};

export type DustInitialUtxo = DustLedgerEvent & {
  __typename?: 'DustInitialUtxo';
  /** The ID of this dust ledger event. */
  id: Scalars['Int']['output'];
  /** The maximum ID of all dust ledger events. */
  maxId: Scalars['Int']['output'];
  /** The dust output. */
  output: DustOutput;
  /** The hex-encoded serialized event. */
  raw: Scalars['HexEncoded']['output'];
};

/** A dust related ledger event. */
export type DustLedgerEvent = {
  id: Scalars['Int']['output'];
  maxId: Scalars['Int']['output'];
  raw: Scalars['HexEncoded']['output'];
};

/** A dust output. */
export type DustOutput = {
  __typename?: 'DustOutput';
  /** The hex-encoded 32-byte nonce. */
  nonce: Scalars['HexEncoded']['output'];
};

export type DustSpendProcessed = DustLedgerEvent & {
  __typename?: 'DustSpendProcessed';
  /** The ID of this dust ledger event. */
  id: Scalars['Int']['output'];
  /** The maximum ID of all dust ledger events. */
  maxId: Scalars['Int']['output'];
  /** The hex-encoded serialized event. */
  raw: Scalars['HexEncoded']['output'];
};

export type Mutation = {
  __typename?: 'Mutation';
  /** Connect the wallet with the given viewing key and return a session ID. */
  connect: Scalars['HexEncoded']['output'];
  /** Disconnect the wallet with the given session ID. */
  disconnect: Scalars['Unit']['output'];
};


export type MutationConnectArgs = {
  viewingKey: Scalars['ViewingKey']['input'];
};


export type MutationDisconnectArgs = {
  sessionId: Scalars['HexEncoded']['input'];
};

export type ParamChange = DustLedgerEvent & {
  __typename?: 'ParamChange';
  /** The ID of this dust ledger event. */
  id: Scalars['Int']['output'];
  /** The maximum ID of all dust ledger events. */
  maxId: Scalars['Int']['output'];
  /** The hex-encoded serialized event. */
  raw: Scalars['HexEncoded']['output'];
};

export type Query = {
  __typename?: 'Query';
  /** Find a block for the given optional offset; if not present, the latest block is returned. */
  block?: Maybe<Block>;
  /** Find a contract action for the given address and optional offset. */
  contractAction?: Maybe<ContractAction>;
  /** Get DUST generation status for specific Cardano reward addresses. */
  dustGenerationStatus: Array<DustGenerationStatus>;
  /** Find transactions for the given offset. */
  transactions: Array<Transaction>;
};


export type QueryBlockArgs = {
  offset?: InputMaybe<BlockOffset>;
};


export type QueryContractActionArgs = {
  address: Scalars['HexEncoded']['input'];
  offset?: InputMaybe<ContractActionOffset>;
};


export type QueryDustGenerationStatusArgs = {
  cardanoRewardAddresses: Array<Scalars['CardanoRewardAddress']['input']>;
};


export type QueryTransactionsArgs = {
  offset: TransactionOffset;
};

/** A regular Midnight transaction. */
export type RegularTransaction = Transaction & {
  __typename?: 'RegularTransaction';
  /** The block for this transaction. */
  block: Block;
  /** The contract actions for this transaction. */
  contractActions: Array<ContractAction>;
  /** Dust ledger events of this transaction. */
  dustLedgerEvents: Array<DustLedgerEvent>;
  /** The zswap state end index. */
  endIndex: Scalars['Int']['output'];
  /** Fee information for this transaction. */
  fees: TransactionFees;
  /** The hex-encoded transaction hash. */
  hash: Scalars['HexEncoded']['output'];
  /** The transaction ID. */
  id: Scalars['Int']['output'];
  /** The hex-encoded serialized transaction identifiers. */
  identifiers: Array<Scalars['HexEncoded']['output']>;
  /** The hex-encoded serialized merkle-tree root. */
  merkleTreeRoot: Scalars['HexEncoded']['output'];
  /** The protocol version. */
  protocolVersion: Scalars['Int']['output'];
  /** The hex-encoded serialized transaction content. */
  raw: Scalars['HexEncoded']['output'];
  /** The zswap state start index. */
  startIndex: Scalars['Int']['output'];
  /** The result of applying this transaction to the ledger state. */
  transactionResult: TransactionResult;
  /** Unshielded UTXOs created by this transaction. */
  unshieldedCreatedOutputs: Array<UnshieldedUtxo>;
  /** Unshielded UTXOs spent (consumed) by this transaction. */
  unshieldedSpentOutputs: Array<UnshieldedUtxo>;
  /** Zswap ledger events of this transaction. */
  zswapLedgerEvents: Array<ZswapLedgerEvent>;
};

/** A transaction relevant for the subscribing wallet and an optional collapsed merkle tree. */
export type RelevantTransaction = {
  __typename?: 'RelevantTransaction';
  /** An optional collapsed merkle tree. */
  collapsedMerkleTree?: Maybe<CollapsedMerkleTree>;
  /** A transaction relevant for the subscribing wallet. */
  transaction: RegularTransaction;
};

/**
 * One of many segments for a partially successful transaction result showing success for some
 * segment.
 */
export type Segment = {
  __typename?: 'Segment';
  /** Segment ID. */
  id: Scalars['Int']['output'];
  /** Successful or not. */
  success: Scalars['Boolean']['output'];
};

/** An event of the shielded transactions subscription. */
export type ShieldedTransactionsEvent = RelevantTransaction | ShieldedTransactionsProgress;

/** Information about the shielded transactions indexing progress. */
export type ShieldedTransactionsProgress = {
  __typename?: 'ShieldedTransactionsProgress';
  /**
   * The highest zswap state end index (see `endIndex` of `Transaction`) of all transactions
   * checked for relevance. Initially less than and eventually (when some wallet has been fully
   * indexed) equal to `highest_end_index`. A value of zero (very unlikely) means that no wallet
   * has subscribed before and indexing for the subscribing wallet has not yet started.
   */
  highestCheckedEndIndex: Scalars['Int']['output'];
  /**
   * The highest zswap state end index (see `endIndex` of `Transaction`) of all transactions. It
   * represents the known state of the blockchain. A value of zero (completely unlikely) means
   * that no shielded transactions have been indexed yet.
   */
  highestEndIndex: Scalars['Int']['output'];
  /**
   * The highest zswap state end index (see `endIndex` of `Transaction`) of all relevant
   * transactions for the subscribing wallet. Usually less than `highest_checked_end_index`
   * unless the latest checked transaction is relevant for the subscribing wallet. A value of
   * zero means that no relevant transactions have been indexed for the subscribing wallet.
   */
  highestRelevantEndIndex: Scalars['Int']['output'];
};

export type Subscription = {
  __typename?: 'Subscription';
  /**
   * Subscribe to blocks starting at the given offset or at the latest block if the offset is
   * omitted.
   */
  blocks: Block;
  /**
   * Subscribe to contract actions with the given address starting at the given offset or at the
   * latest block if the offset is omitted.
   */
  contractActions: ContractAction;
  /** Subscribe to dust ledger events starting at the given ID or at the very start if omitted. */
  dustLedgerEvents: DustLedgerEvent;
  /**
   * Subscribe to shielded transaction events for the given session ID starting at the given
   * index or at zero if omitted.
   */
  shieldedTransactions: ShieldedTransactionsEvent;
  /**
   * Subscribe unshielded transaction events for the given address and the given transaction ID
   * or zero if omitted.
   */
  unshieldedTransactions: UnshieldedTransactionsEvent;
  /** Subscribe to zswap ledger events starting at the given ID or at the very start if omitted. */
  zswapLedgerEvents: ZswapLedgerEvent;
};


export type SubscriptionBlocksArgs = {
  offset?: InputMaybe<BlockOffset>;
};


export type SubscriptionContractActionsArgs = {
  address: Scalars['HexEncoded']['input'];
  offset?: InputMaybe<BlockOffset>;
};


export type SubscriptionDustLedgerEventsArgs = {
  id?: InputMaybe<Scalars['Int']['input']>;
};


export type SubscriptionShieldedTransactionsArgs = {
  index?: InputMaybe<Scalars['Int']['input']>;
  sessionId: Scalars['HexEncoded']['input'];
};


export type SubscriptionUnshieldedTransactionsArgs = {
  address: Scalars['UnshieldedAddress']['input'];
  transactionId?: InputMaybe<Scalars['Int']['input']>;
};


export type SubscriptionZswapLedgerEventsArgs = {
  id?: InputMaybe<Scalars['Int']['input']>;
};

/** A system Midnight transaction. */
export type SystemTransaction = Transaction & {
  __typename?: 'SystemTransaction';
  /** The block for this transaction. */
  block: Block;
  /** The contract actions for this transaction. */
  contractActions: Array<ContractAction>;
  /** Dust ledger events of this transaction. */
  dustLedgerEvents: Array<DustLedgerEvent>;
  /** The hex-encoded transaction hash. */
  hash: Scalars['HexEncoded']['output'];
  /** The transaction ID. */
  id: Scalars['Int']['output'];
  /** The protocol version. */
  protocolVersion: Scalars['Int']['output'];
  /** The hex-encoded serialized transaction content. */
  raw: Scalars['HexEncoded']['output'];
  /** Unshielded UTXOs created by this transaction. */
  unshieldedCreatedOutputs: Array<UnshieldedUtxo>;
  /** Unshielded UTXOs spent (consumed) by this transaction. */
  unshieldedSpentOutputs: Array<UnshieldedUtxo>;
  /** Zswap ledger events of this transaction. */
  zswapLedgerEvents: Array<ZswapLedgerEvent>;
};

/** A Midnight transaction. */
export type Transaction = {
  block: Block;
  contractActions: Array<ContractAction>;
  dustLedgerEvents: Array<DustLedgerEvent>;
  hash: Scalars['HexEncoded']['output'];
  id: Scalars['Int']['output'];
  protocolVersion: Scalars['Int']['output'];
  raw: Scalars['HexEncoded']['output'];
  unshieldedCreatedOutputs: Array<UnshieldedUtxo>;
  unshieldedSpentOutputs: Array<UnshieldedUtxo>;
  zswapLedgerEvents: Array<ZswapLedgerEvent>;
};

/** Fees information for a transaction, including both paid and estimated fees. */
export type TransactionFees = {
  __typename?: 'TransactionFees';
  /** The estimated fees that was calculated for this transaction in DUST. */
  estimatedFees: Scalars['String']['output'];
  /** The actual fees paid for this transaction in DUST. */
  paidFees: Scalars['String']['output'];
};

/** Either a transaction hash or a transaction identifier. */
export type TransactionOffset = {
  /** A hex-encoded transaction hash. */
  hash?: InputMaybe<Scalars['HexEncoded']['input']>;
  /** A hex-encoded transaction identifier. */
  identifier?: InputMaybe<Scalars['HexEncoded']['input']>;
};

/**
 * The result of applying a transaction to the ledger state. In case of a partial success (status),
 * there will be segments.
 */
export type TransactionResult = {
  __typename?: 'TransactionResult';
  segments?: Maybe<Array<Segment>>;
  status: TransactionResultStatus;
};

/** The status of the transaction result: success, partial success or failure. */
export enum TransactionResultStatus {
  Failure = 'FAILURE',
  PartialSuccess = 'PARTIAL_SUCCESS',
  Success = 'SUCCESS'
}

/** A transaction that created and/or spent UTXOs alongside these and other information. */
export type UnshieldedTransaction = {
  __typename?: 'UnshieldedTransaction';
  /** UTXOs created in the above transaction, possibly empty. */
  createdUtxos: Array<UnshieldedUtxo>;
  /** UTXOs spent in the above transaction, possibly empty. */
  spentUtxos: Array<UnshieldedUtxo>;
  /** The transaction that created and/or spent UTXOs. */
  transaction: Transaction;
};

/** An event of the unshielded transactions subscription. */
export type UnshieldedTransactionsEvent = UnshieldedTransaction | UnshieldedTransactionsProgress;

/** Information about the unshielded indexing progress. */
export type UnshieldedTransactionsProgress = {
  __typename?: 'UnshieldedTransactionsProgress';
  /** The highest transaction ID of all currently known transactions for a subscribed address. */
  highestTransactionId: Scalars['Int']['output'];
};

/** Represents an unshielded UTXO. */
export type UnshieldedUtxo = {
  __typename?: 'UnshieldedUtxo';
  /** Transaction that created this UTXO. */
  createdAtTransaction: Transaction;
  /** The creation time in seconds. */
  ctime?: Maybe<Scalars['Int']['output']>;
  /** The hex-encoded initial nonce for DUST generation tracking. */
  initialNonce: Scalars['HexEncoded']['output'];
  /** The hex-encoded serialized intent hash. */
  intentHash: Scalars['HexEncoded']['output'];
  /** Index of this output within its creating transaction. */
  outputIndex: Scalars['Int']['output'];
  /** Owner Bech32m-encoded address. */
  owner: Scalars['UnshieldedAddress']['output'];
  /** Whether this UTXO is registered for DUST generation. */
  registeredForDustGeneration: Scalars['Boolean']['output'];
  /** Transaction that spent this UTXO. */
  spentAtTransaction?: Maybe<Transaction>;
  /** Token hex-encoded serialized token type. */
  tokenType: Scalars['HexEncoded']['output'];
  /** UTXO value (quantity) as a string to support u128. */
  value: Scalars['String']['output'];
};

/** A zswap related ledger event. */
export type ZswapLedgerEvent = {
  __typename?: 'ZswapLedgerEvent';
  /** The ID of this zswap ledger event. */
  id: Scalars['Int']['output'];
  /** The maximum ID of all zswap ledger events. */
  maxId: Scalars['Int']['output'];
  /** The hex-encoded serialized event. */
  raw: Scalars['HexEncoded']['output'];
};

export type GetBlockByHeightQueryVariables = Exact<{
  height: Scalars['Int']['input'];
}>;


export type GetBlockByHeightQuery = { __typename?: 'Query', block?: { __typename?: 'Block', hash: any, height: number, protocolVersion: number, timestamp: number, author?: any | null, ledgerParameters: any, parent?: { __typename?: 'Block', height: number, hash: any } | null, transactions: Array<
      | { __typename: 'RegularTransaction', identifiers: Array<any>, merkleTreeRoot: any, startIndex: number, endIndex: number, id: number, hash: any, protocolVersion: number, raw: any, transactionResult: { __typename?: 'TransactionResult', status: TransactionResultStatus, segments?: Array<{ __typename?: 'Segment', id: number, success: boolean }> | null }, fees: { __typename?: 'TransactionFees', paidFees: string, estimatedFees: string }, block: { __typename?: 'Block', height: number, hash: any, protocolVersion: number, timestamp: number, author?: any | null, ledgerParameters: any }, contractActions: Array<
          | { __typename: 'ContractCall', entryPoint: string, address: any, state: any, zswapState: any, deploy: { __typename?: 'ContractDeploy', address: any, state: any, zswapState: any, transaction:
                | { __typename?: 'RegularTransaction', id: number, hash: any }
                | { __typename?: 'SystemTransaction', id: number, hash: any }
              , unshieldedBalances: Array<{ __typename?: 'ContractBalance', amount: string, tokenType: any }> }, transaction:
              | { __typename?: 'RegularTransaction', id: number, hash: any }
              | { __typename?: 'SystemTransaction', id: number, hash: any }
            , unshieldedBalances: Array<{ __typename?: 'ContractBalance', amount: string, tokenType: any }> }
          | { __typename: 'ContractDeploy', address: any, state: any, zswapState: any, transaction:
              | { __typename?: 'RegularTransaction', id: number, hash: any }
              | { __typename?: 'SystemTransaction', id: number, hash: any }
            , unshieldedBalances: Array<{ __typename?: 'ContractBalance', amount: string, tokenType: any }> }
          | { __typename: 'ContractUpdate', address: any, state: any, zswapState: any, transaction:
              | { __typename?: 'RegularTransaction', id: number, hash: any }
              | { __typename?: 'SystemTransaction', id: number, hash: any }
            , unshieldedBalances: Array<{ __typename?: 'ContractBalance', amount: string, tokenType: any }> }
        >, unshieldedCreatedOutputs: Array<{ __typename: 'UnshieldedUtxo', ctime?: number | null, initialNonce: any, intentHash: any, outputIndex: number, owner: any, registeredForDustGeneration: boolean, tokenType: any, value: string, createdAtTransaction:
            | { __typename?: 'RegularTransaction', id: number, hash: any }
            | { __typename?: 'SystemTransaction', id: number, hash: any }
          , spentAtTransaction?:
            | { __typename?: 'RegularTransaction', id: number, hash: any }
            | { __typename?: 'SystemTransaction', id: number, hash: any }
           | null }>, unshieldedSpentOutputs: Array<{ __typename: 'UnshieldedUtxo', ctime?: number | null, initialNonce: any, intentHash: any, outputIndex: number, owner: any, registeredForDustGeneration: boolean, tokenType: any, value: string, createdAtTransaction:
            | { __typename?: 'RegularTransaction', id: number, hash: any }
            | { __typename?: 'SystemTransaction', id: number, hash: any }
          , spentAtTransaction?:
            | { __typename?: 'RegularTransaction', id: number, hash: any }
            | { __typename?: 'SystemTransaction', id: number, hash: any }
           | null }>, zswapLedgerEvents: Array<{ __typename: 'ZswapLedgerEvent', id: number, maxId: number, raw: any }>, dustLedgerEvents: Array<
          | { __typename: 'DustGenerationDtimeUpdate', id: number, raw: any, maxId: number }
          | { __typename: 'DustInitialUtxo', id: number, raw: any, maxId: number, output: { __typename?: 'DustOutput', nonce: any } }
          | { __typename: 'DustSpendProcessed', id: number, raw: any, maxId: number }
          | { __typename: 'ParamChange', id: number, raw: any, maxId: number }
        > }
      | { __typename: 'SystemTransaction', id: number, hash: any, protocolVersion: number, raw: any, block: { __typename?: 'Block', height: number, hash: any, protocolVersion: number, timestamp: number, author?: any | null, ledgerParameters: any }, contractActions: Array<
          | { __typename: 'ContractCall', entryPoint: string, address: any, state: any, zswapState: any, deploy: { __typename?: 'ContractDeploy', address: any, state: any, zswapState: any, transaction:
                | { __typename?: 'RegularTransaction', id: number, hash: any }
                | { __typename?: 'SystemTransaction', id: number, hash: any }
              , unshieldedBalances: Array<{ __typename?: 'ContractBalance', amount: string, tokenType: any }> }, transaction:
              | { __typename?: 'RegularTransaction', id: number, hash: any }
              | { __typename?: 'SystemTransaction', id: number, hash: any }
            , unshieldedBalances: Array<{ __typename?: 'ContractBalance', amount: string, tokenType: any }> }
          | { __typename: 'ContractDeploy', address: any, state: any, zswapState: any, transaction:
              | { __typename?: 'RegularTransaction', id: number, hash: any }
              | { __typename?: 'SystemTransaction', id: number, hash: any }
            , unshieldedBalances: Array<{ __typename?: 'ContractBalance', amount: string, tokenType: any }> }
          | { __typename: 'ContractUpdate', address: any, state: any, zswapState: any, transaction:
              | { __typename?: 'RegularTransaction', id: number, hash: any }
              | { __typename?: 'SystemTransaction', id: number, hash: any }
            , unshieldedBalances: Array<{ __typename?: 'ContractBalance', amount: string, tokenType: any }> }
        >, unshieldedCreatedOutputs: Array<{ __typename: 'UnshieldedUtxo', ctime?: number | null, initialNonce: any, intentHash: any, outputIndex: number, owner: any, registeredForDustGeneration: boolean, tokenType: any, value: string, createdAtTransaction:
            | { __typename?: 'RegularTransaction', id: number, hash: any }
            | { __typename?: 'SystemTransaction', id: number, hash: any }
          , spentAtTransaction?:
            | { __typename?: 'RegularTransaction', id: number, hash: any }
            | { __typename?: 'SystemTransaction', id: number, hash: any }
           | null }>, unshieldedSpentOutputs: Array<{ __typename: 'UnshieldedUtxo', ctime?: number | null, initialNonce: any, intentHash: any, outputIndex: number, owner: any, registeredForDustGeneration: boolean, tokenType: any, value: string, createdAtTransaction:
            | { __typename?: 'RegularTransaction', id: number, hash: any }
            | { __typename?: 'SystemTransaction', id: number, hash: any }
          , spentAtTransaction?:
            | { __typename?: 'RegularTransaction', id: number, hash: any }
            | { __typename?: 'SystemTransaction', id: number, hash: any }
           | null }>, zswapLedgerEvents: Array<{ __typename: 'ZswapLedgerEvent', id: number, maxId: number, raw: any }>, dustLedgerEvents: Array<
          | { __typename: 'DustGenerationDtimeUpdate', id: number, raw: any, maxId: number }
          | { __typename: 'DustInitialUtxo', id: number, raw: any, maxId: number, output: { __typename?: 'DustOutput', nonce: any } }
          | { __typename: 'DustSpendProcessed', id: number, raw: any, maxId: number }
          | { __typename: 'ParamChange', id: number, raw: any, maxId: number }
        > }
    > } | null };

export type ConnectWalletMutationVariables = Exact<{
  viewingKey: Scalars['ViewingKey']['input'];
}>;


export type ConnectWalletMutation = { __typename?: 'Mutation', connect: any };

export type DisconnectWalletMutationVariables = Exact<{
  sessionId: Scalars['HexEncoded']['input'];
}>;


export type DisconnectWalletMutation = { __typename?: 'Mutation', disconnect: any };

export type BlocksSubscriptionVariables = Exact<{ [key: string]: never; }>;


export type BlocksSubscription = { __typename?: 'Subscription', blocks: { __typename?: 'Block', height: number, hash: any, protocolVersion: number, timestamp: number, author?: any | null, ledgerParameters: any, parent?: { __typename?: 'Block', height: number, hash: any } | null, transactions: Array<
      | { __typename: 'RegularTransaction', id: number, hash: any }
      | { __typename: 'SystemTransaction', id: number, hash: any }
    > } };

export type BlocksFromHeightSubscriptionVariables = Exact<{
  height: Scalars['Int']['input'];
}>;


export type BlocksFromHeightSubscription = { __typename?: 'Subscription', blocks: { __typename?: 'Block', height: number, hash: any, protocolVersion: number, timestamp: number, author?: any | null, ledgerParameters: any, parent?: { __typename?: 'Block', height: number, hash: any } | null, transactions: Array<
      | { __typename: 'RegularTransaction', id: number, hash: any }
      | { __typename: 'SystemTransaction', id: number, hash: any }
    > } };

export type BlocksFromHashSubscriptionVariables = Exact<{
  hash: Scalars['HexEncoded']['input'];
}>;


export type BlocksFromHashSubscription = { __typename?: 'Subscription', blocks: { __typename?: 'Block', height: number, hash: any, protocolVersion: number, timestamp: number, author?: any | null, ledgerParameters: any, parent?: { __typename?: 'Block', height: number, hash: any } | null, transactions: Array<
      | { __typename: 'RegularTransaction', id: number, hash: any }
      | { __typename: 'SystemTransaction', id: number, hash: any }
    > } };


export const GetBlockByHeightDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"GetBlockByHeight"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"height"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"block"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"height"},"value":{"kind":"Variable","name":{"kind":"Name","value":"height"}}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hash"}},{"kind":"Field","name":{"kind":"Name","value":"height"}},{"kind":"Field","name":{"kind":"Name","value":"protocolVersion"}},{"kind":"Field","name":{"kind":"Name","value":"timestamp"}},{"kind":"Field","name":{"kind":"Name","value":"author"}},{"kind":"Field","name":{"kind":"Name","value":"parent"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"height"}},{"kind":"Field","name":{"kind":"Name","value":"hash"}}]}},{"kind":"Field","name":{"kind":"Name","value":"transactions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"__typename"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"hash"}},{"kind":"Field","name":{"kind":"Name","value":"protocolVersion"}},{"kind":"Field","name":{"kind":"Name","value":"raw"}},{"kind":"Field","name":{"kind":"Name","value":"block"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"height"}},{"kind":"Field","name":{"kind":"Name","value":"hash"}},{"kind":"Field","name":{"kind":"Name","value":"protocolVersion"}},{"kind":"Field","name":{"kind":"Name","value":"timestamp"}},{"kind":"Field","name":{"kind":"Name","value":"author"}},{"kind":"Field","name":{"kind":"Name","value":"ledgerParameters"}}]}},{"kind":"Field","name":{"kind":"Name","value":"contractActions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"__typename"}},{"kind":"Field","name":{"kind":"Name","value":"address"}},{"kind":"Field","name":{"kind":"Name","value":"state"}},{"kind":"Field","name":{"kind":"Name","value":"transaction"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"hash"}}]}},{"kind":"Field","name":{"kind":"Name","value":"unshieldedBalances"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"tokenType"}}]}},{"kind":"Field","name":{"kind":"Name","value":"zswapState"}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"ContractCall"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"entryPoint"}},{"kind":"Field","name":{"kind":"Name","value":"deploy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"address"}},{"kind":"Field","name":{"kind":"Name","value":"state"}},{"kind":"Field","name":{"kind":"Name","value":"transaction"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"hash"}}]}},{"kind":"Field","name":{"kind":"Name","value":"unshieldedBalances"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"tokenType"}}]}},{"kind":"Field","name":{"kind":"Name","value":"zswapState"}}]}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"unshieldedCreatedOutputs"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"__typename"}},{"kind":"Field","name":{"kind":"Name","value":"createdAtTransaction"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"hash"}}]}},{"kind":"Field","name":{"kind":"Name","value":"ctime"}},{"kind":"Field","name":{"kind":"Name","value":"initialNonce"}},{"kind":"Field","name":{"kind":"Name","value":"intentHash"}},{"kind":"Field","name":{"kind":"Name","value":"outputIndex"}},{"kind":"Field","name":{"kind":"Name","value":"owner"}},{"kind":"Field","name":{"kind":"Name","value":"registeredForDustGeneration"}},{"kind":"Field","name":{"kind":"Name","value":"spentAtTransaction"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"hash"}}]}},{"kind":"Field","name":{"kind":"Name","value":"tokenType"}},{"kind":"Field","name":{"kind":"Name","value":"value"}}]}},{"kind":"Field","name":{"kind":"Name","value":"unshieldedSpentOutputs"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"__typename"}},{"kind":"Field","name":{"kind":"Name","value":"createdAtTransaction"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"hash"}}]}},{"kind":"Field","name":{"kind":"Name","value":"ctime"}},{"kind":"Field","name":{"kind":"Name","value":"initialNonce"}},{"kind":"Field","name":{"kind":"Name","value":"intentHash"}},{"kind":"Field","name":{"kind":"Name","value":"outputIndex"}},{"kind":"Field","name":{"kind":"Name","value":"owner"}},{"kind":"Field","name":{"kind":"Name","value":"registeredForDustGeneration"}},{"kind":"Field","name":{"kind":"Name","value":"spentAtTransaction"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"hash"}}]}},{"kind":"Field","name":{"kind":"Name","value":"tokenType"}},{"kind":"Field","name":{"kind":"Name","value":"value"}}]}},{"kind":"Field","name":{"kind":"Name","value":"zswapLedgerEvents"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"__typename"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"maxId"}},{"kind":"Field","name":{"kind":"Name","value":"raw"}}]}},{"kind":"Field","name":{"kind":"Name","value":"dustLedgerEvents"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"__typename"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"raw"}},{"kind":"Field","name":{"kind":"Name","value":"maxId"}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"DustInitialUtxo"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"output"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nonce"}}]}}]}}]}},{"kind":"InlineFragment","typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"RegularTransaction"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"transactionResult"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"segments"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"success"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"identifiers"}},{"kind":"Field","name":{"kind":"Name","value":"merkleTreeRoot"}},{"kind":"Field","name":{"kind":"Name","value":"startIndex"}},{"kind":"Field","name":{"kind":"Name","value":"endIndex"}},{"kind":"Field","name":{"kind":"Name","value":"fees"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"paidFees"}},{"kind":"Field","name":{"kind":"Name","value":"estimatedFees"}}]}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"ledgerParameters"}}]}}]}}]} as unknown as DocumentNode<GetBlockByHeightQuery, GetBlockByHeightQueryVariables>;
export const ConnectWalletDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ConnectWallet"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"viewingKey"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ViewingKey"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"connect"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"viewingKey"},"value":{"kind":"Variable","name":{"kind":"Name","value":"viewingKey"}}}]}]}}]} as unknown as DocumentNode<ConnectWalletMutation, ConnectWalletMutationVariables>;
export const DisconnectWalletDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DisconnectWallet"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"sessionId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"HexEncoded"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"disconnect"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"sessionId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"sessionId"}}}]}]}}]} as unknown as DocumentNode<DisconnectWalletMutation, DisconnectWalletMutationVariables>;
export const BlocksDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"subscription","name":{"kind":"Name","value":"Blocks"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"blocks"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"height"}},{"kind":"Field","name":{"kind":"Name","value":"hash"}},{"kind":"Field","name":{"kind":"Name","value":"protocolVersion"}},{"kind":"Field","name":{"kind":"Name","value":"timestamp"}},{"kind":"Field","name":{"kind":"Name","value":"author"}},{"kind":"Field","name":{"kind":"Name","value":"parent"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"height"}},{"kind":"Field","name":{"kind":"Name","value":"hash"}}]}},{"kind":"Field","name":{"kind":"Name","value":"transactions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"__typename"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"hash"}}]}},{"kind":"Field","name":{"kind":"Name","value":"ledgerParameters"}}]}}]}}]} as unknown as DocumentNode<BlocksSubscription, BlocksSubscriptionVariables>;
export const BlocksFromHeightDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"subscription","name":{"kind":"Name","value":"BlocksFromHeight"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"height"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"blocks"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"height"},"value":{"kind":"Variable","name":{"kind":"Name","value":"height"}}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"height"}},{"kind":"Field","name":{"kind":"Name","value":"hash"}},{"kind":"Field","name":{"kind":"Name","value":"protocolVersion"}},{"kind":"Field","name":{"kind":"Name","value":"timestamp"}},{"kind":"Field","name":{"kind":"Name","value":"author"}},{"kind":"Field","name":{"kind":"Name","value":"parent"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"height"}},{"kind":"Field","name":{"kind":"Name","value":"hash"}}]}},{"kind":"Field","name":{"kind":"Name","value":"transactions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"__typename"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"hash"}}]}},{"kind":"Field","name":{"kind":"Name","value":"ledgerParameters"}}]}}]}}]} as unknown as DocumentNode<BlocksFromHeightSubscription, BlocksFromHeightSubscriptionVariables>;
export const BlocksFromHashDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"subscription","name":{"kind":"Name","value":"BlocksFromHash"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"hash"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"HexEncoded"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"blocks"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"hash"},"value":{"kind":"Variable","name":{"kind":"Name","value":"hash"}}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"height"}},{"kind":"Field","name":{"kind":"Name","value":"hash"}},{"kind":"Field","name":{"kind":"Name","value":"protocolVersion"}},{"kind":"Field","name":{"kind":"Name","value":"timestamp"}},{"kind":"Field","name":{"kind":"Name","value":"author"}},{"kind":"Field","name":{"kind":"Name","value":"parent"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"height"}},{"kind":"Field","name":{"kind":"Name","value":"hash"}}]}},{"kind":"Field","name":{"kind":"Name","value":"transactions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"__typename"}},{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"hash"}}]}},{"kind":"Field","name":{"kind":"Name","value":"ledgerParameters"}}]}}]}}]} as unknown as DocumentNode<BlocksFromHashSubscription, BlocksFromHashSubscriptionVariables>;