// An event's own page on dota2.com (e.g. /darkcarnival): Valve's texts for it (the Russian translation among them),
// its media and its treasure, for a series of posts (owner, 21.10.2026). The page is a React app: its texts are a
// localization chunk and its media are paths in the page's code chunk, both found through the app's main bundle and
// chunk manifest. Minified names change with every build and every event gets a page of its own (owner, 22.10.2026:
// the content must be taken whatever the page), so only shapes shared by the pages of 2023–2026 are matched; what
// could not be read is reported as a gap instead of being lost silently. Without texts the page counts as absent and
// the event is written from its announcement alone.

const SITE = 'https://www.dota2.com';
const IMAGE_BASE = 'https://cdn.steamstatic.com/apps/dota2/images/dota_react/';
// Valve keeps the treasure slides' images next to their videos.
const VIDEO_BASE = 'https://cdn.steamstatic.com/apps/dota2/videos/dota_react/';
const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 512 * 1024;
const MAX_MAIN_BYTES = 8 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 512 * 1024;
const MAX_CHUNK_BYTES = 2 * 1024 * 1024;
// Pages of 2023–2026 have up to ~300 texts; the planner reads them all, so the total is bounded too.
const MAX_TEXTS = 400;
const MAX_TEXTS_CHARS = 60_000;
const MAX_TEXT_LENGTH = 1_500;
const MAX_MEDIA = 80;
const MAX_TREASURE_SETS = 40;
// Page decoration (folders, and files named as a header or background: DEV 21.10.2026 picked the header's looping
// video): never offered for a post.
const DECORATION = /(?:^|\/)(?:header|backgrounds?|logos?)\/|(?:header|background)[^/]*$|_icon\.\w+$/i;
const MEDIA_EXTENSION = /\.(?:png|jpe?g|webp|gif)$/i;
const SLUG = /^[a-z0-9]{3,40}$/;
// Site sections that are not an event page.
const NOT_EVENTS = new Set([
  'newsentry',
  'news',
  'patches',
  'patchnotes',
  'heroes',
  'items',
  'store',
  'home',
  'datafeed'
]);

export interface EventPageText {
  key: string;
  text: string;
}

/** One set of the page's treasure: its hero, its name and its image on Valve's CDN when the page shows one. */
export interface TreasureSet {
  hero: string;
  set: string;
  image: string | null;
}

/** What the page has but could not be read in full; the owner is told (owner, 22.10.2026). */
export type EventPageGap = 'texts_truncated' | 'no_media' | 'treasure_order_unknown' | 'treasure_images_missing';

export interface EventPage {
  slug: string;
  url: string;
  /** Valve's own texts of the page, Russian when Valve translated it, in the page's order. */
  texts: EventPageText[];
  language: 'russian' | 'english';
  images: string[];
  /** In the treasure slider's order, from common to rarest: the last set is the top reward (owner, 22.10.2026). */
  treasure: TreasureSet[];
  gaps: EventPageGap[];
}

/** dota2.com pages an announcement links to (`http://dota2.com/darkcarnival`), in order, without repeats. */
export function eventPageSlugs(raw: string): string[] {
  const slugs: string[] = [];
  for (const match of raw.matchAll(/https?:\/\/(?:www\.)?dota2\.com\/([a-z0-9]+)(?=[\s"'\]<)/?#]|$)/gi)) {
    const slug = (match[1] ?? '').toLowerCase();
    if (SLUG.test(slug) && !NOT_EVENTS.has(slug) && !slugs.includes(slug)) slugs.push(slug);
  }
  return slugs.slice(0, 3);
}

/** The bundle and manifest URLs from the page's HTML (they carry a build version). */
export function bundleUrls(html: string): { main: string; manifest: string } | null {
  const find = (name: string) => {
    const match = new RegExp(`/public/javascript/dota_react/${name}\\.js\\?v=([\\w-]{1,40})`).exec(html);
    return match ? `${SITE}/public/javascript/dota_react/${name}.js?v=${match[1]}&l=english` : null;
  };
  const main = find('main');
  const manifest = find('manifest');
  return main && manifest ? { main, manifest } : null;
}

const IDENT = '[A-Za-z_$][\\w$]*';
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Chunk ids of the page's code and of its texts in one language, from the main bundle. The app names a page's route,
 * texts and media folder by its own name, which is not always the address (`patch738` is /wanderingwaters,
 * `winter2023` is /frostivus2023).
 */
export function pageChunkIds(
  main: string,
  slug: string,
  language: string
): { page: number | null; texts: number | null; route: string } {
  const route = new RegExp(`[,{](${IDENT}):\\(\\)=>"/${escape(slug)}"`).exec(main)?.[1] ?? slug;
  const texts = new RegExp(`"\\./${escape(route)}_${escape(language)}\\.json":\\[(\\d{1,7})`).exec(main);
  const component = new RegExp(`path:${IDENT}\\.${IDENT}\\.${escape(route)}\\(\\),component:(${IDENT})`).exec(main);
  let page: number | null = null;
  if (component?.[1]) {
    const lazy = new RegExp(
      `[,;\\s]${escape(component[1])}=${IDENT}\\.lazy\\(\\(\\)=>${IDENT}\\.e\\((\\d{1,7})\\)`
    ).exec(main);
    page = lazy?.[1] ? Number(lazy[1]) : null;
  }
  return { page, texts: texts?.[1] ? Number(texts[1]) : null, route };
}

/** The content hash of a code chunk: the manifest's first map is the scripts'. */
export function chunkHash(manifest: string, id: number): string | null {
  return new RegExp(`[{,]${id}:"([0-9a-f]{20})"`).exec(manifest)?.[1] ?? null;
}

export const chunkUrl = (id: number, hash: string) =>
  `${SITE}/public/javascript/dota_react/${id}.js?contenthash=${hash}`;

// A JavaScript string body, as webpack emits a JSON module: `JSON.parse('…')`, or `JSON.parse(\`…\`)` in other builds.
// Decoded by hand: the chunk is data from another site and is never evaluated.
export function decodeJsString(body: string): string {
  return body.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|u\{[0-9a-fA-F]{1,6}\}|[\s\S])/g, (_, escaped: string) => {
    if (escaped.startsWith('x') && escaped.length === 3) return String.fromCharCode(parseInt(escaped.slice(1), 16));
    if (escaped.startsWith('u{')) return String.fromCodePoint(parseInt(escaped.slice(2, -1), 16));
    if (escaped.startsWith('u') && escaped.length === 5) return String.fromCharCode(parseInt(escaped.slice(1), 16));
    const simple: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0' };
    return simple[escaped] ?? escaped;
  });
}

/**
 * The page's texts from its localization chunk: markup dropped, the comic's captions and the language tag left out.
 * `truncated` when the bounds cut texts off.
 */
export function parseTextsChunk(chunk: string, route: string): { texts: EventPageText[]; truncated: boolean } {
  const body = /JSON\.parse\((['`])((?:(?!\1)[^\\]|\\[\s\S])*)\1\)/.exec(chunk)?.[2];
  if (body === undefined) return { texts: [], truncated: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeJsString(body));
  } catch {
    return { texts: [], truncated: false };
  }
  if (parsed === null || typeof parsed !== 'object') return { texts: [], truncated: false };
  const texts: EventPageText[] = [];
  let chars = 0;
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== 'string' || key === 'language' || key.startsWith(`${route}comic`)) continue;
    const text = value
      .replace(/\[\/?[a-z]{1,10}\]/gi, '')
      .replace(/<[^>]{1,200}>/g, ' ')
      .replace(/%\d\$s/g, '…')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_TEXT_LENGTH);
    if (text === '') continue;
    if (texts.length >= MAX_TEXTS || chars + text.length > MAX_TEXTS_CHARS) return { texts, truncated: true };
    texts.push({ key, text });
    chars += text.length;
  }
  return { texts, truncated: false };
}

/**
 * The page's images from its code chunk: paths under the page's folders (its address and its route name), and the
 * bare names of a folder the code fills in (`${slug}/automatons/${…}`) when there is exactly one such folder. Videos
 * are not taken (owner, 22.10.2026: event posts carry photos; a video's poster is an image of its own).
 */
export function parseMediaPaths(chunk: string, pageFolders: readonly string[]): { images: string[] } {
  const full = new Set<string>();
  const bare = new Set<string>();
  for (const match of chunk.matchAll(/["`]([\w./-]{1,160})["`]/g)) {
    const path = match[1] ?? '';
    if (!MEDIA_EXTENSION.test(path) || DECORATION.test(path) || path.includes('..') || path.startsWith('/')) continue;
    (pageFolders.some((folder) => path.startsWith(`${folder}/`)) ? full : bare).add(path);
  }
  const under = pageFolders.map(escape).join('|');
  const folders = new Set(
    Array.from(chunk.matchAll(new RegExp(`\`((?:${under})/[\\w/-]{1,60}/)\\$\\{`, 'g')), (match) => match[1] ?? '')
  );
  const filled = folders.size === 1 ? Array.from(bare, (path) => `${[...folders][0]}${path}`) : [];
  return { images: [...full, ...filled].slice(0, MAX_MEDIA).map((path) => `${IMAGE_BASE}${path}`) };
}

// The treasure slider of 2023–2026 pages: a slide component showing `${…VIDEO_URL}/<folder>/${video}.png`, given
// `{index, video, name: "#<set key>", heroname: "#<hero key>"}` in one of three ways: slides written out one by one
// (largo, frostivus2023), a map over `[{heroname:"io"},…]` (darkcarnival), or a map over a count (crownfall).
const SLIDE_FOLDER = /TreasureVideo,src:`\$\{[\w$.]{1,40}VIDEO_URL\}\/([\w/-]{1,80})\/\$\{[\w$]{1,10}\}\.png`/;
const LITERAL_SLIDE = /\{index:(\d{1,3}),video:"([\w-]{1,80})",name:"#(\w{1,120})",heroname:"#(\w{1,120})"/g;
const PART = '([\\w-]{0,80})\\$\\{[\\w$]{1,10}(?:\\.([\\w$]{1,40}))?\\}([\\w-]{0,80})';
const MAPPED_SLIDE = new RegExp(`\\{index:[\\w$]{1,10},video:\`${PART}\`,name:\`#${PART}\`,heroname:\`#${PART}\``);
const TREASURE_KEY = /treasure/i;

/**
 * The page's treasure sets in slider order, each named by the page's own texts. Without a slider the sets are taken
 * from texts that pair a hero with a set (`…treasure…_<x>` and `…treasure…_<x>_set`), in text order: then the order
 * is not the rarity and `orderKnown` is false.
 */
export function parseTreasure(
  chunk: string,
  texts: readonly EventPageText[]
): { sets: TreasureSet[]; orderKnown: boolean } {
  const textOf = new Map(texts.map((text) => [text.key, text.text]));
  const folder = SLIDE_FOLDER.exec(chunk)?.[1] ?? null;
  const image = (video: string) => (folder === null ? null : `${VIDEO_BASE}${folder}/${video}.png`);
  const slides: { video: string; name: string; hero: string }[] = [];
  const literal = [...chunk.matchAll(LITERAL_SLIDE)].sort((a, b) => Number(a[1]) - Number(b[1]));
  for (const match of literal) slides.push({ video: match[2] ?? '', name: match[3] ?? '', hero: match[4] ?? '' });
  const mapped = slides.length === 0 ? MAPPED_SLIDE.exec(chunk) : null;
  if (mapped !== null) {
    const [, videoHead = '', field, videoTail = '', nameHead = '', , nameTail = '', heroHead = '', , heroTail = ''] =
      mapped;
    // The values the map runs over: a field of an array of objects (`{heroname:"io"}`), else the slide's index.
    // Only values whose set text exists count, so another array with the same field adds nothing.
    const values =
      field === undefined
        ? Array.from({ length: MAX_TREASURE_SETS }, (_, index) => String(index))
        : [
            ...new Set(
              Array.from(chunk.matchAll(new RegExp(`\\{${escape(field)}:"(\\w{1,60})"`, 'g')), (m) => m[1] ?? '')
            )
          ];
    for (const value of values)
      slides.push({
        video: `${videoHead}${value}${videoTail}`,
        name: `${nameHead}${value}${nameTail}`,
        hero: `${heroHead}${value}${heroTail}`
      });
  }
  const sets = slides
    .filter((slide) => textOf.has(slide.name))
    .slice(0, MAX_TREASURE_SETS)
    .map((slide) => ({
      hero: textOf.get(slide.hero) ?? '',
      set: textOf.get(slide.name) ?? '',
      image: image(slide.video)
    }));
  if (sets.length > 0) return { sets, orderKnown: true };
  const paired = texts
    .filter((text) => TREASURE_KEY.test(text.key) && text.key.endsWith('_set'))
    .slice(0, MAX_TREASURE_SETS)
    .map((text) => ({ hero: textOf.get(text.key.slice(0, -'_set'.length)) ?? '', set: text.text, image: null }));
  return { sets: paired, orderKnown: false };
}

async function readText(fetchImpl: typeof fetch, url: string, maxBytes: number): Promise<string | null> {
  const response = await fetchImpl(url, {
    headers: { accept: 'text/html,application/javascript;q=0.9,*/*;q=0.5' },
    redirect: 'manual',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  const length = Number(response.headers.get('content-length') ?? '0');
  if (!response.ok || length > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  const text = await response.text();
  return text.length > maxBytes ? null : text;
}

/**
 * Reads an event page: 5 requests (the page, the bundle, the manifest, the page's code and its texts). Null when
 * any of them is missing or does not have the expected shape.
 */
export async function fetchEventPage(slug: string, fetchImpl: typeof fetch = fetch): Promise<EventPage | null> {
  if (!SLUG.test(slug) || NOT_EVENTS.has(slug)) return null;
  const url = `${SITE}/${slug}`;
  const html = await readText(fetchImpl, url, MAX_HTML_BYTES);
  const bundles = html === null ? null : bundleUrls(html);
  if (bundles === null) return null;
  const [main, manifest] = await Promise.all([
    readText(fetchImpl, bundles.main, MAX_MAIN_BYTES),
    readText(fetchImpl, bundles.manifest, MAX_MANIFEST_BYTES)
  ]);
  if (main === null || manifest === null) return null;
  let language: EventPage['language'] = 'russian';
  let ids = pageChunkIds(main, slug, language);
  if (ids.texts === null) {
    language = 'english';
    ids = pageChunkIds(main, slug, language);
  }
  if (ids.texts === null || ids.page === null) return null;
  const textsHash = chunkHash(manifest, ids.texts);
  const pageHash = chunkHash(manifest, ids.page);
  if (textsHash === null || pageHash === null) return null;
  const [textsChunk, pageChunk] = await Promise.all([
    readText(fetchImpl, chunkUrl(ids.texts, textsHash), MAX_CHUNK_BYTES),
    readText(fetchImpl, chunkUrl(ids.page, pageHash), MAX_CHUNK_BYTES)
  ]);
  if (textsChunk === null || pageChunk === null) return null;
  const { texts, truncated } = parseTextsChunk(textsChunk, ids.route);
  if (texts.length === 0) return null;
  const media = parseMediaPaths(pageChunk, [...new Set([slug, ids.route])]);
  const treasure = parseTreasure(pageChunk, texts);
  const gaps: EventPageGap[] = [];
  if (truncated) gaps.push('texts_truncated');
  const setImages = treasure.sets.filter((set) => set.image !== null).length;
  if (media.images.length + setImages === 0) gaps.push('no_media');
  if (treasure.sets.length > 0 && !treasure.orderKnown) gaps.push('treasure_order_unknown');
  if (treasure.sets.some((set) => set.image === null)) gaps.push('treasure_images_missing');
  return { slug, url, texts, language, ...media, treasure: treasure.sets, gaps };
}
