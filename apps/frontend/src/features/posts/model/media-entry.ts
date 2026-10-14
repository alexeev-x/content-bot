import {
  ANIMATION_MEDIA_MAX_BYTES,
  PHOTO_MEDIA_MAX_BYTES,
  VIDEO_MEDIA_MAX_BYTES,
  type PostMediaDto
} from '@alexeev/contracts';

/** One tile of the editor's media list: a server-confirmed attachment, or a local file on its way there. */
export type Entry = {
  key: string;
  media?: PostMediaDto;
  file?: File;
  previewUrl?: string;
  status: 'uploaded' | 'local' | 'uploading' | 'failed';
  progress?: number;
  error?: string;
  actionError?: string;
  replaceId?: string;
  idempotencyKey?: string;
  uploadPostId?: string;
};

const fileTypeByExtension: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4'
};

/** The content type the server accepts for this file, or null when the extension or declared type does not match. */
export const fileType = (file: File) => {
  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
  const expected = extension ? fileTypeByExtension[extension] : undefined;
  return expected && (!file.type || file.type === expected) ? expected : null;
};

export const maxBytes = (file: File) =>
  fileType(file) === 'image/gif'
    ? ANIMATION_MEDIA_MAX_BYTES
    : fileType(file) === 'video/mp4'
      ? VIDEO_MEDIA_MAX_BYTES
      : PHOTO_MEDIA_MAX_BYTES;

export const replaceAtLimitNotice = 'Для замены удалите одно вложение: лимит 10 файлов.';
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4'];

export function formatMediaDuration(durationMs: number | null): string | undefined {
  if (durationMs === null) return undefined;
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
