import type { ZodType } from 'zod';

// An opaque keyset cursor: base64url of the JSON-encoded sort key. A cursor is decoded strictly
// (UTF-8, JSON, the caller's schema) and re-encoded to prove it is canonical, so anything a
// client invents is rejected before it can reach SQL.
export function encodeKeysetCursor(key: readonly unknown[]): string {
  const bytes = new TextEncoder().encode(JSON.stringify(key));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function decodeKeysetCursor<T extends readonly unknown[]>(value: string, schema: ZodType<T>): T | null {
  let parsed: unknown;
  try {
    const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes));
  } catch {
    return null;
  }
  const result = schema.safeParse(parsed);
  if (!result.success || encodeKeysetCursor(result.data) !== value) return null;
  return result.data;
}
