import type { WriterFormat, WriterMode } from './writer-types';

// Code checks on a draft before the owner sees it (docs/ai/architecture.md item 9): cheap, deterministic, run
// on every draft. A finding is a stable code; a clean draft is never rewritten «just in case».
const AI_PHRASES: readonly [RegExp, string][] = [
  [/стоит отметить/i, 'стоит отметить'],
  [/важно подчеркнуть/i, 'важно подчеркнуть'],
  [/давайте разберёмся|давайте разберемся/i, 'давайте разберёмся'],
  [/таким образом/i, 'таким образом'],
  [/в целом можно сказать/i, 'в целом можно сказать'],
  [/играет ключев\w+ роль/i, 'играет ключевую роль'],
  [/не просто [^.!?]{1,40}, а /i, 'не просто X, а Y'],
  [/не только [^.!?]{1,60}, но и /i, 'не только…, но и'],
  [/максимально функциональн/i, 'максимально функциональный'],
  [/универсальност\w* и гибкост/i, 'универсальность и гибкость'],
  [/подводя итог/i, 'подводя итог']
];
// JS `\b` does not see Cyrillic letters, so the boundary is spelled out.
const SELF_EXPERIENCE = /(^|[^а-яёa-z])(я (играл|попробовал|поиграл|сыграл|затестил)|мне (понравил|зашл))/i;
const SELF_DOUBT = /мой тупой мозг|я тупой|я не умею|путаюсь в кнопках|я на такое не способен/i;
const EMOJI_BULLET = /^\s*[\u{1F300}-\u{1FAFF}☀-➿]/mu;
const CAPS_LINE = /^[^a-zа-яё\n]*[A-ZА-ЯЁ]{4,}[^a-zа-яё\n]*$/mu;
const WORDS: Record<WriterFormat, [number, number]> = {
  fidit: [80, 230],
  igrat: [90, 230],
  standalone: [60, 230],
  telegram: [1, 320]
};

export function checkDraft(format: WriterFormat, mode: WriterMode, text: string, task = ''): string[] {
  const codes: string[] = [];
  for (const [pattern, name] of AI_PHRASES) if (pattern.test(text)) codes.push(`AI_PHRASE:${name}`);
  if ((text.match(/—/g) ?? []).length > 4) codes.push('EM_DASH_MANY');
  if (EMOJI_BULLET.test(text)) codes.push('EMOJI_BULLETS');
  if (CAPS_LINE.test(text)) codes.push('CAPS_LINE');
  const subscribe = /подпишись/i.test(text);
  if (format === 'fidit' && subscribe) codes.push('ENDING_FIDIT_CTA');
  // Owner, 19.10.2026: the author says the rubric opener and «подпишись» himself; the text goes without them.
  if (format === 'igrat' && (subscribe || IGRAT_OPENER.test(text))) codes.push('IGRAT_FIXED_LINES');
  if (mode === 'automatic' && SELF_EXPERIENCE.test(text)) codes.push('INVENTED_EXPERIENCE');
  // «Учу фидить» is told with full confidence: the pseudo-expert never puts himself down (owner, 16.10.2026).
  if (format === 'fidit' && SELF_DOUBT.test(text)) codes.push('FIDIT_SELF_DOUBT');
  // Owner, 16.10.2026: the address came in nearly every post; by default a post goes without one.
  if (/(?<![а-яё])(мужчин|мужик|парни|пацаны)/iu.test(text)) codes.push('ADDRESS_USED');
  const words = text.split(/\s+/).filter(Boolean).length;
  const [min, max] = WORDS[format];
  if (words < min) codes.push('TOO_SHORT');
  if (words > max) codes.push('TOO_LONG');
  // A slip like «что что» or «на на»: cheap to catch, easy to miss when reading a script aloud.
  if (DOUBLED_WORD.test(text)) codes.push('DOUBLED_WORD');
  // A patch change stated as fact that the task never mentioned: to check before it goes out (owner review).
  if (PATCH_CLAIM.test(text) && !PATCH_SOURCE.test(task)) codes.push('PATCH_UNVERIFIED');
  // Stage 1: a joke explained after the punchline kills it.
  if (JOKE_EXPLAINED.test(text)) codes.push('JOKE_EXPLAINED');
  // Stage 1: an invitation in the channel says when or where (a time, a day, a link or an @channel).
  if (format === 'telegram' && INVITATION.test(text) && !INVITATION_DETAIL.test(text)) codes.push('INVITE_NO_DETAILS');
  return codes;
}

const DOUBLED_WORD = /(?<![а-яёa-z])([а-яёa-z]{2,})\s+\1(?![а-яёa-z])/iu;
const IGRAT_OPENER = /учусь играть в доту/i;
const PATCH_CLAIM = /(в (новом|последнем|этом|свежем) патче|понерф|нерфнул|бафнул|бафф?ну)/i;
const PATCH_SOURCE = /патч|нерф|баф|обнов/i;
const JOKE_EXPLAINED =
  /(шутка (в том|была в том)|это (была )?шутка|если (вы |ты )?не понял|понял(и)? шутку|поясню шутку)/i;
const INVITATION = /(?<![а-яё])(стрим|эфир|турнир|розыгрыш|заходи|приходи|залетай|подключайтесь|жду вас)/iu;
const INVITATION_DETAIL =
  /\d{1,2}[:.]\d{2}|(?<![а-яё])(сегодня|завтра|вечером|в (понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье))|https?:\/\/|t\.me\/|@[a-z0-9_]{4,}/iu;

/** What a finding means, in the owner's words (shown under the draft). */
export function describeCheck(code: string): string {
  if (code.startsWith('AI_PHRASE:')) return `оборот «${code.slice(10)}» звучит как ИИ`;
  const map: Record<string, string> = {
    EM_DASH_MANY: 'слишком много длинных тире',
    EMOJI_BULLETS: 'эмодзи вместо пунктов',
    CAPS_LINE: 'строка капсом',
    ENDING_FIDIT_CTA: '«подпишись» в «Учу фидить» — так нельзя',
    IGRAT_FIXED_LINES: '«Учусь играть в Доту» и «подпишись» автор говорит сам — уберите из текста',
    // Older drafts keep the code of the earlier rule (before 19.10.2026).
    ENDING_IGRAT_CTA_MISSING: 'нет концовки «А ты подпишись уже, заебал»',
    INVENTED_EXPERIENCE: 'выдуманный личный опыт («я играл», «мне понравилось»)',
    FIDIT_SELF_DOUBT: 'в «Учу фидить» автор принижает себя — там только уверенный тон',
    ADDRESS_USED: 'обращение «мужики/мужчины/парни» (по умолчанию без него)',
    // Older drafts keep the code of the earlier rule.
    ADDRESS_REPEATED: '«мужчины» больше одного раза',
    NEEDS_FACTS: 'нужен ваш опыт',
    TOO_SHORT: 'короче формата',
    TOO_LONG: 'длиннее формата',
    TOPIC_REPEATED: 'тема повторяет недавний черновик',
    DOUBLED_WORD: 'слово повторено подряд',
    PATCH_UNVERIFIED: 'изменение патча не из задания — проверьте',
    JOKE_EXPLAINED: 'шутку объясняют после панчлайна',
    INVITE_NO_DETAILS: 'приглашение без времени или ссылки'
  };
  return map[code] ?? code;
}

/** Share of the draft's words that differ from the final, 0–1 (word-level LCS). */
export function editRatio(draft: string, final: string): number {
  const a = draft.split(/\s+/).filter(Boolean).slice(0, 600);
  const b = final.split(/\s+/).filter(Boolean).slice(0, 600);
  if (a.length === 0 && b.length === 0) return 0;
  const row = Array.from({ length: b.length + 1 }, () => 0);
  for (const word of a) {
    let previous = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const kept = row[j] ?? 0;
      row[j] = word === b[j - 1] ? previous + 1 : Math.max(kept, row[j - 1] ?? 0);
      previous = kept;
    }
  }
  const common = row[b.length] ?? 0;
  return Math.round((1 - common / Math.max(a.length, b.length)) * 1000) / 1000;
}

/** The parts of a draft the owner can change before approval (architecture item 4), in a stable order. */
export const CHANGED_PARTS = ['hook', 'ending', 'length', 'structure', 'swearing', 'ai_wording'] as const;
export type ChangedPart = (typeof CHANGED_PARTS)[number];

// A sentence counts as rewritten past a third of its words; a length change past a fifth.
const REWRITTEN = 0.3;
const LENGTH_CHANGE = 0.2;
const SWEARING = /(?<![а-яё])(ху[йеёияю]|пизд|бля|[её]б[аиул]|сук[аи])/giu;

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function paragraphs(text: string): number {
  return text.split(/\n\s*\n/).filter((part) => part.trim() !== '').length;
}

function aiPhrases(text: string): number {
  return AI_PHRASES.filter(([pattern]) => pattern.test(text)).length;
}

/**
 * Which parts the owner changed between the AI draft and the approved text, by code only (the cheap model
 * tags «joke» and «structure of meaning» later): evidence of what the owner fixes, never a rule by itself.
 */
export function changedParts(draft: string, final: string): ChangedPart[] {
  const a = sentences(draft);
  const b = sentences(final);
  const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
  const parts = new Set<ChangedPart>();
  if (a.length > 0 && b.length > 0) {
    if (editRatio(a[0]!, b[0]!) > REWRITTEN) parts.add('hook');
    if (editRatio(a.at(-1)!, b.at(-1)!) > REWRITTEN) parts.add('ending');
  }
  const before = words(draft);
  if (before > 0 && Math.abs(words(final) - before) / before > LENGTH_CHANGE) parts.add('length');
  if (paragraphs(draft) !== paragraphs(final)) parts.add('structure');
  if ((draft.match(SWEARING) ?? []).length !== (final.match(SWEARING) ?? []).length) parts.add('swearing');
  if (aiPhrases(final) < aiPhrases(draft)) parts.add('ai_wording');
  return CHANGED_PARTS.filter((part) => parts.has(part));
}
