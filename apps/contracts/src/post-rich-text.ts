import type { PostEntity } from './post-entities';
import { RICH_MEDIA_SLOT } from './post-rich';

// The text-to-rich builder of a source's post, shared by the server (approval, a studio edit) and the studio's live
// preview (owner, 24.10.2026: a rich post is edited as text, its look rebuilt as it is typed).

const escapeTags = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
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

/** A short line that only points at the link below it: «Все остальные изменения:», «Подробнее —». */
const LINK_LABEL = /^[^.!?]{0,30}(?:изменени|исправлени|подробн|ссылк|списк)[^.!?]{0,20}$|^[^.!?]{1,30}[:—–-]$/iu;

/**
 * The text without the label over its link (owner, 24.10.2026: «Все остальные изменения» stayed a heading over a bare
 * address): the link becomes the «Подробнее» button, so the line pointing at it goes too.
 */
function withoutLinkLabel(text: string): string {
  const lines = text.split('\n');
  const isLink = (line: string) => {
    const url = URL_IN_LINE.exec(line.trim())?.[0];
    return url !== undefined && line.trim().replace(url, '').trim().length <= LINK_LABEL_MAX;
  };
  let at = lines.length - 1;
  while (at >= 0 && !isLink(lines[at] ?? '')) at -= 1;
  if (at <= 0) return text;
  let before = at - 1;
  while (before > 0 && (lines[before] ?? '').trim() === '') before -= 1;
  // Never the first line: it is the post's heading.
  if (before <= 0 || !LINK_LABEL.test((lines[before] ?? '').trim())) return text;
  return [...lines.slice(0, before), ...lines.slice(at)].join('\n');
}

/** Only a dota2.com page gets the «Подробнее» button (owner, 23.10.2026: no other links, no source line). */
function moreButton(url: string | null): string {
  if (url === null) return '';
  // The host by the address's own form: this file also runs where no URL parser is typed (the contracts package).
  const host = /^https?:\/\/([^/?#:@\s]+)(?:[/?#:]|$)/iu.exec(url)?.[1]?.toLowerCase() ?? '';
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

/**
 * The rich HTML of a source post's plain text (the approved samples, owner 23.10.2026), or null when the text has no
 * rich structure (the post goes out in the classic format).
 */
export function sourceRichHtml(text: string): string | null {
  const clean = withoutLinkLabel(text);
  return patchRichHtml(clean) ?? findRichHtml(clean) ?? structuredRichHtml(clean);
}

const FIND_LEAD = /^В файлах игры нашли/u;
// «Вампиризм Grappling Claw: 40/80/120/160 → 30/60/90/120»: one changed value.
const CHANGE_ROW = /^(?:[•\-–—*]\s*)?([^:→]{2,60}):\s*([^→]{1,40}?)\s*→\s*(.{1,40})$/u;
const DIFF_FENCE = /^```/u;

/**
 * A find in the game's files with numbers or dates that changed (owner, 24.10.2026: «супер с таблицами»): its text,
 * then one table of what was and what is now — each value's name on a row of its own over its two cells, so a phone
 * does not wrap «40/80/120/160». A find with no such lines stays a classic post with its red and green code block.
 */
export function findRichHtml(text: string): string | null {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (!FIND_LEAD.test(lines[0] ?? '')) return null;
  const rows: [string, string, string][] = [];
  const paragraphs: string[] = [];
  let inCode = false;
  for (const line of lines) {
    // A code block has no place next to the table: Telegram's phones draw it badly in a rich message (owner, 24.10.2026).
    if (DIFF_FENCE.test(line)) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const row = CHANGE_ROW.exec(line);
    if (row !== null) rows.push([row[1] ?? '', row[2] ?? '', row[3] ?? '']);
    else paragraphs.push(line);
  }
  if (rows.length === 0 || paragraphs.length === 0) return null;
  return [
    ...paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`),
    `<table bordered compact><tr><th>Было</th><th>Стало</th></tr>${rows
      .map(
        ([what, was, now]) =>
          `<tr><td colspan="2"><b>${escapeHtml(what.trim())}</b></td></tr><tr><td>${escapeHtml(was)}</td><td>${escapeHtml(now.trim())}</td></tr>`
      )
      .join('')}</table>`
  ].join('\n');
}

/**
 * A post's body with its links written back as addresses: the text `sourceRichHtml` reads. The bot hides every address
 * of an AI text behind its words («Все изменения: https://…» → «Все изменения» linked), so a studio edit of a rich post
 * is rebuilt from the body as the writer's text was: a link closing its line becomes «words: address», «ссылка» inside a
 * sentence the address itself.
 */
export function sourceTextOf(body: string, entities: readonly PostEntity[]): string {
  const links = entities
    .flatMap((entity) => (entity.type === 'text_link' ? [entity] : []))
    .sort((a, b) => b.offset - a.offset);
  let text = body;
  for (const link of links) {
    const end = link.offset + link.length;
    const lineEnd = text.indexOf('\n', end);
    const closesLine = text.slice(end, lineEnd === -1 ? undefined : lineEnd).trim() === '';
    if (text.slice(link.offset, end) === 'ссылка' && !closesLine)
      text = `${text.slice(0, link.offset)}${link.url}${text.slice(end)}`;
    else if (closesLine) text = `${text.slice(0, end)}: ${link.url}${text.slice(end)}`;
  }
  return text;
}

/** The rich HTML a post's body and formatting rebuild into, or null when the text lost its rich structure. */
export function postRichHtml(body: string, entities: readonly PostEntity[]): string | null {
  return sourceRichHtml(sourceTextOf(body, entities));
}
