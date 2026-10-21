// An event's own page on dota2.com (e.g. /darkcarnival): Valve's texts for it (the Russian translation among them)
// and its media, for a series of posts (owner, 21.10.2026). The page is a React app: its texts are a localization
// chunk and its media are paths in the page's code chunk, both found through the app's main bundle and chunk
// manifest. Minified names change with every build, so only stable shapes are matched; when one is not found the
// page counts as absent and the event is written from its announcement alone.

const SITE = 'https://www.dota2.com';
const IMAGE_BASE = 'https://cdn.steamstatic.com/apps/dota2/images/dota_react/';
const VIDEO_BASE = 'https://cdn.steamstatic.com/apps/dota2/videos/dota_react/';
const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 512 * 1024;
const MAX_MAIN_BYTES = 8 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 512 * 1024;
const MAX_CHUNK_BYTES = 2 * 1024 * 1024;
const MAX_TEXTS = 120;
const MAX_TEXT_LENGTH = 1_500;
const MAX_MEDIA = 80;
// Page decoration (folders, and files named as a header or background: DEV 21.10.2026 picked the header's looping
// video), and what Telegram cannot show as a post's media (webm): never offered for a post.
const DECORATION = /(?:^|\/)(?:header|backgrounds?|logos?)\/|(?:header|background)[^/]*$|_icon\.\w+$|\.webm$/i;
const MEDIA_EXTENSION = /\.(?:png|jpe?g|webp|gif|mp4|webm)$/i;
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

export interface EventPage {
  slug: string;
  url: string;
  /** Valve's own texts of the page, Russian when Valve translated it, in the page's order. */
  texts: EventPageText[];
  language: 'russian' | 'english';
  images: string[];
  videos: string[];
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

/** Chunk ids of the page's code and of its texts in one language, from the main bundle. */
export function pageChunkIds(
  main: string,
  slug: string,
  language: string
): { page: number | null; texts: number | null } {
  const texts = new RegExp(`"\\./${escape(slug)}_${escape(language)}\\.json":\\[(\\d{1,7})`).exec(main);
  const component = new RegExp(`path:${IDENT}\\.${IDENT}\\.${escape(slug)}\\(\\),component:(${IDENT})`).exec(main);
  let page: number | null = null;
  if (component?.[1]) {
    const lazy = new RegExp(
      `[,;\\s]${escape(component[1])}=${IDENT}\\.lazy\\(\\(\\)=>${IDENT}\\.e\\((\\d{1,7})\\)`
    ).exec(main);
    page = lazy?.[1] ? Number(lazy[1]) : null;
  }
  return { page, texts: texts?.[1] ? Number(texts[1]) : null };
}

/** The content hash of a code chunk: the manifest's first map is the scripts'. */
export function chunkHash(manifest: string, id: number): string | null {
  return new RegExp(`[{,]${id}:"([0-9a-f]{20})"`).exec(manifest)?.[1] ?? null;
}

export const chunkUrl = (id: number, hash: string) =>
  `${SITE}/public/javascript/dota_react/${id}.js?contenthash=${hash}`;

// A JavaScript single-quoted string body, as webpack emits a JSON module: `JSON.parse('…')`. Decoded by hand: the
// chunk is data from another site and is never evaluated.
export function decodeJsString(body: string): string {
  return body.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|u\{[0-9a-fA-F]{1,6}\}|[\s\S])/g, (_, escaped: string) => {
    if (escaped.startsWith('x') && escaped.length === 3) return String.fromCharCode(parseInt(escaped.slice(1), 16));
    if (escaped.startsWith('u{')) return String.fromCodePoint(parseInt(escaped.slice(2, -1), 16));
    if (escaped.startsWith('u') && escaped.length === 5) return String.fromCharCode(parseInt(escaped.slice(1), 16));
    const simple: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0' };
    return simple[escaped] ?? escaped;
  });
}

/** The page's texts from its localization chunk: markup dropped, the comic's captions and the language tag left out. */
export function parseTextsChunk(chunk: string, slug: string): EventPageText[] {
  const body = /JSON\.parse\('((?:[^'\\]|\\[\s\S])*)'\)/.exec(chunk)?.[1];
  if (body === undefined) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeJsString(body));
  } catch {
    return [];
  }
  if (parsed === null || typeof parsed !== 'object') return [];
  const texts: EventPageText[] = [];
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== 'string' || key === 'language' || key.startsWith(`${slug}comic`)) continue;
    const text = value
      .replace(/\[\/?[a-z]{1,10}\]/gi, '')
      .replace(/<[^>]{1,200}>/g, ' ')
      .replace(/%\d\$s/g, '…')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_TEXT_LENGTH);
    if (text !== '') texts.push({ key, text });
    if (texts.length >= MAX_TEXTS) break;
  }
  return texts;
}

/**
 * The page's media from its code chunk: paths under the page's folder, and the bare names of a folder the code fills
 * in (`${slug}/automatons/${…}`) when there is exactly one such folder. Videos live under Valve's video base.
 */
export function parseMediaPaths(chunk: string, slug: string): { images: string[]; videos: string[] } {
  const full = new Set<string>();
  const bare = new Set<string>();
  for (const match of chunk.matchAll(/["`]([\w./-]{1,160})["`]/g)) {
    const path = match[1] ?? '';
    if (!MEDIA_EXTENSION.test(path) || DECORATION.test(path) || path.includes('..') || path.startsWith('/')) continue;
    (path.startsWith(`${slug}/`) ? full : bare).add(path);
  }
  const folders = new Set(
    Array.from(chunk.matchAll(new RegExp(`\`(${escape(slug)}/[\\w/-]{1,60}/)\\$\\{`, 'g')), (match) => match[1] ?? '')
  );
  const filled = folders.size === 1 ? Array.from(bare, (path) => `${[...folders][0]}${path}`) : [];
  const all = [...full, ...filled].slice(0, MAX_MEDIA);
  const isVideo = (path: string) => /\.(?:mp4|webm)$/i.test(path);
  return {
    images: all.filter((path) => !isVideo(path)).map((path) => `${IMAGE_BASE}${path}`),
    videos: all.filter(isVideo).map((path) => `${VIDEO_BASE}${path}`)
  };
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
  const texts = parseTextsChunk(textsChunk, slug);
  if (texts.length === 0) return null;
  return { slug, url, texts, language, ...parseMediaPaths(pageChunk, slug) };
}
