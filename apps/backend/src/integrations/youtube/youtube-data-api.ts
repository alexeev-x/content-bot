import { z } from 'zod';
import { readCappedText } from '../../platform/http/read-capped-text';

// YouTube Data API v3 with an API key: public counters only (subscribers, views, likes, comments).
// Three calls, 3 quota units of the free 10 000 a day. Retention and watch time need the owner's
// OAuth (YouTube Analytics API) and are not part of this client. The key travels in the query
// string, so request URLs are never logged.

export const YOUTUBE_TIMEOUT_MS = 8_000;
const API = 'https://www.googleapis.com/youtube/v3';
// 50 videos with snippets are about 60 KB; anything far beyond is not a response we asked for.
const MAX_BODY_BYTES = 1_000_000;
export const YOUTUBE_MAX_VIDEOS = 50;

export type YouTubeErrorCode =
  'YOUTUBE_FETCH' | 'YOUTUBE_KEY' | 'YOUTUBE_QUOTA' | 'YOUTUBE_HTTP' | 'YOUTUBE_SHAPE' | 'YOUTUBE_CHANNEL_NOT_FOUND';

export class YouTubeApiError extends Error {
  constructor(
    readonly code: YouTubeErrorCode,
    readonly httpStatus: number | null = null
  ) {
    super(code);
    this.name = 'YouTubeApiError';
  }
}

export interface YouTubeVideo {
  videoId: string;
  title: string;
  publishedAt: number;
  thumbnailUrl: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
}

export interface YouTubeChannelStats {
  /** Null when the channel hides its subscriber count. */
  subscribers: number | null;
  /** Newest first, at most 50. */
  videos: YouTubeVideo[];
}

const countString = z
  .string()
  .regex(/^\d{1,15}$/)
  .transform(Number);

const channelsSchema = z.object({
  items: z
    .array(
      z.object({
        statistics: z.object({
          subscriberCount: countString.optional(),
          hiddenSubscriberCount: z.boolean().optional()
        })
      })
    )
    .max(1)
    .optional()
});

const playlistItemsSchema = z.object({
  items: z
    .array(z.object({ contentDetails: z.object({ videoId: z.string().regex(/^[A-Za-z0-9_-]{6,20}$/) }) }))
    .max(YOUTUBE_MAX_VIDEOS)
});

const thumbnailSchema = z.object({ url: z.url().max(2048) }).optional();
const videosSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().regex(/^[A-Za-z0-9_-]{6,20}$/),
        snippet: z.object({
          title: z.string().max(500),
          publishedAt: z.iso.datetime({ offset: true }),
          thumbnails: z.object({ medium: thumbnailSchema, default: thumbnailSchema }).optional()
        }),
        statistics: z
          .object({
            viewCount: countString.optional(),
            likeCount: countString.optional(),
            commentCount: countString.optional()
          })
          .optional()
      })
    )
    .max(YOUTUBE_MAX_VIDEOS)
});

const errorSchema = z.object({
  error: z.object({
    errors: z
      .array(z.object({ reason: z.string().max(100) }))
      .max(10)
      .optional()
  })
});

export function isYouTubeChannelId(value: string): boolean {
  return /^UC[A-Za-z0-9_-]{22}$/.test(value);
}

export async function fetchYouTubeChannelStats(
  input: { apiKey: string; channelId: string },
  fetchImpl: typeof fetch = fetch
): Promise<YouTubeChannelStats> {
  const call = async <T>(path: string, params: Record<string, string>, schema: z.ZodType<T>): Promise<T> => {
    const url = new URL(`${API}/${path}`);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    url.searchParams.set('key', input.apiKey);
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(YOUTUBE_TIMEOUT_MS),
        redirect: 'manual'
      });
    } catch {
      throw new YouTubeApiError('YOUTUBE_FETCH');
    }
    let body: unknown;
    try {
      const text = await readCappedText(response, MAX_BODY_BYTES);
      if (text === null) throw new YouTubeApiError('YOUTUBE_SHAPE', response.status);
      body = JSON.parse(text);
    } catch (error) {
      if (error instanceof YouTubeApiError) throw error;
      throw new YouTubeApiError(response.ok ? 'YOUTUBE_SHAPE' : 'YOUTUBE_HTTP', response.status);
    }
    if (!response.ok) {
      const reasons = errorSchema.safeParse(body).data?.error.errors?.map((e) => e.reason) ?? [];
      if (reasons.some((r) => r === 'quotaExceeded' || r === 'dailyLimitExceeded' || r === 'rateLimitExceeded')) {
        throw new YouTubeApiError('YOUTUBE_QUOTA', response.status);
      }
      if (response.status === 400 || response.status === 403) throw new YouTubeApiError('YOUTUBE_KEY', response.status);
      throw new YouTubeApiError('YOUTUBE_HTTP', response.status);
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new YouTubeApiError('YOUTUBE_SHAPE', response.status);
    return parsed.data;
  };

  // The uploads playlist of a channel is its id with `UC` replaced by `UU`.
  const [channels, uploads] = await Promise.all([
    call('channels', { part: 'statistics', id: input.channelId }, channelsSchema),
    call(
      'playlistItems',
      { part: 'contentDetails', playlistId: `UU${input.channelId.slice(2)}`, maxResults: String(YOUTUBE_MAX_VIDEOS) },
      playlistItemsSchema
    )
  ]);
  const channel = channels.items?.[0];
  if (channel === undefined) throw new YouTubeApiError('YOUTUBE_CHANNEL_NOT_FOUND');
  const subscribers =
    channel.statistics.hiddenSubscriberCount === true ? null : (channel.statistics.subscriberCount ?? null);

  const ids = uploads.items.map((item) => item.contentDetails.videoId);
  if (ids.length === 0) return { subscribers, videos: [] };
  const videos = await call('videos', { part: 'snippet,statistics', id: ids.join(',') }, videosSchema);
  return {
    subscribers,
    videos: videos.items
      .map((video) => ({
        videoId: video.id,
        title: video.snippet.title,
        publishedAt: Date.parse(video.snippet.publishedAt),
        thumbnailUrl: video.snippet.thumbnails?.medium?.url ?? video.snippet.thumbnails?.default?.url ?? null,
        views: video.statistics?.viewCount ?? null,
        likes: video.statistics?.likeCount ?? null,
        comments: video.statistics?.commentCount ?? null
      }))
      .sort((a, b) => b.publishedAt - a.publishedAt)
  };
}
