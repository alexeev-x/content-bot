import { expandRichMedia, RICH_MEDIA_SLOT } from '@alexeev/contracts';
import { escapeHtml } from './picture';

// A rubric post whose lines carry changes («▼ Трент — Living Armor: минимальный блокируемый урон: 20 → 10») goes as a
// rich message (owner, 25.10.2026: «тут надо в виде таблицы rich»): the picture, the text, and one table «Было / Стало»
// with each change's name on a row of its own over its two cells, the new value marked red for a nerf (▼), green for a
// buff (▲); a line with no arrow stays unmarked, so a «Нерф или баф?» table does not give its answer away.

// The name runs up to the last colon before the value: names hold colons of their own («Living Armor: урон»).
const CHANGE_LINE = /^([▲▼])?\s*(.+):\s*([^:→]{1,40}?)\s*→\s*(.{1,40})$/u;

/** The rich HTML of a rubric's caption with the picture on top, or null when the caption has no change lines. */
export function rubricRichHtml(text: string, withPicture: boolean): string | null {
  const before: string[] = [];
  const after: string[] = [];
  const rows: { mark: string; what: string; was: string; now: string }[] = [];
  for (const line of text.split('\n').map((each) => each.trim())) {
    if (line === '') continue;
    const change = CHANGE_LINE.exec(line);
    if (change === null) (rows.length === 0 ? before : after).push(line);
    else
      rows.push({
        mark: change[1] === '▲' ? '🟢 ' : change[1] === '▼' ? '🔴 ' : '',
        what: change[2] ?? '',
        was: change[3] ?? '',
        now: change[4] ?? ''
      });
  }
  if (rows.length === 0) return null;
  const paragraph = (each: string) => `<p>${escapeHtml(each)}</p>`;
  const table = `<table bordered compact><tr><th>Было</th><th>Стало</th></tr>${rows
    .map(
      (row) =>
        `<tr><td colspan="2"><b>${escapeHtml(row.what.trim())}</b></td></tr><tr><td>${escapeHtml(row.was)}</td><td>${row.mark}${escapeHtml(row.now.trim())}</td></tr>`
    )
    .join('')}</table>`;
  const html = [withPicture ? RICH_MEDIA_SLOT : '', ...before.map(paragraph), table, ...after.map(paragraph)]
    .filter((part) => part !== '')
    .join('\n');
  return withPicture ? expandRichMedia(html, [{ kind: 'photo' }]) : html;
}
