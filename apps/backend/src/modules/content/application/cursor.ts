// The cursor is opaque to clients: base64url of "<updatedAt>:<id>". It is decoded strictly and
// re-encoded to prove it is canonical, so a malformed cursor is a 400 and never reaches SQL.
const PAYLOAD = /^(\d{1,16}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export interface PostCursor {
  updatedAt: number;
  id: string;
}

export function encodeCursor(cursor: PostCursor): string {
  return btoa(`${cursor.updatedAt}:${cursor.id}`).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function decodeCursor(value: string): PostCursor | null {
  let payload: string;
  try {
    payload = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
  } catch {
    return null;
  }
  const match = PAYLOAD.exec(payload);
  if (match === null) return null;
  const cursor = { updatedAt: Number(match[1]), id: match[2] as string };
  if (!Number.isSafeInteger(cursor.updatedAt) || encodeCursor(cursor) !== value) return null;
  return cursor;
}
