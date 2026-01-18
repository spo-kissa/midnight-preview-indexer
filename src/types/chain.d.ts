
export type Block = {
    height: number;
    hash: string;
    parentHash: string;
    stateRoot: string;
    timestamp: number;
    isFinalized: boolean;
    extrinsics: Extrinsic[];
    raw: BlockRaw;
};

export type Extrinsic = {
    index: number;
    blockHeight: number;
    blockHash: string;
    indexInBlock: number;
    hash: string;
    section: string;
    method: {
        section: string;
        method: string;
        args: string[];
    };
    signer: string | null;
    signature: string | null;
    era: string | null;
    nonce: string | null;
    tip: string | null;
    isSigned: boolean;
    length: number;
    data: string;
    timestamp: number;
};

/**
 * ブロックのrawデータ
 */
export type BlockRaw = {
    blockHash: string;
    blockNumber: number;
    timestamp: number;
    header: {
        header: string;
        number: string;
        parentHash: string;
        stateRoot: string;
        extrinsicsRoot: string;
        digest: string;
        encodedLength: number;
        isEmpty: boolean;
        registry: string | null;
    };
    extrinsicsCount: number;
    events: {
        index: number;
        phase: string;
        event: string;
        topics: string[];
    }[];
    eventsCount: number;
    justifications: string | null;
    encodedLength: number;
    isEmpty: boolean;
};
