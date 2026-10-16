import { AI_LEXICON, AI_PACK, AI_REEL_EXAMPLES, AI_TELEGRAM_EXAMPLES } from './pack.generated';
import type { WriterFormat, WriterMode } from './writer-types';

// Builds one request from the bundled pack (docs/ai/README.md): the stable part first (core, format card,
// answer rules, lessons, state) so the provider can cache it, then the matched lexicon lines, 3–4 examples
// with the most relevant last, then the task.
const MAX_LEXICON = 15;
const MAX_EXAMPLE_CHARS = 1400;
const REEL_FORMAT: Record<Exclude<WriterFormat, 'telegram'>, 'fidit' | 'igrat' | 'solo'> = {
  fidit: 'fidit',
  igrat: 'igrat',
  standalone: 'solo'
};
const FORMAT_NAME: Record<WriterFormat, string> = {
  fidit: 'рилс «Учу фидить в Доту»',
  igrat: 'рилс «Учусь играть в Доту»',
  standalone: 'рилс вне рубрик',
  telegram: 'пост в Telegram-канал'
};

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replaceAll('ё', 'е')
      .split(/[^a-zа-я0-9]+/)
      .filter((word) => word.length >= 4)
      .map((word) => word.slice(0, 6))
  );
}

function overlap(task: Set<string>, text: string): number {
  let score = 0;
  for (const word of words(text)) if (task.has(word)) score += 1;
  return score;
}

function clip(text: string): string {
  return text.length > MAX_EXAMPLE_CHARS ? `${text.slice(0, MAX_EXAMPLE_CHARS).trimEnd()}…` : text;
}

/** Up to MAX_LEXICON entries whose words occur in the task. */
export function matchLexicon(task: string): string[] {
  const lower = ` ${task.toLowerCase().replaceAll('ё', 'е')} `;
  const lines: string[] = [];
  for (const entry of AI_LEXICON) {
    const hit = entry.w.some((word) => {
      const needle = word.toLowerCase().replaceAll('ё', 'е').trim();
      return needle.length >= 2 && lower.includes(needle.length <= 3 ? ` ${needle} ` : needle);
    });
    if (hit) lines.push(`${entry.w.join('/')} — ${entry.m}`);
    if (lines.length >= MAX_LEXICON) break;
  }
  return lines;
}

/** 3–4 examples of the format: gold first, then by topic overlap; the most relevant is placed last. */
export function pickExamples(format: WriterFormat, task: string): string[] {
  const taskWords = words(task);
  if (format === 'telegram') {
    const review = /обзор|медал|габен|на геро|игр на/i.test(task);
    return AI_TELEGRAM_EXAMPLES.filter((row) => (review ? row.k === 'review' : row.k !== 'review'))
      .map((row) => ({ row, score: overlap(taskWords, row.t) * 2 + (row.g ? 3 : 0) + (row.t.length > 40 ? 1 : 0) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .reverse()
      .map(({ row }) => `Пример поста:\n${clip(row.t)}`);
  }
  return AI_REEL_EXAMPLES.filter((row) => row.f === REEL_FORMAT[format] && row.r !== 'a')
    .map((row) => ({ row, score: overlap(taskWords, `${row.title} ${row.t}`) * 2 + (row.r === 'g' ? 3 : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .reverse()
    .map(({ row }) => `Пример (${row.r === 'g' ? 'эталон' : 'референс'}, «${row.title}»):\n${clip(row.t)}`);
}

export function buildWriterPrompt(input: {
  format: WriterFormat;
  mode: WriterMode;
  task: string;
  /** For a rewrite: the current text and the owner's instruction. */
  rewrite?: { text: string; instruction: string };
}): { instructions: string; input: string } {
  const instructions = [
    AI_PACK.core,
    AI_PACK.formats[input.format],
    AI_PACK.output,
    AI_PACK.lessons,
    AI_PACK.state
  ].join('\n\n');
  const lexicon = matchLexicon(`${input.task} ${input.rewrite?.instruction ?? ''}`);
  const parts = [
    lexicon.length > 0 ? `Сленг и мемы из задания:\n${lexicon.join('\n')}` : '',
    ...pickExamples(input.format, input.task),
    `ФОРМАТ: ${FORMAT_NAME[input.format]}`,
    `РЕЖИМ: ${input.mode === 'direct' ? 'прямой запрос автора' : 'автоматический повод (только факты задания)'}`
  ];
  if (input.rewrite) {
    parts.push(
      `ТЕКУЩИЙ ТЕКСТ:\n${input.rewrite.text}`,
      `ЗАДАНИЕ: перепиши текст — ${input.rewrite.instruction}. Сохрани голос, формат и всё удачное. Верни строку «ТЕКСТ:» и текст.`
    );
  } else {
    parts.push(`ЗАДАНИЕ:\n${input.task}`);
  }
  return { instructions, input: parts.filter(Boolean).join('\n\n') };
}

/** Hooks and text from the model's answer («ХУКИ:» lines, then «ТЕКСТ:»); a plain answer is the text. */
export function parseWriterOutput(raw: string): { hooks: string[]; text: string } {
  const trimmed = raw.trim();
  const textAt = trimmed.search(/(^|\n)\s*ТЕКСТ:\s*/);
  if (textAt === -1) return { hooks: [], text: trimmed.replace(/^ХУКИ:[\s\S]*$/m, '').trim() || trimmed };
  const head = trimmed.slice(0, textAt);
  const text = trimmed
    .slice(textAt)
    .replace(/^\s*ТЕКСТ:\s*/, '')
    .trim();
  const hooks = head
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-'))
    .map((line) => line.replace(/^-\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 3)
    // A hook is two sentences; a runaway line must not push the bot message past Telegram's limit.
    .map((hook) => hook.slice(0, 200));
  return { hooks, text };
}

/** The pack the prompt was built from, as a short stable hash (FNV-1a). */
export function packRevision(): string {
  const text = JSON.stringify(AI_PACK);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
