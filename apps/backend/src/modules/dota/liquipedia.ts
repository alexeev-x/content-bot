// Liquipedia's Dota 2 wiki as an on-demand source (owner, 22.10.2026): its MediaWiki API only, never its HTML pages
// (its terms forbid automated access to anything else). At most one request per 2 s, a User-Agent naming the project
// and a contact, gzip accepted, and «Источник: Liquipedia» in the post (CC-BY-SA 3.0). Only facts are taken;
// its pictures stay there (the files are not part of the API).

const API = 'https://liquipedia.net/dota2/api.php';
export const LIQUIPEDIA_PAGE = 'https://liquipedia.net/dota2/';
const USER_AGENT = 'AlexeevContentBot/1.0 (https://github.com/alexeev-x/content-bot; al93wswha@gmail.com)';
const TIMEOUT_MS = 15_000;
const MAX_TEXT_BYTES = 400_000;
/** Liquipedia asks for no more than one request per 2 seconds. */
export const LIQUIPEDIA_SPACING_MS = 2_000;

async function call(params: Record<string, string>, fetchImpl: typeof fetch): Promise<unknown> {
  const url = new URL(API);
  for (const [key, value] of Object.entries({ ...params, format: 'json', formatversion: '2' }))
    url.searchParams.set(key, value);
  const response = await fetchImpl(url, {
    headers: { 'user-agent': USER_AGENT, 'accept-encoding': 'gzip', accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`LIQUIPEDIA_HTTP_${response.status}`);
  const text = await response.text();
  if (text.length > MAX_TEXT_BYTES) throw new Error('LIQUIPEDIA_TOO_LARGE');
  return JSON.parse(text) as unknown;
}

/**
 * Pages the announcement title names, the longest first («Inside the Trove of Terror» → «Trove of Terror»), at most
 * three; empty while the wiki has none. The caller keeps the first that is a treasure's.
 */
export async function findLiquipediaPages(
  announcementTitle: string,
  fetchImpl: typeof fetch = fetch
): Promise<string[]> {
  // The wiki's search does not rank a treasure for «Inside the Trove of Terror»; asking which of the title's phrases
  // of two words or more exist as pages does, in one request (the API takes up to 50 titles).
  const words = announcementTitle
    .replace(/[«»"—–:!?.,]/g, ' ')
    .split(/\s+/)
    .filter((word) => word !== '');
  const phrases: string[] = [];
  for (let length = Math.min(words.length, 8); length >= 2; length -= 1)
    for (let start = 0; start + length <= words.length; start += 1)
      phrases.push(words.slice(start, start + length).join(' '));
  const candidates = [...new Set(phrases)].slice(0, 50);
  if (candidates.length === 0) return [];
  const body = (await call({ action: 'query', titles: candidates.join('|'), redirects: '1' }, fetchImpl)) as {
    query?: { pages?: { title?: string; missing?: boolean }[] };
  };
  const found = (body.query?.pages ?? [])
    .filter((page) => page.missing !== true && typeof page.title === 'string')
    .map((page) => page.title as string);
  return [...new Set(found)].sort((a, b) => b.length - a.length).slice(0, 3);
}

/** The page is a treasure's: its infobox says so. */
export const isTreasurePage = (text: string): boolean => /\|\s*prefab\s*=\s*Treasure\b/i.test(text);

/** The page's latest revision id and, when `withText`, its wikitext. Null when the page is gone. */
export async function readLiquipediaPage(
  title: string,
  withText: boolean,
  fetchImpl: typeof fetch = fetch
): Promise<{ revision: number; text: string | null } | null> {
  const body = (await call(
    {
      action: 'query',
      prop: 'revisions',
      titles: title,
      rvprop: withText ? 'ids|content' : 'ids',
      rvslots: 'main'
    },
    fetchImpl
  )) as {
    query?: {
      pages?: { missing?: boolean; revisions?: { revid?: number; slots?: { main?: { content?: string } } }[] }[];
    };
  };
  const page = body.query?.pages?.[0];
  const revision = page?.revisions?.[0];
  if (page === undefined || page.missing === true || revision?.revid === undefined) return null;
  return { revision: revision.revid, text: withText ? (revision.slots?.main?.content ?? null) : null };
}

export interface TreasureFacts {
  /** Valve's item id of the treasure (its price comes from Valve by it). */
  defindex: number | null;
  /** Sets by rarity, common first, as the page groups them. */
  sets: { rarity: string; names: string[] }[];
  /** «Open 12 treasures to receive:» and its items, one per condition. */
  bonuses: { condition: string; items: string[] }[];
  /** A short summary of the drop rates table, or null while the table has no rates. */
  dropRates: string | null;
}

const COSMETIC = /\{\{Cosmetic\|([^|}]{1,120})/g;
const plain = (text: string) =>
  text
    .replace(/<[^>]{1,300}>/g, '')
    .replace(/\{\{color\|[^}]*\}\}/g, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'{2,3}/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** The facts of a treasure page's wikitext; a section the page does not have yet is left empty. */
export function parseTreasureWikitext(text: string): TreasureFacts {
  const defindex = Number(/\|\s*defindex\s*=\s*(\d{1,7})/.exec(text)?.[1] ?? NaN);
  // Split at level-2 and level-3 headings: sets come from level-3 sections only, so «See also» or «Trivia» (level 2)
  // never reads as a rarity.
  const sections = text.split(/\n(?=={2,3}[^=])/);
  const sets: TreasureFacts['sets'] = [];
  const bonuses: TreasureFacts['bonuses'] = [];
  let dropRates: string | null = null;
  for (const section of sections) {
    // A heading may carry styles with «=» in them («<span style="color:…">Rare</span>»): its whole first line.
    const firstLine = section.split('\n')[0] ?? '';
    const line = /^(={2,3})(?!=)(.*[^=])\1\s*$/.exec(firstLine);
    const level = line?.[1]?.length ?? 0;
    const heading = plain(line?.[2] ?? '');
    const body = line === null ? section : section.slice(firstLine.length);
    if (/drop rates/i.test(heading)) {
      // Only rows with rates are facts; an intro alone (a table still being filled) is not.
      const rows = [...body.matchAll(/^\|\s*(\d+\w*)\s*\|\|(.+)$/gm)]
        .map((row) => ({
          opened: row[1] ?? '',
          rates: [...(row[2] ?? '').matchAll(/\((\d+(?:\.\d+)?%)\)/g)].map((rate) => rate[1] ?? '')
        }))
        .filter((row) => row.rates.length > 0);
      const first = rows[0];
      const last = rows.at(-1);
      if (first !== undefined && last !== undefined) {
        const row = (item: { opened: string; rates: string[] }) => `${item.opened} открытие: ${item.rates.join(' / ')}`;
        const intro = plain(body.split('{|')[0] ?? '').slice(0, 400);
        dropRates = [intro, row(first), last === first ? '' : row(last)].filter((part) => part !== '').join(' ');
      }
      continue;
    }
    if (/bonus/i.test(heading)) {
      for (const block of body.split(/\n(?=Open )/)) {
        const condition = plain(/^Open[^\n]*/m.exec(block)?.[0] ?? '');
        const items = [...block.matchAll(COSMETIC)].map((match) => (match[1] ?? '').trim());
        if (condition !== '' && items.length > 0) bonuses.push({ condition, items });
      }
      continue;
    }
    if (level !== 3) continue;
    const names = [...body.matchAll(COSMETIC)].map((match) => (match[1] ?? '').trim()).filter((name) => name !== '');
    if (heading !== '' && names.length > 0) sets.push({ rarity: heading, names });
  }
  return { defindex: Number.isSafeInteger(defindex) ? defindex : null, sets, bonuses, dropRates };
}
