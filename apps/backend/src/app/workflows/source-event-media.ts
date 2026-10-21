import { PHOTO_MEDIA_MAX_BYTES, POST_MEDIA_MAX_ITEMS } from '@alexeev/contracts';
import { HTTPException } from 'hono/http-exception';
import { fetchSteamAnnouncement, type DotaWatcherRepository } from '../../modules/dota';
import { AppError } from '../../shared/app-error';

// A Dota event announcement's post always carries its images (owner, 21.10.2026). They are attached to the
// approved draft through the same use case as an upload, so size, signature and dimension checks are the upload's.
// Only Steam's image CDN is fetched (the URLs come from `fetchSteamAnnouncement`, never from input).

const IMAGE_HOST = 'clan.akamai.steamstatic.com';
// The same image on Steam's other CDNs: tried in turn when one refuses (DEV, 21.10.2026: no image arrived while a
// local run got it). A redirect is followed only within steamstatic.com.
const MIRRORS = ['clan.akamai.steamstatic.com', 'clan.fastly.steamstatic.com', 'clan.steamstatic.com'];
const MAX_REDIRECTS = 2;
const DOWNLOAD_TIMEOUT_MS = 15_000;
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
  /** Why an image was left out (a stable code with the HTTP status), for the log. */
  onSkip?: (reason: string) => void;
}

/** How many of the announcement's images are on the post now (attached by this run or an earlier one). */
export async function attachSourceEventImages(
  deps: SourceMediaDeps,
  input: { postId: string; externalId: string }
): Promise<{ attached: number; found: number }> {
  const source = await deps.repo.findSteamAnnouncement(input.externalId);
  if (source === null) throw new AppError('NOT_FOUND', 'The announcement is gone');
  const announcement = await (deps.fetchAnnouncement ?? fetchSteamAnnouncement)({
    externalId: input.externalId,
    publishedAt: source.publishedAt
  });
  const images = (announcement?.images ?? []).slice(0, POST_MEDIA_MAX_ITEMS);
  let attached = 0;
  for (const [index, url] of images.entries()) {
    if (new URL(url).hostname !== IMAGE_HOST) continue;
    const image = await download(deps.fetchImpl ?? fetch, url, deps.onSkip ?? (() => {}));
    if (image === null) continue;
    if (await attach(deps, input.postId, image, `source-image:${input.externalId}:${index}`)) attached += 1;
    else deps.onSkip?.('ATTACH_REFUSED');
  }
  return { attached, found: images.length };
}

async function download(
  fetchImpl: typeof fetch,
  url: string,
  onSkip: (reason: string) => void
): Promise<{ bytes: Uint8Array; contentType: string; fileName: string } | null> {
  const path = new URL(url).pathname;
  let response: Response | null = null;
  for (const host of MIRRORS) {
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
    const response = await fetchImpl(next, { redirect: 'manual', signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || location === null || hop >= MAX_REDIRECTS) return response;
    const target = new URL(location, next);
    if (target.protocol !== 'https:' || !target.hostname.endsWith('.steamstatic.com')) return response;
    await response.body?.cancel().catch(() => undefined);
    next = target.href;
  }
}

// The idempotency key per announcement image makes a repeated job attach nothing twice.
async function attach(
  deps: SourceMediaDeps,
  postId: string,
  image: { bytes: Uint8Array; contentType: string; fileName: string },
  idempotencyKey: string
): Promise<boolean> {
  for (let attempt = 0; attempt < ATTACH_ATTEMPTS; attempt += 1) {
    const state = await deps.postState(postId);
    if (state === null || state.mediaCount >= POST_MEDIA_MAX_ITEMS) return false;
    try {
      await deps.upload({
        postId,
        revision: state.revision,
        fileName: image.fileName,
        contentType: image.contentType,
        contentLength: image.bytes.byteLength,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(image.bytes);
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
