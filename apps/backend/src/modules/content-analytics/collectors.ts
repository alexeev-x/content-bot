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
}

export interface ConfiguredSources {
  collectors: ContentCollector[];
  /** Platforms whose collector is missing its configuration, with the public handle when one is known. */
  handles: Partial<Record<ContentCollector['platform'], { handle: string; profileUrl: string }>>;
}

// Builds a collector for every platform the environment configures. A blank or malformed value
// means "not configured", never an error: the owner sees the platform as not connected.
export function configuredCollectors(config: CollectorConfig, fetchImpl: typeof fetch = fetch): ConfiguredSources {
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
              shares: null
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

  return { collectors, handles };
}
