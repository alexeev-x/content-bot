import { readCappedText } from '../../platform/http/read-capped-text';

// The public web preview of a Telegram channel (`https://t.me/s/<username>`): the only keyless source
// of per-post views. The Bot API reports neither views nor reactions of channel posts. The page shows
// the latest ~20 posts; its markup is not a documented API, so every field is optional and a page
// without posts is reported as a shape error instead of an empty channel.

export const PREVIEW_TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 1_000_000;
const MAX_POSTS = 30;
const MAX_TEXT = 400;
const MAX_HASHTAGS = 10;
/** Telegram links a hashtag in the preview to a channel search: `?q=%23tag`. */
const HASHTAG_HREF = '?q=%23';

export interface ChannelPreviewPost {
  /** The message id inside the channel. */
  messageId: number;
  text: string;
  /**
   * The post's hashtags without «#», lower case, at most MAX_HASHTAGS: read from the whole text, past the MAX_TEXT cut
   * (a rubric tag usually closes a long post).
   */
  hashtags: string[];
  publishedAt: number;
  views: number | null;
  /** The sum of the shown reaction counters. */
  reactions: number | null;
  thumbnailUrl: string | null;
}

export interface ChannelPreview {
  subscribers: number | null;
  posts: ChannelPreviewPost[];
  /** An older page failed: the history is shorter than asked, the newest page is complete. */
  partial?: ChannelPreviewErrorCode;
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
  let hashtag: string | null = null;
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
          hashtags: [],
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
        // A reply quotes the post it answers in the same class before its own text: the quote is not this post (its
        // first line would become the title and put the reply in the quoted post's rubric).
        if ((element.getAttribute('class') ?? '').includes('js-message_reply_text')) return;
        inText = true;
        element.onEndTag(() => {
          inText = false;
        });
      },
      text(chunk) {
        if (current !== null && inText && current.text.length < MAX_TEXT) current.text += decodeEntities(chunk.text);
      }
    })
    .on('.tgme_widget_message_text a', {
      element(element) {
        if (current === null || !inText || !(element.getAttribute('href') ?? '').startsWith(HASHTAG_HREF)) return;
        hashtag = '';
        element.onEndTag(() => {
          const tag = (hashtag ?? '').trim().replace(/^#/, '').toLowerCase();
          hashtag = null;
          if (current === null || !/^[\p{L}\p{N}_]{2,32}$/u.test(tag)) return;
          if (!current.hashtags.includes(tag) && current.hashtags.length < MAX_HASHTAGS) current.hashtags.push(tag);
        });
      },
      text(chunk) {
        if (hashtag !== null) hashtag += decodeEntities(chunk.text);
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

/** Older pages read per run (`?before=<id>`), ~20 posts each: the history behind the comparisons. */
export const PREVIEW_HISTORY_PAGES = 5;

// The newest page, then older pages until PREVIEW_HISTORY_PAGES or the channel's start. A failure on an
// older page keeps what was read: the newest page alone is still a valid collection.
export async function fetchChannelHistory(
  username: string,
  fetchImpl: typeof fetch = fetch,
  pages: number = PREVIEW_HISTORY_PAGES
): Promise<ChannelPreview> {
  const first = await fetchChannelPreview(username, fetchImpl);
  const posts = [...first.posts];
  for (let page = 1; page < pages; page += 1) {
    const oldest = Math.min(...posts.map((post) => post.messageId));
    if (!Number.isFinite(oldest) || oldest <= 1) break;
    let older: ChannelPreview;
    try {
      older = await fetchChannelPreview(username, fetchImpl, oldest);
    } catch (error) {
      // Reported, not thrown: the collector logs it and keeps what was read.
      return {
        subscribers: first.subscribers,
        posts,
        partial: error instanceof ChannelPreviewError ? error.code : 'PREVIEW_FETCH'
      };
    }
    const fresh = older.posts.filter((post) => post.messageId < oldest);
    if (fresh.length === 0) break;
    posts.push(...fresh);
  }
  return { subscribers: first.subscribers, posts };
}

export async function fetchChannelPreview(
  username: string,
  fetchImpl: typeof fetch = fetch,
  before?: number
): Promise<ChannelPreview> {
  let response: Response;
  try {
    const query = before === undefined ? '' : `?before=${before}`;
    response = await fetchImpl(`https://t.me/s/${encodeURIComponent(username)}${query}`, {
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
