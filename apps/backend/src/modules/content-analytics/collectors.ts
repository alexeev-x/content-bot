import {
  ChannelPreviewError,
  fetchChannelHistory,
  PREVIEW_HISTORY_PAGES
} from '../../integrations/telegram-preview/channel-preview';
import {
  fetchYouTubeChannelStats,
  isYouTubeChannelId,
  YOUTUBE_MAX_REQUESTS,
  YouTubeApiError
} from '../../integrations/youtube/youtube-data-api';
import {
  fetchTikTokAccount,
  fetchTikTokVideos,
  TIKTOK_VIDEO_PAGES,
  TikTokApiError
} from '../../integrations/tiktok/tiktok-api';
import type { Clock } from '../../platform/clock';
import { type TikTokConfig, type TikTokConnectionRepository, tiktokAccessToken } from './tiktok-connection';
import { type CollectedItem, ContentCollectError, type ContentCollector } from './types';

const TITLE_MAX = 200;
const TELEGRAM_USERNAME = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;

function firstLine(text: string): string {
  const line = text.split('\n').find((part) => part.trim() !== '') ?? '';
  const flat = line.replace(/\s+/g, ' ').trim();
  return flat.length > TITLE_MAX ? `${flat.slice(0, TITLE_MAX - 1)}…` : flat;
}

export interface CollectorConfig {
  telegramChannel?: string | undefined;
  youtubeChannelId?: string | undefined;
  youtubeApiKey?: string | undefined;
  tiktokClientKey?: string | undefined;
  tiktokClientSecret?: string | undefined;
}

/** What the TikTok collector needs besides configuration: its stored connection and the clock. */
export interface TikTokCollectorDeps {
  connections: TikTokConnectionRepository;
  clock: Clock;
}

export interface ConfiguredSources {
  collectors: ContentCollector[];
  /** Platforms whose collector is missing its configuration, with the public handle when one is known. */
  handles: Partial<Record<ContentCollector['platform'], { handle: string; profileUrl: string }>>;
  /** Set when the TikTok app keys exist: the owner can connect an account. */
  tiktok: TikTokConfig | null;
}

// Builds a collector for every platform the environment configures. A blank or malformed value
// means "not configured", never an error: the owner sees the platform as not connected.
export function configuredCollectors(
  config: CollectorConfig,
  fetchImpl: typeof fetch = fetch,
  tiktokDeps?: TikTokCollectorDeps
): ConfiguredSources {
  const collectors: ContentCollector[] = [];
  const handles: ConfiguredSources['handles'] = {};

  const telegram = config.telegramChannel?.trim().replace(/^@/, '') ?? '';
  if (TELEGRAM_USERNAME.test(telegram)) {
    const profileUrl = `https://t.me/${telegram}`;
    handles.telegram = { handle: telegram, profileUrl };
    collectors.push({
      platform: 'telegram',
      handle: telegram,
      profileUrl,
      requests: PREVIEW_HISTORY_PAGES,
      async collect() {
        try {
          const preview = await fetchChannelHistory(telegram, fetchImpl);
          return {
            ...(preview.partial === undefined ? {} : { warning: `TELEGRAM_HISTORY_${preview.partial}` }),
            followers: preview.subscribers,
            items: preview.posts.map((post): CollectedItem => ({
              externalId: String(post.messageId),
              title: firstLine(post.text),
              url: `https://t.me/${telegram}/${post.messageId}`,
              thumbnailUrl: post.thumbnailUrl,
              publishedAt: post.publishedAt,
              views: post.views,
              likes: post.reactions,
              comments: null,
              shares: null,
              tags: post.hashtags
            }))
          };
        } catch (error) {
          if (error instanceof ChannelPreviewError) throw new ContentCollectError(`TELEGRAM_${error.code}`);
          throw error;
        }
      }
    });
  }

  const channelId = config.youtubeChannelId?.trim() ?? '';
  const apiKey = config.youtubeApiKey?.trim() ?? '';
  if (isYouTubeChannelId(channelId)) {
    const profileUrl = `https://www.youtube.com/channel/${channelId}`;
    handles.youtube = { handle: channelId, profileUrl };
    if (apiKey !== '') {
      collectors.push({
        platform: 'youtube',
        handle: channelId,
        profileUrl,
        requests: YOUTUBE_MAX_REQUESTS,
        async collect() {
          try {
            const stats = await fetchYouTubeChannelStats({ apiKey, channelId }, fetchImpl);
            return {
              followers: stats.subscribers,
              items: stats.videos.map((video): CollectedItem => ({
                externalId: video.videoId,
                title: firstLine(video.title),
                url: `https://www.youtube.com/shorts/${video.videoId}`,
                thumbnailUrl: video.thumbnailUrl,
                publishedAt: video.publishedAt,
                views: video.views,
                likes: video.likes,
                comments: video.comments,
                shares: null
              }))
            };
          } catch (error) {
            if (error instanceof YouTubeApiError) throw new ContentCollectError(error.code);
            throw error;
          }
        }
      });
    }
  }

  const clientKey = config.tiktokClientKey?.trim() ?? '';
  const clientSecret = config.tiktokClientSecret?.trim() ?? '';
  const tiktok = clientKey !== '' && clientSecret !== '' ? { clientKey, clientSecret } : null;
  if (tiktok !== null && tiktokDeps !== undefined) {
    const deps = { repo: tiktokDeps.connections, config: tiktok, clock: tiktokDeps.clock, fetchImpl };
    collectors.push({
      platform: 'tiktok',
      handle: 'tiktok',
      profileUrl: 'https://www.tiktok.com',
      // A refresh, the account and up to five video pages.
      requests: 2 + TIKTOK_VIDEO_PAGES,
      ready: async () => (await tiktokDeps.connections.load()) !== null,
      async collect() {
        try {
          const { accessToken } = await tiktokAccessToken(deps);
          const account = await fetchTikTokAccount(accessToken, fetchImpl);
          const videos = await fetchTikTokVideos(accessToken, fetchImpl);
          const profile =
            account.username === null ? 'https://www.tiktok.com' : `https://www.tiktok.com/@${account.username}`;
          return {
            followers: account.followers,
            items: videos.map((video): CollectedItem => ({
              externalId: video.id,
              title: firstLine(video.title),
              url: video.shareUrl ?? `${profile}/video/${video.id}`,
              thumbnailUrl: video.coverUrl !== null && video.coverUrl.length <= 2048 ? video.coverUrl : null,
              publishedAt: video.createdAt,
              views: video.views,
              likes: video.likes,
              comments: video.comments,
              shares: video.shares
            }))
          };
        } catch (error) {
          if (error instanceof TikTokApiError) {
            throw new ContentCollectError(error.code === 'TIKTOK_AUTH' ? 'TIKTOK_RECONNECT' : error.code);
          }
          throw error;
        }
      }
    });
  }

  return { collectors, handles, tiktok };
}
