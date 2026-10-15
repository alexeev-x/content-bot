import { readCappedText } from '../../platform/http/read-capped-text';

// The public web preview of a Telegram channel (`https://t.me/s/<username>`): the only keyless source
// of per-post views. The Bot API reports neither views nor reactions of channel posts. The page shows
// the latest ~20 posts; its markup is not a documented API, so every field is optional and a page
// without posts is reported as a shape error instead of an empty channel.

export const PREVIEW_TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 1_000_000;
const MAX_POSTS = 30;
const MAX_TEXT = 400;

export interface ChannelPreviewPost {
  /** The message id inside the channel. */
  messageId: number;
  text: string;
  publishedAt: number;
  views: number | null;
  /** The sum of the shown reaction counters. */
  reactions: number | null;
  thumbnailUrl: string | null;
}

export interface ChannelPreview {
  subscribers: number | null;
  posts: ChannelPreviewPost[];
}

export type ChannelPreviewErrorCode = 'PREVIEW_FETCH' | 'PREVIEW_HTTP' | 'PREVIEW_BODY_LIMIT' | 'PREVIEW_SHAPE';

export class ChannelPreviewError extends Error {
  constructor(
    readonly code: ChannelPreviewErrorCode,
    readonly httpStatus: number | null = null
  ) {
    super(code);
    this.name = 'ChannelPreviewError';
  }
}

/** `836`, `1.2K`, `3,4M` → a whole number; anything else → null. */
export function parseCompactCount(raw: string): number | null {
  const match = /^([\d]+(?:[.,]\d+)?)\s*([KkMm])?$/.exec(raw.trim());
  if (match === null) return null;
  const value = Number(match[1]?.replace(',', '.'));
  const suffix = match[2]?.toUpperCase();
  const multiplier = suffix === 'K' ? 1_000 : suffix === 'M' ? 1_000_000 : 1;
  const result = Math.round(value * multiplier);
  return Number.isSafeInteger(result) ? result : null;
}

const BACKGROUND_URL = /background-image:url\('(https:\/\/[^']+)'\)/;

export async function parseChannelPreview(body: string, username: string): Promise<ChannelPreview> {
  let subscribers: number | null = null;
  const posts: ChannelPreviewPost[] = [];
  let current: (ChannelPreviewPost & { reactionParts: number[] }) | null = null;
  let counterValue = '';
  let counterType = '';
  let viewsText = '';
  let reactionText = '';
  let inText = false;
  const prefix = `${username.toLowerCase()}/`;

  const finish = (): void => {
    if (current === null) return;
    const { reactionParts, ...post } = current;
    if (Number.isFinite(post.publishedAt) && post.publishedAt > 0) {
      posts.push({
        ...post,
        text: post.text.trim(),
        reactions: reactionParts.length === 0 ? null : reactionParts.reduce((sum, n) => sum + n, 0)
      });
    }
    current = null;
  };

  const rewriter = new HTMLRewriter()
    .on('.tgme_channel_info_counter', {
      element(element) {
        counterValue = '';
        counterType = '';
        element.onEndTag(() => {
          if (counterType.trim() === 'subscribers' || counterType.trim() === 'subscriber') {
            subscribers = parseCompactCount(counterValue);
          }
        });
      }
    })
    .on('.tgme_channel_info_counter .counter_value', {
      text(chunk) {
        counterValue += chunk.text;
      }
    })
    .on('.tgme_channel_info_counter .counter_type', {
      text(chunk) {
        counterType += chunk.text;
      }
    })
    .on('.tgme_widget_message[data-post]', {
      element(element) {
        finish();
        const dataPost = (element.getAttribute('data-post') ?? '').toLowerCase();
        const id = dataPost.startsWith(prefix) ? Number(dataPost.slice(prefix.length)) : Number.NaN;
        if (!Number.isSafeInteger(id) || id <= 0 || posts.length >= MAX_POSTS) return;
        current = {
          messageId: id,
          text: '',
          publishedAt: Number.NaN,
          views: null,
          reactions: null,
          thumbnailUrl: null,
          reactionParts: []
        };
      }
    })
    .on('.tgme_widget_message_text', {
      element(element) {
        if (current === null || current.text !== '') return;
        inText = true;
        element.onEndTag(() => {
          inText = false;
        });
      },
      text(chunk) {
        if (current !== null && inText && current.text.length < MAX_TEXT) current.text += decodeEntities(chunk.text);
      }
    })
    .on('.tgme_widget_message_text br', {
      element() {
        if (current !== null && inText) current.text += '\n';
      }
    })
    .on('.tgme_widget_message_photo_wrap, .tgme_widget_message_video_thumb', {
      element(element) {
        if (current === null || current.thumbnailUrl !== null) return;
        const url = BACKGROUND_URL.exec(element.getAttribute('style') ?? '')?.[1];
        if (url !== undefined && url.length <= 2048) current.thumbnailUrl = url;
      }
    })
    .on('.tgme_widget_message_views', {
      element(element) {
        viewsText = '';
        element.onEndTag(() => {
          if (current !== null) current.views = parseCompactCount(viewsText);
        });
      },
      text(chunk) {
        viewsText += chunk.text;
      }
    })
    .on('.tgme_reaction', {
      element(element) {
        reactionText = '';
        element.onEndTag(() => {
          // The emoji, when it is not a custom one, comes as text before the counter.
          const count = parseCompactCount(/[\d.,]+[KkMm]?\s*$/.exec(reactionText)?.[0] ?? '');
          if (current !== null && count !== null) current.reactionParts.push(count);
        });
      },
      text(chunk) {
        reactionText += chunk.text;
      }
    })
    .on('.tgme_widget_message_date time[datetime]', {
      element(element) {
        if (current === null) return;
        current.publishedAt = Date.parse(element.getAttribute('datetime') ?? '');
      }
    });

  await rewriter.transform(new Response(body)).arrayBuffer();
  finish();
  return { subscribers, posts };
}

// HTMLRewriter hands text chunks with entities still encoded.
function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

export async function fetchChannelPreview(username: string, fetchImpl: typeof fetch = fetch): Promise<ChannelPreview> {
  let response: Response;
  try {
    response = await fetchImpl(`https://t.me/s/${encodeURIComponent(username)}`, {
      method: 'GET',
      headers: { accept: 'text/html' },
      signal: AbortSignal.timeout(PREVIEW_TIMEOUT_MS),
      redirect: 'manual'
    });
  } catch {
    throw new ChannelPreviewError('PREVIEW_FETCH');
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new ChannelPreviewError('PREVIEW_HTTP', response.status);
  }
  let body: string | null;
  try {
    body = await readCappedText(response, MAX_BODY_BYTES);
  } catch {
    throw new ChannelPreviewError('PREVIEW_FETCH');
  }
  if (body === null) throw new ChannelPreviewError('PREVIEW_BODY_LIMIT');
  const preview = await parseChannelPreview(body, username);
  if (preview.posts.length === 0 && preview.subscribers === null) throw new ChannelPreviewError('PREVIEW_SHAPE');
  return preview;
}
