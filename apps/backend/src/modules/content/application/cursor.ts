// The cursor is opaque to clients: base64url of "<sort key>:<id>". It is decoded strictly and
// re-encoded to prove it is canonical, so a malformed cursor is a 400 and never reaches SQL.
const PAYLOAD = /^(\d{1,16}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

// The sort key is `updatedAt` in the live view and `archivedAt` in the archive.
export interface PostCursor {
  at: number;
  id: string;
}

export function encodeCursor(cursor: PostCursor): string {
  return btoa(`${cursor.at}:${cursor.id}`).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
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
  const cursor = { at: Number(match[1]), id: match[2] as string };
  if (!Number.isSafeInteger(cursor.at) || encodeCursor(cursor) !== value) return null;
  return cursor;
}

const REVISION_PAYLOAD = /^r:(\d{1,10})$/;

export function encodeRevisionCursor(revision: number): string {
  return btoa(`r:${revision}`).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function decodeRevisionCursor(value: string): number | null {
  let payload: string;
  try {
    payload = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
  } catch {
    return null;
  }
  const match = REVISION_PAYLOAD.exec(payload);
  if (match === null) return null;
  const revision = Number(match[1]);
  if (!Number.isSafeInteger(revision) || revision < 0 || encodeRevisionCursor(revision) !== value) return null;
  return revision;
}
