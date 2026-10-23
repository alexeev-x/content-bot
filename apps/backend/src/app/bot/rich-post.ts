import { RICH_MEDIA_SLOT } from '@alexeev/contracts';
import { escapeHtml as escapeTags } from '../notifications/notice-template';

// The text's own «{» is written as an entity, so a «{{media}}» typed by the writer or the owner never becomes the slot
// (QA 23.10.2026): only the server's slot gets the pictures.
const escapeHtml = (text: string) => escapeTags(text).replace(/{/g, '&#123;');
// A line is the post's link only when the address is nearly all of it («Все изменения — <url>»); a sentence with an
// address in it stays a sentence (QA 23.10.2026).
const LINK_LABEL_MAX = 30;

// The approved rich format of an AI post (owner, 23.10.2026: every post in the approved sample). The writer keeps
// writing plain text the owner reads and rewrites in the bot, in a fixed structure its task asks for; this turns that
// text into Telegram rich HTML at approval. Text that does not follow the structure gives null, and the post goes out
// in the classic format: never a half-built rich post.

const URL_IN_LINE = /https?:\/\/[^\s<>"]+/u;
const PATCH_LEAD = /^Вышел (?:патч )?(\d\.\d{2}[a-z]?)\.?$/u;
const GROUP = /^(🔴|🟢|🟡)\s*(.+)$/u;
// A group is known by its words, whatever mark the writer put before it (owner, 23.10.2026: «🔺 Усилили» came out red;
// buffed is always green).
const GROUP_BY_TITLE: readonly [RegExp, string][] = [
  [/^порезали/iu, '🔴'],
  [/^усилил/iu, '🟢'],
  [/^(?:почти не изменил|и то и другое)/iu, '🟡']
];

/** The group a header line opens, its mark set by its words: «🔺 Усилили:» → «🟢 Усилили». */
function groupHeader(line: string): string | null {
  const title = line
    .replace(/^[^\p{L}]+/u, '')
    .replace(/:$/u, '')
    .trim();
  const known = GROUP_BY_TITLE.find(([pattern]) => pattern.test(title));
  if (known !== undefined && title.length <= 40) return `${known[1]} ${title}`;
  const marked = GROUP.exec(line);
  return marked === null ? null : `${marked[1]} ${(marked[2] ?? '').replace(/:$/u, '')}`;
}
const ITEMS = /^(?:🧰\s*)?Предметы:?$/iu;
const BULLET = /^[•\-–—*]\s*/u;
// «Герой — что поменяли»: the first dash between two words splits the row.
// At most four heroes in a group (owner, 23.10.2026): usually two, three or four only when it is really interesting.
const GROUP_ROWS_MAX = 4;
const ROW = /^(.{1,40}?)\s+[—–-]\s+(.+)$/u;

/** Only a dota2.com page gets the «Подробнее» button (owner, 23.10.2026: no other links, no source line). */
function moreButton(url: string | null): string {
  if (url === null) return '';
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return '';
  }
  if (host !== 'dota2.com' && !host.endsWith('.dota2.com')) return '';
  return `<tg-button-row><tg-button type="url" url="${escapeHtml(url)}">Подробнее</tg-button></tg-button-row>`;
}

/**
 * A patch post written as: «Вышел <version>.», the main change in one or more paragraphs, then groups headed «🔴 …»,
 * «🟢 …», «🟡 …» of «Герой — что поменяли» lines, then «Предметы» with one item per line, and the link last. The
 * groups become one table under header rows, the items a folded block; the patch picture goes into the media slot.
 */
export function patchRichHtml(text: string): string | null {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const lead = PATCH_LEAD.exec(lines[0] ?? '');
  if (lead === null) return null;
  const version = lead[1] ?? '';
  let link: string | null = null;
  const main: string[] = [];
  const groups: { title: string; rows: [string, string][] }[] = [];
  const items: string[] = [];
  const tail: string[] = [];
  let section: 'main' | 'group' | 'items' | 'tail' = 'main';
  for (const raw of lines.slice(1)) {
    const url = URL_IN_LINE.exec(raw)?.[0] ?? null;
    if (url !== null && raw.replace(url, '').trim().length <= LINK_LABEL_MAX) {
      // The link line («Все изменения — <url>») becomes the button; its words are not repeated.
      link = url;
      continue;
    }
    const header = groupHeader(raw);
    if (header !== null) {
      groups.push({ title: header, rows: [] });
      section = 'group';
      continue;
    }
    if (ITEMS.test(raw)) {
      section = 'items';
      continue;
    }
    const line = raw.replace(BULLET, '');
    if (section === 'main') main.push(line);
    else if (section === 'group') {
      const row = ROW.exec(line);
      const current = groups.at(-1);
      if (row === null || current === undefined) {
        section = 'tail';
        tail.push(line);
      } else current.rows.push([row[1] ?? '', row[2] ?? '']);
    } else if (section === 'items') items.push(line);
    else tail.push(line);
  }
  const filled = groups.filter((group) => group.rows.length > 0);
  if (main.length === 0 || filled.length === 0) return null;
  const [first = '', ...rest] = main;
  return [
    `<h3>Вышел ${escapeHtml(version)}</h3>`,
    RICH_MEDIA_SLOT,
    `<p><b>Главное:</b> ${escapeHtml(first)}</p>`,
    ...rest.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`),
    '<table bordered compact>',
    ...filled.flatMap((group) => [
      // A plain cell, not a header: Telegram centres a header, the owner wants the group on the left like the text.
      `<tr><td colspan="2"><b>${escapeHtml(group.title)}</b></td></tr>`,
      ...group.rows
        .slice(0, GROUP_ROWS_MAX)
        .map(([hero, change]) => `<tr><td>${escapeHtml(hero)}</td><td>${escapeHtml(change)}</td></tr>`)
    ]),
    '</table>',
    items.length === 0
      ? ''
      : `<details><summary>Предметы</summary><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></details>`,
    ...tail.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`),
    moreButton(link)
  ]
    .filter((part) => part !== '')
    .join('\n');
}

const HEADING_MAX = 80;
const SECTION = /^([^•\-–—*:][^:]{0,58}):$/u;
const DETAILS = /^▾\s*(.+)$/u;
const TABLE_HEAD = /^([^|—–]{1,40})\s*\|\s*([^|—–]{1,60})$/u;

/** A block of lines: «• » list, «А — Б» rows (a table, an optional «Колонка | Колонка» head), or paragraphs. */
function blockHtml(lines: readonly string[]): string {
  // «Раздел:» on its own line above its points is the section's heading (owner, 23.10.2026: no wall of text).
  const section = SECTION.exec(lines[0] ?? '');
  if (section !== null && lines.length > 1)
    return `<h4>${escapeHtml(section[1] ?? '')}</h4>
${blockHtml(lines.slice(1))}`;
  if (lines.every((line) => BULLET.test(line)))
    return `<ul>${lines.map((line) => `<li>${escapeHtml(line.replace(BULLET, ''))}</li>`).join('')}</ul>`;
  const head = TABLE_HEAD.exec(lines[0] ?? '');
  const rows = (head === null ? lines : lines.slice(1)).map((line) => ROW.exec(line));
  if (rows.length >= 2 && rows.every((row) => row !== null)) {
    const header =
      head === null
        ? ''
        : `<tr><th>${escapeHtml((head[1] ?? '').trim())}</th><th>${escapeHtml((head[2] ?? '').trim())}</th></tr>`;
    const body = rows
      .map((row) => `<tr><td>${escapeHtml(row?.[1] ?? '')}</td><td>${escapeHtml(row?.[2] ?? '')}</td></tr>`)
      .join('');
    return `<table bordered striped compact>${header}${body}</table>`;
  }
  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('\n');
}

/**
 * Any other post of a source (news, hotfix, an event series post, a treasure follow-up) in the structure its task asks
 * for: a short heading line, then blocks split by empty lines — paragraphs, «• » lists, «А — Б» tables, «▾ Заголовок»
 * opening a folded block to the end, and the link alone on a line last. A text whose first line is not a heading gives
 * null: the post goes out as before.
 */
export function structuredRichHtml(text: string): string | null {
  const blocks = text
    .split(/\n\s*\n/u)
    .map((block) =>
      block
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')
    )
    .filter((block) => block.length > 0);
  const heading = blocks[0]?.length === 1 ? (blocks[0][0] ?? '') : '';
  if (heading === '' || Array.from(heading).length > HEADING_MAX || /[.!?…:]$/u.test(heading)) return null;
  let link: string | null = null;
  const body: string[] = [];
  const folded: string[] = [];
  let summary: string | null = null;
  for (const block of blocks.slice(1)) {
    const lines = [...block];
    const only = lines.length === 1 ? (lines[0] ?? '') : '';
    const url = URL_IN_LINE.exec(only)?.[0] ?? null;
    if (url !== null && only.replace(url, '').trim().length <= LINK_LABEL_MAX) {
      link = url;
      continue;
    }
    const opens = DETAILS.exec(lines[0] ?? '');
    if (opens !== null && summary === null) {
      summary = opens[1] ?? '';
      lines.shift();
    }
    if (lines.length === 0) continue;
    (summary === null ? body : folded).push(blockHtml(lines));
  }
  if (body.length === 0) return null;
  return [
    `<h3>${escapeHtml(heading)}</h3>`,
    RICH_MEDIA_SLOT,
    ...body,
    summary === null || folded.length === 0
      ? ''
      : `<details><summary>${escapeHtml(summary)}</summary>${folded.join('\n')}</details>`,
    moreButton(link)
  ]
    .filter((part) => part !== '')
    .join('\n');
}

/** Every task of a source's writer opens so (patch, news, hotfix, series, treasure follow-up). */
const SOURCE_TASK = 'Повод:';
const LINEAGE_MAX = 20;

/**
 * Whether a draft (or a rewrite of one) was written for a source: only those take the rich sample; the owner's own
 * posts keep their classic form.
 */
export async function isSourceDraft(
  find: (id: string) => Promise<{ task: string; parentGenerationId: string | null } | null>,
  generation: { task: string; parentGenerationId: string | null }
): Promise<boolean> {
  let current: { task: string; parentGenerationId: string | null } | null = generation;
  for (let step = 0; current !== null && step < LINEAGE_MAX; step += 1) {
    if (current.parentGenerationId === null) return current.task.startsWith(SOURCE_TASK);
    current = await find(current.parentGenerationId);
  }
  return false;
}

/**
 * The rich HTML of an approved AI text of a source (the approved samples, owner 23.10.2026), or null when it is not a
 * source's draft or its text has no rich structure (the post goes out as before).
 */
export function aiRichHtml(text: string, fromSource: boolean): string | null {
  if (!fromSource) return null;
  return patchRichHtml(text) ?? structuredRichHtml(text);
}

/**
 * The structure every source post's task asks for (all but the patch, which has its own): what `structuredRichHtml`
 * turns into the approved sample. Kept beside the parser so the two never drift.
 */
export const SOURCE_POST_STRUCTURE = [
  'Оформи пост строго так, блоки через пустую строку, без markdown:',
  '— первая строка: короткий заголовок поста, до 60 знаков, без точки в конце;',
  '— дальше короткими разделами: строка-подзаголовок с двоеточием в конце («Что изменилось в карнавале:»), под ней 2–4 пункта «• » или абзац; без длинных сплошных абзацев;',
  '— перечисление — строками, начинающимися с «• »;',
  '— если сравниваешь несколько героев, предметов или сетов — строками «Название — что важно» подряд (это станет таблицей), можно со строкой-шапкой «Колонка | Колонка» перед ними;',
  '— второстепенное можно свернуть в конце: строка «▾ Заголовок», под ней то, что свернуть;',
  '— ссылку поставь последней строкой отдельно.',
  'Героя называй, как его зовут игроки (Котл, БХ, Трент); нет такого имени — английское название. Не упоминай другие посты и не называй источники.'
].join('\n');
