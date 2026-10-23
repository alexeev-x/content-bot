import { enhancePicture } from '../../modules/ai';
import { getOwnerOperationsSettings } from '../../modules/settings';
import type { Container } from '../container';

// Project law (owner, 23.10.2026, docs/DECISIONS.md): every picture a post takes from a source is checked, and a poor one
// goes through the image model with the instruction to change, add and draw nothing, only to make it sharper. The size
// is read from the file's header, never by decoding it (the Free plan's CPU).

/** Below this width a picture shown across a post is blurry (the Liquipedia set icons are 256 wide). */
export const QUALITY_MIN_WIDTH = 800;
/** Each call takes up to 150 s; the media job's queue invocation has 15 minutes for all of its pictures. */
const IMPROVE_BUDGET_MS = 8 * 60_000;

const u32 = (bytes: Uint8Array, at: number) =>
  ((bytes[at] ?? 0) << 24) | ((bytes[at + 1] ?? 0) << 16) | ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0);
const u16 = (bytes: Uint8Array, at: number) => ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0);
const u24le = (bytes: Uint8Array, at: number) =>
  (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8) | ((bytes[at + 2] ?? 0) << 16);

/** Width and height from a PNG, JPEG or WebP header; null for anything else (it is left as it is). */
export function pictureSize(bytes: Uint8Array): { width: number; height: number } | null {
  // PNG: the signature, then IHDR with width and height.
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return { width: u32(bytes, 16) >>> 0, height: u32(bytes, 20) >>> 0 };
  // JPEG: walk the segments to the first start-of-frame.
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) return null;
      const marker = bytes[at + 1] ?? 0;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
        return { height: u16(bytes, at + 5), width: u16(bytes, at + 7) };
      at += 2 + u16(bytes, at + 2);
    }
    return null;
  }
  // WebP: RIFF…WEBP with a VP8X, VP8L or VP8 chunk.
  if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') {
    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    if (chunk === 'VP8X') return { width: u24le(bytes, 24) + 1, height: u24le(bytes, 27) + 1 };
    if (chunk === 'VP8L') {
      const bits = (bytes[21] ?? 0) | ((bytes[22] ?? 0) << 8) | ((bytes[23] ?? 0) << 16) | ((bytes[24] ?? 0) << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8 ') return { width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff };
  }
  return null;
}

function u16le(bytes: Uint8Array, at: number): number {
  return (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8);
}

export type SourcePicture = { bytes: Uint8Array; contentType: string; fileName: string };

/**
 * The improver one media job uses: a picture narrower than QUALITY_MIN_WIDTH comes back sharper as a JPEG; a good one,
 * an animation, one of an unknown format or any failure keeps the original (a post never waits for a lost picture).
 */
export function pictureImproverFor(container: Container, requestId: string, onError: (error: unknown) => void) {
  const started = container.clock.now();
  return async (file: SourcePicture): Promise<SourcePicture> => {
    if (file.contentType === 'image/gif') return file;
    const size = pictureSize(file.bytes);
    if (size === null || size.width >= QUALITY_MIN_WIDTH) return file;
    if (container.clock.now() - started > IMPROVE_BUDGET_MS) return file;
    try {
      const { timezone } = await getOwnerOperationsSettings({
        repo: container.settings,
        logger: container.logger,
        requestId
      });
      const result = await enhancePicture(
        {
          repo: container.aiRepository,
          clock: container.clock,
          timezone,
          newId: container.newId,
          provider: container.aiProvider,
          images: container.aiImageProvider,
          onError
        },
        file.bytes
      );
      container.logger.info({
        component: 'source_media',
        operation: 'picture_improve',
        requestId,
        status: result.kind === 'enhanced' ? 'enhanced' : result.reason
      });
      if (result.kind !== 'enhanced') return file;
      return { bytes: result.bytes, contentType: 'image/jpeg', fileName: file.fileName.replace(/\.\w+$/u, '.jpg') };
    } catch (error) {
      onError(error);
      return file;
    }
  };
}
