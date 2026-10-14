import type { MediaUsageDto } from '@alexeev/contracts';

export type DeleteVerdict =
  { kind: 'free' } | { kind: 'drafts'; drafts: MediaUsageDto['drafts'] } | { kind: 'blocked'; reasons: string[] };

const shortDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const title = (value: string | null) => `«${value || 'Без названия'}»`;

/** Why a file cannot go: the strongest holder first, in the words the owner sees. */
export function blockReasons(usage: MediaUsageDto): string[] {
  const reasons: string[] = [];
  for (const post of usage.published) {
    reasons.push(`Нужен опубликованному посту ${title(post.title)} от ${shortDate.format(new Date(post.publishedAt))}`);
  }
  for (const post of usage.approved) reasons.push(`Нужен утверждённому посту ${title(post.title)}`);
  if (usage.derivatives > 0) reasons.push(`Из файла сделаны копии (${usage.derivatives}), они ссылаются на оригинал`);
  return reasons;
}

/** Deletable now, or only drafts hold it (they are detached on confirmation), or blocked. */
export function deleteVerdict(usage: MediaUsageDto): DeleteVerdict {
  const reasons = blockReasons(usage);
  if (reasons.length > 0) return { kind: 'blocked', reasons };
  if (usage.drafts.length > 0) return { kind: 'drafts', drafts: usage.drafts };
  if (usage.deletable) return { kind: 'free' };
  // Not deletable with nothing visible in the lists: the server knows a holder we cannot name (e.g. >20 drafts).
  return { kind: 'blocked', reasons: ['Файл держат другие записи'] };
}

export function draftsSentence(drafts: MediaUsageDto['drafts']): string {
  const names = drafts.slice(0, 5).map((post) => title(post.title));
  const rest = drafts.length - names.length;
  const noun = drafts.length === 1 ? 'черновика' : 'черновиков';
  return `${drafts.length} ${noun}: ${names.join(', ')}${rest > 0 ? ` и ещё ${rest}` : ''}`;
}
