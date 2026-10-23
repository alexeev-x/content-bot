import { PHOTO_MEDIA_MAX_BYTES, POST_MEDIA_MAX_ITEMS } from '@alexeev/contracts';
import { HTTPException } from 'hono/http-exception';
import {
  type DotaDraftSource,
  fetchSteamAnnouncement,
  type DotaWatcherRepository,
  LIQUIPEDIA_IMAGES,
  LIQUIPEDIA_SPACING_MS,
  LIQUIPEDIA_USER_AGENT
} from '../../modules/dota';
import { AppError } from '../../shared/app-error';

// A Dota event announcement's post always carries its images (owner, 21.10.2026), and a series post the event page's
// images its plan chose, never videos (owner, 22.10.2026: photos only, after two event videos made a 97 MB album that
// Telegram could not take in time). They are attached through the same use case
// as an upload, so size, signature and dimension checks are the upload's. Only Steam's CDN (steamstatic.com) is
// fetched: the URLs come from Steam's announcement or Valve's event page, never from a request.

const STEAM_CDN = '.steamstatic.com';
// The same announcement image on Steam's other CDNs: tried in turn when one refuses (DEV, 21.10.2026: no image
// arrived while a local run got it). A redirect is followed only within steamstatic.com.
const MIRRORS = ['clan.akamai.steamstatic.com', 'clan.fastly.steamstatic.com', 'clan.steamstatic.com'];
// Some CDN edges refuse a request without a client name.
const REQUEST_HEADERS = { 'user-agent': 'Mozilla/5.0 (compatible; alexeev-studio/1.0)' };
// A treasure's set icons come from Liquipedia's commons (owner, 23.10.2026), with the User-Agent its terms ask for.
const LIQUIPEDIA_HEADERS = { 'user-agent': LIQUIPEDIA_USER_AGENT, 'accept-encoding': 'gzip' };
const allowedPicture = (url: URL) =>
  url.protocol === 'https:' && (url.hostname.endsWith(STEAM_CDN) || url.href.startsWith(LIQUIPEDIA_IMAGES));
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
  /**
   * An image the CDN refuses to the Worker, fetched by Telegram instead (DEV 21.10.2026: every Valve host answered
   * 403 to Cloudflare for the event page's images, while videos and browsers got them). JPEG bytes, or null.
   */
  viaTelegram?: (url: string) => Promise<Uint8Array | null>;
  fetchAnnouncement?: typeof fetchSteamAnnouncement;
  fetchImpl?: typeof fetch;
  /** Why a file was left out (a stable code with the HTTP status), for the log. */
  onSkip?: (reason: string) => void;
  /** A poor picture made sharper before it is attached (app/workflows/picture-quality.ts, the project law). */
  improve?: (file: File) => Promise<File>;
  /**
   * A patch's own picture instead of the announcement's images (owner, 22.10.2026): null for an event that is no
   * patch, `failed` when it could not be drawn (the post goes without a picture).
   */
  patchPicture?: (source: DotaDraftSource) => Promise<{ bytes: Uint8Array; contentType: string } | 'failed' | null>;
}

type File = { bytes: Uint8Array; contentType: string; fileName: string };

/**
 * How many of the files are on the post now (attached by this run or an earlier one); `pictureFailed`: a patch whose
 * picture could not be drawn, so nothing was attached on purpose.
 */
export async function attachSourceEventImages(
  deps: SourceMediaDeps,
  /** `urls`: a series post's own media (Valve's CDN); without them, the announcement's images. */
  input: {
    postId: string;
    externalId: string;
    urls?: readonly string[] | undefined;
    max?: number;
    /**
     * A part of the files only, `count` of them from position `from` (QA 23.10.2026: one picture costs about 13 D1
     * statements and its improvement more, so a queue invocation within the Free plan's 50 takes a few at a time).
     */
    from?: number;
    count?: number;
  }
): Promise<{ attached: number; found: number; remaining: number; pictureFailed?: true }> {
  let files: readonly string[];
  if (input.urls !== undefined) {
    files = input.urls;
  } else {
    const source = await deps.repo.findSteamAnnouncement(input.externalId);
    if (source === null) throw new AppError('NOT_FOUND', 'The announcement is gone');
    const picture = deps.patchPicture === undefined ? null : await deps.patchPicture(source);
    if (picture === 'failed') return { attached: 0, found: 0, remaining: 0, pictureFailed: true };
    if (picture !== null) {
      const file = { ...picture, fileName: `patch-${input.externalId}.jpg` };
      const attached = await attach(deps, input.postId, file, `patch-picture:${input.externalId}`);
      if (attached) return { attached: 1, found: 1, remaining: 0 };
      // Refused by the upload: the post goes without a picture, as when it could not be drawn.
      (deps.onSkip ?? (() => {}))('ATTACH_REFUSED');
      return { attached: 0, found: 0, remaining: 0, pictureFailed: true };
    }
    const announcement = await (deps.fetchAnnouncement ?? fetchSteamAnnouncement)({
      externalId: input.externalId,
      publishedAt: source.publishedAt
    });
    files = announcement?.images ?? [];
  }
  files = files.slice(0, Math.min(input.max ?? POST_MEDIA_MAX_ITEMS, POST_MEDIA_MAX_ITEMS));
  const from = input.from ?? 0;
  const until = input.count === undefined ? files.length : Math.min(files.length, from + input.count);
  const onSkip = deps.onSkip ?? (() => {});
  let attached = 0;
  for (const [index, url] of files.entries()) {
    if (index < from || index >= until) continue;
    // Liquipedia asks for no more than one request per 2 s (its set icons, owner 23.10.2026).
    if (index > from && url.startsWith(LIQUIPEDIA_IMAGES)) await pause(LIQUIPEDIA_SPACING_MS);
    const target = new URL(url);
    if (!allowedPicture(target)) continue;
    // A series planned before 22.10.2026 may still list a video.
    if (!IMAGE.test(target.pathname)) {
      onSkip('NOT_AN_IMAGE');
      continue;
    }
    let file = await download(deps.fetchImpl ?? fetch, target, onSkip);
    if (file === null && deps.viaTelegram !== undefined) {
      const bytes = await deps.viaTelegram(target.href).catch(() => null);
      if (bytes === null) onSkip('TELEGRAM_FETCH_FAILED');
      else file = { bytes, contentType: 'image/jpeg', fileName: `steam-${baseName(target.pathname)}.jpg` };
    }
    if (file === null) continue;
    if (deps.improve !== undefined) file = await deps.improve(file);
    if (await attach(deps, input.postId, file, `source-image:${input.externalId}:${index}`)) attached += 1;
    else onSkip('ATTACH_REFUSED');
  }
  return { attached, found: files.length, remaining: files.length - until };
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const IMAGE = /\.(?:png|jpe?g|webp|gif)$/i;
const baseName = (path: string) => (path.split('/').pop() ?? 'image').replace(/\.\w+$/, '');

async function download(fetchImpl: typeof fetch, url: URL, onSkip: (reason: string) => void): Promise<File | null> {
  const path = url.pathname;
  // An announcement image's own host first, then its mirrors.
  const hosts = MIRRORS.includes(url.hostname)
    ? [url.hostname, ...MIRRORS.filter((host) => host !== url.hostname)]
    : [url.hostname];
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
  const length = Number(response.headers.get('content-length') ?? '0');
  if (length > PHOTO_MEDIA_MAX_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    onSkip('TOO_LARGE');
    return null;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > PHOTO_MEDIA_MAX_BYTES) return null;
  const name = path.split('/').pop() ?? 'image.png';
  const extension = name.split('.').pop()?.toLowerCase();
  const contentType =
    extension === 'png'
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
      headers: next.startsWith(LIQUIPEDIA_IMAGES) ? LIQUIPEDIA_HEADERS : REQUEST_HEADERS,
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
async function attach(deps: SourceMediaDeps, postId: string, file: File, idempotencyKey: string): Promise<boolean> {
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
