import type { ContentPlatform } from '@alexeev/contracts';

export type { ContentPlatform };

export const CONTENT_PLATFORMS: readonly ContentPlatform[] = ['telegram', 'youtube', 'tiktok'];

export type VideoFormat = 'fidit' | 'igrat' | 'standalone';

/**
 * Consumer-owned port: the rubric of a video, which the owner confirms by linking it to its AI script (the AI
 * module holds those links; `app/container.ts` wires them here).
 */
export interface ItemFormats {
  formatOf(itemId: string): Promise<VideoFormat | null>;
  /** Ids of the videos linked to scripts of `format` (bounded by the adapter). */
  itemsOf(format: VideoFormat): Promise<string[]>;
}

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
  /** When present and false, the source is skipped before any claim (an OAuth platform not connected yet). */
  ready?: () => Promise<boolean>;
  collect(): Promise<Collection>;
}

/** A failure a collector classified; its `code` is stored and shown to the owner. */
export class ContentCollectError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ContentCollectError';
  }
}
