import {
  factKind,
  fetchStorePrices,
  findLiquipediaPages,
  isTreasurePage,
  LIQUIPEDIA_PAGE,
  LIQUIPEDIA_SPACING_MS,
  liquipediaSetIcons,
  parseTreasureWikitext,
  readLiquipediaPage,
  type TreasureFactKind,
  type TreasureFactTexts,
  type TreasureWatch
} from '../../modules/dota';
import { SOURCE_LINK_LABEL } from '../../modules/ai';
import { SOURCE_POST_STRUCTURE } from '../bot/rich-post';
import type { AiJob } from '../bot/ai-job';
import type { Container } from '../container';

// Follows a treasure announced without its own page on Liquipedia (owner, 22.10.2026; migration 0101): every 5 minutes
// one light request asks whether its page changed; on a change the page is read, its sets, opening bonuses and drop
// rates are compared one by one with what already went out, and its price comes from Valve by the item id the page
// names. The new facts wait until the page has been quiet for 30 minutes (Liquipedia fills a page in many small
// edits), then become one follow-up post: the sets alone are enough for one, the rest wait to go together. The watch
// ends 6 hours after the announcement; what is left then goes out once. At most two follow-ups per event, never a fact
// twice, and none before the event's own post went out (it says the treasure was already told).

const QUIET_MS = 30 * 60 * 1000;
const PER_RUN = 2;
const MAX_FOLLOW_UPS = 2;
/** The writer keeps 4000 characters of a task (modules/ai/writer.ts). */
const FOLLOW_UP_TASK_MAX = 4000;
/** A post holds at most ten pictures (contracts POST_MEDIA_MAX_ITEMS): the ten rarest sets. */
const SET_ICONS_MAX = 10;
/** A run talks to Liquipedia only when no other did for this long: two runs never request at the same time. */
const RUN_GAP_MS = 3 * 60 * 1000;
const LABEL: Record<TreasureFactKind, string> = {
  sets: 'Наборы по редкости (по данным Liquipedia)',
  bonuses: 'Награды за количество открытий (по данным Liquipedia)',
  drop_rates: 'Шансы выпадения (по данным Liquipedia)',
  price: 'Цена в магазине Dota 2 (по данным Valve)'
};
const KINDS = Object.keys(LABEL) as TreasureFactKind[];

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The facts of the page by key (`sets:<name>`, `bonuses:<condition>`, `drop_rates:`, `price:`), as they would be told. */
export async function factTexts(text: string, fetchImpl: typeof fetch = fetch): Promise<TreasureFactTexts> {
  const facts = parseTreasureWikitext(text);
  const out: TreasureFactTexts = {};
  for (const group of facts.sets)
    for (const name of group.names) out[`sets:${name.slice(0, 200)}`] = `${group.rarity}: ${name}`;
  for (const bonus of facts.bonuses)
    out[`bonuses:${bonus.condition.slice(0, 200)}`] = `${bonus.condition} ${bonus.items.join(', ')}`;
  if (facts.dropRates !== null) out['drop_rates:'] = facts.dropRates;
  if (facts.defindex !== null) {
    const price = (await fetchStorePrices([facts.defindex], fetchImpl)).get(facts.defindex);
    if (price !== undefined) out['price:'] = price;
  }
  return out;
}

const pendingKinds = (watch: TreasureWatch) => new Set(Object.keys(watch.pending).map((key) => factKind(key)));

/** What goes out now: on quiet or at the window's end, the sets or at least two kinds; at the end, anything left. */
export function readyToTell(watch: TreasureWatch, now: number): boolean {
  const kinds = pendingKinds(watch);
  if (kinds.size === 0 || watch.posts >= MAX_FOLLOW_UPS || !watch.mainTold) return false;
  if (now >= watch.endsAt) return true;
  const quiet = watch.lastChangeAt !== null && now - watch.lastChangeAt >= QUIET_MS;
  return quiet && (kinds.has('sets') || kinds.size >= 2);
}

/** The writer's task of a follow-up post: only the new facts, the page linked (CC-BY-SA asks to name Liquipedia). */
export function followUpTask(watch: TreasureWatch): string {
  const link =
    watch.pageTitle === null ? '' : `${LIQUIPEDIA_PAGE}${encodeURIComponent(watch.pageTitle.replaceAll(' ', '_'))}`;
  const entries = Object.entries(watch.pending);
  const facts = KINDS.map((kind) => [kind, entries.filter(([key]) => factKind(key) === kind)] as const)
    .filter(([, items]) => items.length > 0)
    .map(([kind, items]) => `${LABEL[kind]}:\n${items.map(([, text]) => text).join('\n')}`)
    .join('\n\n')
    .replaceAll('>>>', '> > >')
    .replaceAll('<<<', '< < <');
  const head = [
    `Повод: новые подробности о сокровищнице Dota 2 «${watch.pageTitle ?? watch.title}»; о самой сокровищнице уже рассказано.`,
    ...(link === '' ? [] : [`${SOURCE_LINK_LABEL}${link}`]),
    // No source named in the post (owner, 23.10.2026); sets, drop rates and prices fit the structure's tables.
    'Расскажи только эти новые подробности: все сеты, шансы и бонусы, что есть в фактах, — таблицами, если их несколько.',
    'Пост самостоятельный: о других постах ни слова.',
    SOURCE_POST_STRUCTURE,
    'Факты (бери только отсюда):'
  ].join('\n');
  // The facts get what the writer's 4000-character task leaves them, whole lines only, so the fence always closes
  // (review 24.10.2026: a long list ran past the queue job's and the writer's bounds and was cut mid-fact).
  const room = FOLLOW_UP_TASK_MAX - head.length - '\n<<<>>>'.length;
  let told = '';
  for (const line of facts.split('\n')) {
    const next = told === '' ? line : `${told}\n${line}`;
    if (next.length > room) break;
    told = next;
  }
  return `${head}\n<<<${told}>>>`;
}

/** One run of the watch; never throws (a failure is logged and the next run tries again). */
export async function runTreasureWatch(
  container: Container,
  job: Extract<AiJob, { kind: 'treasure_watch' }>,
  requestId: string,
  onError: (error: unknown) => void,
  fetchImpl: typeof fetch = fetch,
  /** Liquipedia asks for 2 s between requests; tests pass 0. */
  spacingMs: number = LIQUIPEDIA_SPACING_MS
): Promise<void> {
  if (!(await container.aiWriter.claimJob(job.id, container.clock.now()).catch(() => false))) return;
  try {
    await container.treasureWatches.startRecent(container.clock.now());
    const watches = await container.treasureWatches.active(PER_RUN);
    for (const [index, watch] of watches.entries()) {
      try {
        if (index > 0) await pause(spacingMs);
        const now = container.clock.now();
        // The first claim also checks no other run is talking to Liquipedia; a refused one ends this run.
        if (!(await container.treasureWatches.claim(watch, now, index === 0 ? now - RUN_GAP_MS : null))) {
          if (index === 0) break;
          continue;
        }
        await step(container, job, watch, now, requestId, fetchImpl, spacingMs);
      } catch (error) {
        onError(error);
      }
    }
  } catch (error) {
    onError(error);
  } finally {
    await container.aiWriter.finishJob(job.id, container.clock.now()).catch(onError);
  }
}

/** Finds the treasure's page among the pages the title names: the first that is a treasure's, with its text. */
async function findPage(
  watch: TreasureWatch,
  fetchImpl: typeof fetch,
  spacingMs: number
): Promise<{ title: string; revision: number; text: string } | null> {
  for (const title of await findLiquipediaPages(watch.title, fetchImpl)) {
    await pause(spacingMs);
    const page = await readLiquipediaPage(title, true, fetchImpl);
    if (page?.text != null && isTreasurePage(page.text)) return { title, revision: page.revision, text: page.text };
  }
  return null;
}

async function step(
  container: Container,
  job: Extract<AiJob, { kind: 'treasure_watch' }>,
  watch: TreasureWatch,
  claimedAt: number,
  requestId: string,
  fetchImpl: typeof fetch,
  spacingMs: number
): Promise<void> {
  const now = claimedAt;
  // Its own page's series tells the treasure, a hidden event is not told; nothing is fetched past the window.
  if (watch.hasSeries || watch.hidden) {
    await container.treasureWatches.save(watch, claimedAt, true);
    return;
  }
  if (now < watch.endsAt) {
    let page: { revision: number; text: string } | null = null;
    if (watch.pageTitle === null) {
      const found = await findPage(watch, fetchImpl, spacingMs);
      if (found !== null) {
        watch.pageTitle = found.title;
        page = found;
      }
    } else {
      const head = await readLiquipediaPage(watch.pageTitle, false, fetchImpl);
      if (head === null) {
        watch.pageTitle = null;
      } else if (head.revision !== watch.lastRevision) {
        await pause(spacingMs);
        const read = await readLiquipediaPage(watch.pageTitle, true, fetchImpl);
        if (read?.text != null && isTreasurePage(read.text)) page = { revision: read.revision, text: read.text };
        // Not a treasure's page after all (a name shared with something else): look again next time.
        else if (read !== null) watch.pageTitle = null;
      }
    }
    if (page !== null && page.revision !== watch.lastRevision) {
      // Fact by fact: a key once told never goes again, even with another text (a corrected rate, a new price). What
      // waits is rebuilt from the page as it is now, so a name corrected or removed meanwhile is never told.
      watch.pending = Object.fromEntries(
        Object.entries(await factTexts(page.text, fetchImpl)).filter(([key]) => !(key in watch.published))
      );
      watch.lastRevision = page.revision;
      watch.lastChangeAt = now;
    }
  }
  const tell = readyToTell(watch, now);
  const task = tell ? followUpTask(watch) : '';
  const number = watch.posts + 1;
  // The told sets' icons, the rarest first (the page lists them from common to rarest), for the post's slider; a
  // failed request only leaves the post without them.
  const setNames = tell
    ? Object.keys(watch.pending)
        .filter((key) => factKind(key) === 'sets')
        .map((key) => key.slice('sets:'.length))
        .reverse()
    : [];
  let urls: string[] = [];
  if (setNames.length > 0) {
    await pause(spacingMs);
    urls = await liquipediaSetIcons(setNames, fetchImpl)
      .then((found) => found.slice(0, SET_ICONS_MAX))
      .catch(() => []);
  }
  const told = tell ? watch.pending : {};
  if (tell) {
    // Told once: what goes out is never told again, whatever the post's fate.
    watch.published = { ...watch.published, ...watch.pending };
    watch.pending = {};
    watch.posts += 1;
  }
  const done = now >= watch.endsAt || watch.posts >= MAX_FOLLOW_UPS;
  // Saved before the post is queued, as of this run's claim: a run that lost the watch queues nothing. A watch that ends
  // with this post is closed only once the post is queued, so a failed send can still give its facts back.
  const saved = await container.treasureWatches.save(watch, claimedAt, done && !tell);
  container.logger.info({
    component: 'treasure_watch',
    operation: 'step',
    requestId,
    status: !saved ? 'lost' : tell ? 'follow_up' : done ? 'done' : 'watching'
  });
  if (!saved || !tell) return;
  try {
    await container.aiJobs.send({
      id: container.newId(),
      kind: 'treasure_post',
      chatId: job.chatId,
      appOrigin: (await container.systemState.readAppOrigin()) ?? '',
      externalId: watch.externalId,
      number,
      task,
      ...(urls.length === 0 ? {} : { urls })
    });
  } catch (error) {
    // The post never left: its facts wait again for the next run (review 24.10.2026: they were lost for good).
    watch.pending = { ...told, ...watch.pending };
    watch.published = Object.fromEntries(Object.entries(watch.published).filter(([key]) => !(key in told)));
    watch.posts -= 1;
    if (!(await container.treasureWatches.save(watch, claimedAt, false)))
      container.logger.warn({ component: 'treasure_watch', operation: 'restore', requestId, status: 'lost' });
    throw error;
  }
  // Outside the send's guard: the post is queued, so its facts must never go back.
  if (done) await container.treasureWatches.save(watch, claimedAt, true);
}
