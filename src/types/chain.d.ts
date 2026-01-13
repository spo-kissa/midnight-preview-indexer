
export type Block = {
    height: number;
    hash: string;
    parent_hash: string;
    timestamp: number;
    extrinsics_count: number;
    raw?: any; // blockオブジェクトから取得したrawデータ（ヘッダー情報など）
    state_root?: string | null; // block.header.stateRoot
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
