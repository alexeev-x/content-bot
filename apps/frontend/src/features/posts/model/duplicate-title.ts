import { POST_TITLE_MAX } from '@alexeev/contracts';

const SUFFIX = ' — копия';

export function duplicateTitle(title: string): string {
  const base = title.trim();
  const room = POST_TITLE_MAX - SUFFIX.length;
  return `${base.slice(0, room)}${SUFFIX}`;
}
