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
    const group = GROUP.exec(raw);
    if (group !== null) {
      groups.push({ title: `${group[1]} ${(group[2] ?? '').replace(/:$/u, '')}`, rows: [] });
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
      `<tr><th colspan="2">${escapeHtml(group.title)}</th></tr>`,
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

/** The rich HTML of an approved AI text, or null when the text has no rich structure yet (it goes out as before). */
export function aiRichHtml(text: string): string | null {
  return patchRichHtml(text);
}
