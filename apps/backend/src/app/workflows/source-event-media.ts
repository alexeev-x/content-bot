import { PHOTO_MEDIA_MAX_BYTES, POST_MEDIA_MAX_ITEMS, VIDEO_MEDIA_MAX_BYTES } from '@alexeev/contracts';
import { HTTPException } from 'hono/http-exception';
import { fetchSteamAnnouncement, type DotaWatcherRepository } from '../../modules/dota';
import { AppError } from '../../shared/app-error';

// A Dota event announcement's post always carries its images (owner, 21.10.2026), and a series post the event page's
// media its plan chose (images, and mp4 videos within the post's limit). They are attached through the same use case
// as an upload, so size, signature and dimension checks are the upload's. Only Steam's CDN (steamstatic.com) is
// fetched: the URLs come from Steam's announcement or Valve's event page, never from a request.

const STEAM_CDN = '.steamstatic.com';
// The same announcement image on Steam's other CDNs: tried in turn when one refuses (DEV, 21.10.2026: no image
// arrived while a local run got it). A redirect is followed only within steamstatic.com.
// The event page's media likewise (DEV, 21.10.2026: cdn.steamstatic.com answered 403 to the Worker for an image).
const MIRROR_GROUPS = [
  ['clan.akamai.steamstatic.com', 'clan.fastly.steamstatic.com', 'clan.steamstatic.com'],
  ['cdn.cloudflare.steamstatic.com', 'cdn.fastly.steamstatic.com', 'cdn.akamai.steamstatic.com', 'cdn.steamstatic.com']
];
// Some CDN edges refuse a request without a client name.
const REQUEST_HEADERS = {
  'user-agent': 'Mozilla/5.0 (compatible; alexeev-studio/1.0)',
  accept: 'image/*,video/*;q=0.9,*/*;q=0.5'
};
const MAX_REDIRECTS = 2;
const DOWNLOAD_TIMEOUT_MS = 60_000;
// A stale revision means the owner edited the draft meanwhile; the next try reads the new one.
const ATTACH_ATTEMPTS = 4;

export interface SourceMediaDeps {
  repo: Pick<DotaWatcherRepository, 'findSteamAnnouncement'>;
  postState: (postId: string) => Promise<{ revision: number; mediaCount: number } | null>;
  upload: (command: {
    postId: string;
    revision: number;
    fileName: string;
    contentType: string;
    contentLength: number;
    body: ReadableStream<Uint8Array>;
    idempotencyKey: string;
  }) => Promise<unknown>;
  fetchAnnouncement?: typeof fetchSteamAnnouncement;
  fetchImpl?: typeof fetch;
  /** Why a file was left out (a stable code with the HTTP status), for the log. */
  onSkip?: (reason: string) => void;
}

/** How many of the files are on the post now (attached by this run or an earlier one). */
export async function attachSourceEventImages(
  deps: SourceMediaDeps,
  /** `urls`: a series post's own media (Valve's CDN); without them, the announcement's images. */
  input: { postId: string; externalId: string; urls?: readonly string[] | undefined }
): Promise<{ attached: number; found: number }> {
  let files: readonly string[];
  if (input.urls !== undefined) {
    files = input.urls;
  } else {
    const source = await deps.repo.findSteamAnnouncement(input.externalId);
    if (source === null) throw new AppError('NOT_FOUND', 'The announcement is gone');
    const announcement = await (deps.fetchAnnouncement ?? fetchSteamAnnouncement)({
      externalId: input.externalId,
      publishedAt: source.publishedAt
    });
    files = announcement?.images ?? [];
  }
  files = files.slice(0, POST_MEDIA_MAX_ITEMS);
  const onSkip = deps.onSkip ?? (() => {});
  let attached = 0;
  for (const [index, url] of files.entries()) {
    const target = new URL(url);
    if (target.protocol !== 'https:' || !target.hostname.endsWith(STEAM_CDN)) continue;
    const file = await download(deps.fetchImpl ?? fetch, target, onSkip);
    if (file === null) continue;
    if (await attach(deps, input.postId, file, `source-image:${input.externalId}:${index}`)) attached += 1;
    else onSkip('ATTACH_REFUSED');
  }
  return { attached, found: files.length };
}

async function download(
  fetchImpl: typeof fetch,
  url: URL,
  onSkip: (reason: string) => void
): Promise<{ bytes: Uint8Array; contentType: string; fileName: string } | null> {
  const path = url.pathname;
  const group = MIRROR_GROUPS.find((hosts) => hosts.includes(url.hostname));
  // The address's own host first, then its mirrors.
  const hosts = group ? [url.hostname, ...group.filter((host) => host !== url.hostname)] : [url.hostname];
  let response: Response | null = null;
  for (const host of hosts) {
    response = await fetchFrom(fetchImpl, `https://${host}${path}`).catch((error: unknown) => {
      onSkip(`DOWNLOAD_FAILED:${host}:${error instanceof Error ? error.name : 'unknown'}`);
      return null;
    });
    if (response?.ok) break;
    if (response !== null) onSkip(`DOWNLOAD_HTTP_${response.status}:${host}`);
    await response?.body?.cancel().catch(() => undefined);
    response = null;
  }
  if (response === null) return null;
  const video = /\.mp4$/i.test(path);
  const limit = video ? VIDEO_MEDIA_MAX_BYTES : PHOTO_MEDIA_MAX_BYTES;
  const length = Number(response.headers.get('content-length') ?? '0');
  if (length > limit) {
    await response.body?.cancel().catch(() => undefined);
    onSkip(video ? 'VIDEO_TOO_LARGE' : 'TOO_LARGE');
    return null;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > limit) return null;
  const name = path.split('/').pop() ?? 'image.png';
  const extension = name.split('.').pop()?.toLowerCase();
  const contentType = video
    ? 'video/mp4'
    : extension === 'png'
      ? 'image/png'
      : extension === 'webp'
        ? 'image/webp'
        : extension === 'gif'
          ? 'image/gif'
          : 'image/jpeg';
  return { bytes, contentType, fileName: `steam-${name}`.slice(0, 255) };
}

// Follows a redirect only to another steamstatic.com address, at most twice.
async function fetchFrom(fetchImpl: typeof fetch, url: string): Promise<Response> {
  let next = url;
  for (let hop = 0; ; hop += 1) {
    const response = await fetchImpl(next, {
      headers: REQUEST_HEADERS,
      redirect: 'manual',
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)
    });
    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || location === null || hop >= MAX_REDIRECTS) return response;
    const target = new URL(location, next);
    if (target.protocol !== 'https:' || !target.hostname.endsWith(STEAM_CDN)) return response;
    await response.body?.cancel().catch(() => undefined);
    next = target.href;
  }
}

// The idempotency key per file makes a repeated job attach nothing twice.
async function attach(
  deps: SourceMediaDeps,
  postId: string,
  file: { bytes: Uint8Array; contentType: string; fileName: string },
  idempotencyKey: string
): Promise<boolean> {
  for (let attempt = 0; attempt < ATTACH_ATTEMPTS; attempt += 1) {
    const state = await deps.postState(postId);
    if (state === null || state.mediaCount >= POST_MEDIA_MAX_ITEMS) return false;
    try {
      await deps.upload({
        postId,
        revision: state.revision,
        fileName: file.fileName,
        contentType: file.contentType,
        contentLength: file.bytes.byteLength,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(file.bytes);
            controller.close();
          }
        }),
        idempotencyKey
      });
      return true;
    } catch (error) {
      if (error instanceof HTTPException && error.status < 500) return false;
      if (!(error instanceof AppError)) throw error;
      if (error.code === 'CONFLICT' && error.details?.reason === 'STALE_REVISION') continue;
      if (error.code === 'VALIDATION_ERROR' || error.code === 'NOT_FOUND' || error.code === 'CONFLICT') return false;
      throw error;
    }
  }
  return false;
}
