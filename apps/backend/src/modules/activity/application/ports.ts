export interface ActivityRow {
  id: number;
  at: number;
  action: string;
  actor: string;
  entityType: string;
  entityId: string;
  details: string | null;
  title: string | null;
  postId: string | null;
  publicationId: string | null;
  channelTitle: string | null;
}

export interface ActivityRepository {
  /** Newest first: rows of `actions` in [from, to), strictly before the `before` key when given. */
  list(query: {
    actions: readonly string[];
    from: number | undefined;
    to: number | undefined;
    before: { at: number; id: number } | undefined;
    limit: number;
  }): Promise<ActivityRow[]>;
}
