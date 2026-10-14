import { ANIMATION_MEDIA_MAX_BYTES, PHOTO_MEDIA_MAX_BYTES, VIDEO_MEDIA_MAX_BYTES } from '@alexeev/contracts';
import { HTTPException } from 'hono/http-exception';
import { AppError } from '../../../shared/app-error';
import type { MediaObjectStorage } from './media-ports';

const MAX_HEADER_SCAN_BYTES = 1024 * 1024;
const MAX_MEDIA_DIMENSION = 10_000;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4']);

export interface StreamedMedia {
  bytes: number;
  sha256: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'video/mp4';
  kind: 'photo' | 'animation' | 'video';
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

function uint32be(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function byte(bytes: Uint8Array, offset: number): number {
  const value = bytes[offset];
  if (value === undefined) throw invalidMedia('Invalid media header');
  return value;
}

function dimensions(
  type: StreamedMedia['contentType'],
  bytes: Uint8Array
): { width: number | null; height: number | null } {
  if (type === 'image/png') {
    if (bytes.length < 24 || ascii(bytes, 12, 4) !== 'IHDR' || uint32be(bytes, 8) !== 13)
      throw invalidMedia('Invalid PNG header');
    return { width: uint32be(bytes, 16), height: uint32be(bytes, 20) };
  }
  if (type === 'image/gif') {
    if (bytes.length < 10) throw invalidMedia('Invalid GIF header');
    return { width: byte(bytes, 6) | (byte(bytes, 7) << 8), height: byte(bytes, 8) | (byte(bytes, 9) << 8) };
  }
  if (type === 'image/jpeg') {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw invalidMedia('Invalid JPEG header');
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = byte(bytes, offset + 1);
      const length = (byte(bytes, offset + 2) << 8) | byte(bytes, offset + 3);
      if (length < 2 || offset + 2 + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return {
          height: (byte(bytes, offset + 5) << 8) | byte(bytes, offset + 6),
          width: (byte(bytes, offset + 7) << 8) | byte(bytes, offset + 8)
        };
      }
      offset += length + 2;
    }
    throw invalidMedia('JPEG dimensions were not found in the bounded header');
  }
  if (type === 'image/webp') {
    if (bytes.length < 30 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP')
      throw invalidMedia('Invalid WebP header');
    const chunk = ascii(bytes, 12, 4);
    if (chunk === 'VP8X') {
      return {
        width: 1 + byte(bytes, 24) + (byte(bytes, 25) << 8) + (byte(bytes, 26) << 16),
        height: 1 + byte(bytes, 27) + (byte(bytes, 28) << 8) + (byte(bytes, 29) << 16)
      };
    }
    if (chunk === 'VP8L' && byte(bytes, 20) === 0x2f) {
      const b1 = byte(bytes, 22);
      const b2 = byte(bytes, 23);
      const b3 = byte(bytes, 24);
      const b4 = byte(bytes, 25);
      return { width: 1 + b1 + ((b2 & 0x3f) << 8), height: 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10) };
    }
    if (chunk === 'VP8 ' && byte(bytes, 23) === 0x9d && byte(bytes, 24) === 0x01 && byte(bytes, 25) === 0x2a) {
      return {
        width: (byte(bytes, 26) | (byte(bytes, 27) << 8)) & 0x3fff,
        height: (byte(bytes, 28) | (byte(bytes, 29) << 8)) & 0x3fff
      };
    }
    throw invalidMedia('Unsupported WebP bitstream');
  }
  return { width: null, height: null };
}

function invalidMedia(message: string): AppError {
  return new AppError('VALIDATION_ERROR', message, { reason: 'INVALID_MEDIA' });
}

function detect(prefix: Uint8Array): StreamedMedia['contentType'] {
  if (
    prefix.length >= 8 &&
    prefix[0] === 0x89 &&
    ascii(prefix, 1, 3) === 'PNG' &&
    prefix[4] === 0x0d &&
    prefix[5] === 0x0a &&
    prefix[6] === 0x1a &&
    prefix[7] === 0x0a
  )
    return 'image/png';
  if (prefix.length >= 3 && prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff) return 'image/jpeg';
  if (prefix.length >= 12 && ascii(prefix, 0, 4) === 'RIFF' && ascii(prefix, 8, 4) === 'WEBP') return 'image/webp';
  if (prefix.length >= 6 && (ascii(prefix, 0, 6) === 'GIF87a' || ascii(prefix, 0, 6) === 'GIF89a')) return 'image/gif';
  if (prefix.length >= 16 && ascii(prefix, 4, 4) === 'ftyp' && uint32be(prefix, 0) >= 16) return 'video/mp4';
  throw invalidMedia('Unsupported or unrecognized media signature');
}

export async function streamAndValidateMedia(
  input: ReadableStream<Uint8Array>,
  declaredType: string,
  storage: MediaObjectStorage,
  objectKey: string,
  contentLength: number
): Promise<StreamedMedia> {
  if (!ACCEPTED_TYPES.has(declaredType)) throw invalidMedia('Unsupported content type');
  const maxBytes =
    declaredType === 'video/mp4'
      ? VIDEO_MEDIA_MAX_BYTES
      : declaredType === 'image/gif'
        ? ANIMATION_MEDIA_MAX_BYTES
        : PHOTO_MEDIA_MAX_BYTES;
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0)
    throw invalidMedia('A valid Content-Length is required');
  if (contentLength > maxBytes) throw new HTTPException(413, { message: 'Media file is too large' });
  const digestStream = new crypto.DigestStream('SHA-256');
  const digestWriter = digestStream.getWriter();
  let bytes = 0;
  let header = new Uint8Array(0);
  const fixed = new FixedLengthStream(contentLength);
  const pipe = input
    .pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        async transform(chunk, controller) {
          bytes += chunk.byteLength;
          if (bytes > maxBytes) throw new HTTPException(413, { message: 'Media file is too large' });
          await digestWriter.write(chunk);
          if (header.length < MAX_HEADER_SCAN_BYTES) {
            const retained = chunk.subarray(0, MAX_HEADER_SCAN_BYTES - header.length);
            const next = new Uint8Array(header.length + retained.length);
            next.set(header);
            next.set(retained, header.length);
            header = next;
          }
          controller.enqueue(chunk);
        },
        async flush() {
          if (bytes !== contentLength) throw invalidMedia('Content-Length does not match the uploaded body');
          await digestWriter.close();
        }
      })
    )
    .pipeTo(fixed.writable);
  const [putResult, pipeResult] = await Promise.allSettled([
    storage.put(objectKey, fixed.readable, declaredType),
    pipe
  ]);
  if (pipeResult.status === 'rejected') {
    if (pipeResult.reason instanceof HTTPException || pipeResult.reason instanceof AppError) throw pipeResult.reason;
  }
  if (putResult.status === 'rejected') throw new AppError('UNAVAILABLE', 'Media storage is unavailable');
  if (pipeResult.status === 'rejected') throw invalidMedia('Content-Length does not match the uploaded body');
  const contentType = detect(header);
  if (contentType !== declaredType) throw invalidMedia('Content type does not match file signature');
  const dimensionsValue = dimensions(contentType, header);
  if (
    bytes === 0 ||
    dimensionsValue.width === 0 ||
    dimensionsValue.height === 0 ||
    (dimensionsValue.width !== null && dimensionsValue.width > MAX_MEDIA_DIMENSION) ||
    (dimensionsValue.height !== null && dimensionsValue.height > MAX_MEDIA_DIMENSION)
  )
    throw invalidMedia('Invalid media dimensions or empty file');
  return {
    bytes,
    sha256: [...new Uint8Array(await digestStream.digest)].map((value) => value.toString(16).padStart(2, '0')).join(''),
    contentType,
    kind: contentType === 'image/gif' ? 'animation' : contentType === 'video/mp4' ? 'video' : 'photo',
    width: dimensionsValue.width,
    height: dimensionsValue.height,
    durationMs: null
  };
}

export function safeMediaFileName(raw: string): string {
  const fileName = Array.from(raw, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    // C0/C1 controls and Unicode format characters (bidi overrides like U+202E) could spoof how the name reads.
    return character === '/' ||
      character === '\\' ||
      codePoint <= 0x1f ||
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      /\p{Cf}/u.test(character)
      ? '_'
      : character;
  })
    .join('')
    .trim();
  if (fileName === '' || fileName.length > 255) throw invalidMedia('Invalid file name');
  return fileName;
}
