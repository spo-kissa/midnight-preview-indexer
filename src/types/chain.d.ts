
export type Block = {
    height: number;
    hash: string;
    parent_hash: string;
    timestamp: number;
    extrinsics_count: number;
};

export type Extrinsic = {
    hash: string;
    block_height: number;
    block_hash: string;
    index_in_block: number;
    section: string;
    method: string;
    args: string;
    data: string;
    success: number;
    timestamp: number;
};
