import { describe, expect, it } from 'vitest';
import { pictureSize } from './picture-quality';

const png = (width: number, height: number) => {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
};

// SOI, an APP0 segment of 16 bytes, then SOF0 with height 170 and width 256.
const jpeg = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
  0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0xaa, 0x01, 0x00, 0x03
]);

const webpVp8x = (width: number, height: number) => {
  const bytes = new Uint8Array(30);
  bytes.set(
    [...'RIFF'].map((c) => c.charCodeAt(0)),
    0
  );
  bytes.set(
    [...'WEBPVP8X'].map((c) => c.charCodeAt(0)),
    8
  );
  const w = width - 1;
  const h = height - 1;
  bytes.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 24);
  return bytes;
};

describe('pictureSize', () => {
  it('reads PNG, JPEG and WebP headers without decoding', () => {
    expect(pictureSize(png(256, 170))).toEqual({ width: 256, height: 170 });
    expect(pictureSize(png(1536, 768))).toEqual({ width: 1536, height: 768 });
    expect(pictureSize(jpeg)).toEqual({ width: 256, height: 170 });
    expect(pictureSize(webpVp8x(1920, 1080))).toEqual({ width: 1920, height: 1080 });
  });

  it('gives null for an unknown format, so the picture is left as it is', () => {
    expect(pictureSize(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBeNull();
    expect(pictureSize(new Uint8Array([]))).toBeNull();
  });
});
