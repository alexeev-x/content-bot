export type PostSortKey = 'title' | 'status' | 'updated' | 'revision' | 'channels' | 'sentAt' | 'left';
export type SortDirection = 'ascending' | 'descending';
export type PostSort = { key: PostSortKey; direction: SortDirection } | null;
