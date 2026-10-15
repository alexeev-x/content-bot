import type { ContentPlatform } from '@alexeev/contracts';

export type { ContentPlatform };

export const CONTENT_PLATFORMS: readonly ContentPlatform[] = ['telegram', 'youtube', 'tiktok'];

/** One post or video as a source reports it now. */
export interface CollectedItem {
  externalId: string;
  title: string;
  url: string;
  thumbnailUrl: string | null;
  publishedAt: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

export interface Collection {
  followers: number | null;
  items: CollectedItem[];
  /** Stable code of a non-fatal problem (e.g. an older page failed); logged, the collection still counts. */
  warning?: string;
}

/** A configured source of one platform; an unconfigured platform has none. */
export interface ContentCollector {
  platform: ContentPlatform;
  handle: string;
  profileUrl: string;
  /** Outbound requests one collection makes; they count against the invocation's subrequest budget. */
  requests: number;
  collect(): Promise<Collection>;
}

/** A failure a collector classified; its `code` is stored and shown to the owner. */
export class ContentCollectError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ContentCollectError';
  }
}
