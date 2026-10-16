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
  fidit: [80, 200],
  igrat: [90, 220],
  standalone: [60, 200],
  telegram: [1, 320]
};

export function checkDraft(format: WriterFormat, mode: WriterMode, text: string): string[] {
  const codes: string[] = [];
  for (const [pattern, name] of AI_PHRASES) if (pattern.test(text)) codes.push(`AI_PHRASE:${name}`);
  if ((text.match(/—/g) ?? []).length > 4) codes.push('EM_DASH_MANY');
  if (EMOJI_BULLET.test(text)) codes.push('EMOJI_BULLETS');
  if (CAPS_LINE.test(text)) codes.push('CAPS_LINE');
  const subscribe = /подпишись/i.test(text);
  if (format === 'fidit' && subscribe) codes.push('ENDING_FIDIT_CTA');
  if (format === 'igrat' && !subscribe) codes.push('ENDING_IGRAT_CTA_MISSING');
  if (mode === 'automatic' && SELF_EXPERIENCE.test(text)) codes.push('INVENTED_EXPERIENCE');
  // «Учу фидить» is told with full confidence: the pseudo-expert never puts himself down (owner, 16.10.2026).
  if (format === 'fidit' && SELF_DOUBT.test(text)) codes.push('FIDIT_SELF_DOUBT');
  if ((text.match(/мужчин/gi) ?? []).length > 1) codes.push('ADDRESS_REPEATED');
  const words = text.split(/\s+/).filter(Boolean).length;
  const [min, max] = WORDS[format];
  if (words < min) codes.push('TOO_SHORT');
  if (words > max) codes.push('TOO_LONG');
  return codes;
}

/** What a finding means, in the owner's words (shown under the draft). */
export function describeCheck(code: string): string {
  if (code.startsWith('AI_PHRASE:')) return `оборот «${code.slice(10)}» звучит как ИИ`;
  const map: Record<string, string> = {
    EM_DASH_MANY: 'слишком много длинных тире',
    EMOJI_BULLETS: 'эмодзи вместо пунктов',
    CAPS_LINE: 'строка капсом',
    ENDING_FIDIT_CTA: '«подпишись» в «Учу фидить» — так нельзя',
    ENDING_IGRAT_CTA_MISSING: 'нет концовки «А ты подпишись уже, заебал»',
    INVENTED_EXPERIENCE: 'выдуманный личный опыт («я играл», «мне понравилось»)',
    FIDIT_SELF_DOUBT: 'в «Учу фидить» автор принижает себя — там только уверенный тон',
    ADDRESS_REPEATED: '«мужчины» больше одного раза',
    NEEDS_FACTS: 'нужен ваш опыт',
    TOO_SHORT: 'короче формата',
    TOO_LONG: 'длиннее формата'
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
