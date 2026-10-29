import { z } from 'zod';
import { boundDetail, causeDetail } from '../../platform/error-detail';
import { readCappedText } from '../../platform/http/read-capped-text';

// TikTok Login Kit (web) and Display API v2: the owner's own account statistics and public videos.
// https://developers.tiktok.com/doc/login-kit-web, /doc/oauth-user-access-token-management,
// /doc/tiktok-api-v2-get-user-info, /doc/tiktok-api-v2-video-list (checked 15.10.2026).
// Tokens and the client secret travel only in request bodies and headers; nothing here logs them.

export const TIKTOK_TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 1_000_000;
const AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const API = 'https://open.tiktokapis.com/v2';
export const TIKTOK_SCOPES = ['user.info.basic', 'user.info.profile', 'user.info.stats', 'video.list'] as const;
/** Videos per page is capped at 20 by TikTok; 5 pages give the 100 newest. */
export const TIKTOK_VIDEO_PAGES = 5;
const TIKTOK_PAGE_SIZE = 20;

export type TikTokErrorCode =
  'TIKTOK_FETCH' | 'TIKTOK_AUTH' | 'TIKTOK_SCOPE' | 'TIKTOK_RATE' | 'TIKTOK_HTTP' | 'TIKTOK_SHAPE';

export class TikTokApiError extends Error {
  constructor(
    readonly code: TikTokErrorCode,
    readonly httpStatus: number | null = null,
    /** The provider's own error text, bounded and redacted (`platform/error-detail.ts`). */
    readonly detail?: string
  ) {
    super(code);
    this.name = 'TikTokApiError';
  }
}

export interface TikTokTokens {
  accessToken: string;
  accessExpiresAt: number;
  refreshToken: string;
  refreshExpiresAt: number;
  openId: string;
  scope: string;
}

export interface TikTokAccount {
  openId: string;
  username: string | null;
  displayName: string | null;
  followers: number | null;
  likes: number | null;
  videoCount: number | null;
}

export interface TikTokVideo {
  id: string;
  title: string;
  createdAt: number;
  coverUrl: string | null;
  shareUrl: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

export function tiktokAuthorizeUrl(input: { clientKey: string; redirectUri: string; state: string }): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_key', input.clientKey);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', TIKTOK_SCOPES.join(','));
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('state', input.state);
  return url.toString();
}

const tokenSchema = z.object({
  access_token: z.string().min(1).max(2048),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).max(2048),
  refresh_expires_in: z.number().int().positive(),
  open_id: z.string().min(1).max(200),
  scope: z.string().max(500)
});
const oauthErrorSchema = z.object({ error: z.string().max(100) });

const count = z.number().int().nonnegative().optional();
const apiErrorSchema = z.object({ code: z.string().max(100), message: z.string().max(1000).optional() });
const userSchema = z.object({
  data: z.object({
    user: z.object({
      open_id: z.string().min(1).max(200),
      username: z.string().max(100).optional(),
      display_name: z.string().max(200).optional(),
      follower_count: count,
      likes_count: count,
      video_count: count
    })
  }),
  error: apiErrorSchema
});
const videoSchema = z.object({
  id: z.string().regex(/^\d{1,30}$/),
  title: z.string().max(2000).optional(),
  video_description: z.string().max(5000).optional(),
  create_time: z.number().int().nonnegative(),
  cover_image_url: z.string().max(4096).optional(),
  share_url: z.string().max(2048).optional(),
  view_count: count,
  like_count: count,
  comment_count: count,
  share_count: count
});
const videoListSchema = z.object({
  data: z.object({
    videos: z.array(videoSchema).max(TIKTOK_PAGE_SIZE).optional(),
    cursor: z.number().int().nonnegative().optional(),
    has_more: z.boolean().optional()
  }),
  error: apiErrorSchema
});

async function readJson(response: Response): Promise<unknown> {
  const text = await readCappedText(response, MAX_BODY_BYTES);
  if (text === null) throw new TikTokApiError('TIKTOK_SHAPE', response.status);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new TikTokApiError(response.ok ? 'TIKTOK_SHAPE' : 'TIKTOK_HTTP', response.status);
  }
}

// TikTok reports API failures in `error.code` (often with HTTP 4xx); map them to our stable codes.
function classify(code: string | undefined, status: number): TikTokErrorCode {
  if (code === 'access_token_invalid' || code === 'invalid_grant' || code === 'invalid_client' || status === 401) {
    return 'TIKTOK_AUTH';
  }
  if (code === 'scope_not_authorized' || code === 'scope_permission_missed') return 'TIKTOK_SCOPE';
  if (code === 'rate_limit_exceeded' || status === 429) return 'TIKTOK_RATE';
  return 'TIKTOK_HTTP';
}

async function send(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIKTOK_TIMEOUT_MS), redirect: 'manual' });
  } catch (error) {
    throw new TikTokApiError('TIKTOK_FETCH', null, causeDetail(error));
  }
}

async function tokenRequest(fetchImpl: typeof fetch, body: Record<string, string>, now: number): Promise<TikTokTokens> {
  const response = await send(fetchImpl, `${API}/oauth/token/`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams(body).toString()
  });
  const json = await readJson(response);
  const failure = oauthErrorSchema.safeParse(json);
  if (!response.ok || failure.success)
    throw new TikTokApiError(
      classify(failure.data?.error, response.status),
      response.status,
      failure.data?.error === undefined ? undefined : boundDetail(`TikTok error: ${failure.data.error}`)
    );
  const parsed = tokenSchema.safeParse(json);
  if (!parsed.success) throw new TikTokApiError('TIKTOK_SHAPE', response.status);
  return {
    accessToken: parsed.data.access_token,
    accessExpiresAt: now + parsed.data.expires_in * 1000,
    refreshToken: parsed.data.refresh_token,
    refreshExpiresAt: now + parsed.data.refresh_expires_in * 1000,
    openId: parsed.data.open_id,
    scope: parsed.data.scope
  };
}

export function exchangeTikTokCode(
  input: { clientKey: string; clientSecret: string; code: string; redirectUri: string; now: number },
  fetchImpl: typeof fetch = fetch
): Promise<TikTokTokens> {
  return tokenRequest(
    fetchImpl,
    {
      client_key: input.clientKey,
      client_secret: input.clientSecret,
      code: input.code,
      grant_type: 'authorization_code',
      redirect_uri: input.redirectUri
    },
    input.now
  );
}

export function refreshTikTokTokens(
  input: { clientKey: string; clientSecret: string; refreshToken: string; now: number },
  fetchImpl: typeof fetch = fetch
): Promise<TikTokTokens> {
  return tokenRequest(
    fetchImpl,
    {
      client_key: input.clientKey,
      client_secret: input.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: input.refreshToken
    },
    input.now
  );
}

/** Best effort: a failed revoke is reported, the caller still forgets the tokens. */
export async function revokeTikTokToken(
  input: { clientKey: string; clientSecret: string; accessToken: string },
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const response = await send(fetchImpl, `${API}/oauth/revoke/`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      client_key: input.clientKey,
      client_secret: input.clientSecret,
      token: input.accessToken
    }).toString()
  });
  await response.body?.cancel();
  if (!response.ok) throw new TikTokApiError(classify(undefined, response.status), response.status);
}

export async function fetchTikTokAccount(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<TikTokAccount> {
  const url = `${API}/user/info/?fields=open_id,username,display_name,follower_count,likes_count,video_count`;
  const response = await send(fetchImpl, url, {
    method: 'GET',
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' }
  });
  const json = await readJson(response);
  const errorCode = z.object({ error: apiErrorSchema }).safeParse(json).data?.error.code;
  if (!response.ok || (errorCode !== undefined && errorCode !== 'ok')) {
    throw new TikTokApiError(
      classify(errorCode, response.status),
      response.status,
      errorCode === undefined ? undefined : boundDetail(`TikTok error: ${errorCode}`)
    );
  }
  const parsed = userSchema.safeParse(json);
  if (!parsed.success) throw new TikTokApiError('TIKTOK_SHAPE', response.status);
  const user = parsed.data.data.user;
  return {
    openId: user.open_id,
    username: user.username ?? null,
    displayName: user.display_name ?? null,
    followers: user.follower_count ?? null,
    likes: user.likes_count ?? null,
    videoCount: user.video_count ?? null
  };
}

/** The newest public videos, at most TIKTOK_VIDEO_PAGES pages; the cursor must move back in time. */
export async function fetchTikTokVideos(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<TikTokVideo[]> {
  const fields =
    'id,title,video_description,create_time,cover_image_url,share_url,view_count,like_count,comment_count,share_count';
  const videos: TikTokVideo[] = [];
  let cursor: number | undefined;
  for (let page = 0; page < TIKTOK_VIDEO_PAGES; page += 1) {
    const response = await send(fetchImpl, `${API}/video/list/?fields=${fields}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify(
        cursor === undefined ? { max_count: TIKTOK_PAGE_SIZE } : { max_count: TIKTOK_PAGE_SIZE, cursor }
      )
    });
    const json = await readJson(response);
    const errorCode = z.object({ error: apiErrorSchema }).safeParse(json).data?.error.code;
    if (!response.ok || (errorCode !== undefined && errorCode !== 'ok')) {
      throw new TikTokApiError(
        classify(errorCode, response.status),
        response.status,
        errorCode === undefined ? undefined : boundDetail(`TikTok error: ${errorCode}`)
      );
    }
    const parsed = videoListSchema.safeParse(json);
    if (!parsed.success) throw new TikTokApiError('TIKTOK_SHAPE', response.status);
    for (const video of parsed.data.data.videos ?? []) {
      const description = (video.video_description ?? '').trim();
      videos.push({
        id: video.id,
        title: (video.title ?? '').trim() || description,
        createdAt: video.create_time * 1000,
        coverUrl: video.cover_image_url?.startsWith('https://') ? video.cover_image_url : null,
        shareUrl: video.share_url?.startsWith('https://') ? video.share_url : null,
        views: video.view_count ?? null,
        likes: video.like_count ?? null,
        comments: video.comment_count ?? null,
        shares: video.share_count ?? null
      });
    }
    const next = parsed.data.data.cursor;
    if (parsed.data.data.has_more !== true || next === undefined || (cursor !== undefined && next >= cursor)) break;
    cursor = next;
  }
  return videos;
}
