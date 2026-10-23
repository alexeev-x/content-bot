import {
  devRunCandidatesSchema,
  type DevRunKind,
  startDevRunInputSchema,
  startDevRunResponseSchema
} from '@alexeev/contracts';
import { Hono, type Context } from 'hono';
import {
  factKind,
  findLiquipediaPages,
  isHotfixTitle,
  isTreasurePage,
  LIQUIPEDIA_SPACING_MS,
  liquipediaSetIcons,
  patchVersionOf,
  readLiquipediaPage,
  type TreasureWatch
} from '../modules/dota';
import { AppError } from '../shared/app-error';
import { appOriginOf } from './bot/app-origin';
import { createDevRunsStore, type DevRunEventRow } from './dev-runs-store';
import type { AppBindings } from './env';
import { rateLimit } from './rate-limit';
import { validated } from './validation';
import { factTexts, followUpTask } from './workflows/treasure-watch';
import { requestSourceEventDraft } from './workflows/source-event-ai-draft';

// DEV only, removed after the check before the release (owner, 23.10.2026: «последний хотфикс, последний патч — я
// нажимаю, и всё идёт»). Each press runs the newest announcement of its kind the whole automatic way again — the
// writer, the pictures, the publishing to the test channel — so the owner sees what each kind of post becomes. Every
// press is paid AI work: the owner presses, never an agent.

const RUNS_LIMIT = 10;
const RUNS_WINDOW_MS = 10 * 60 * 1000;
const SET_ICONS_MAX = 10;
const KINDS: readonly DevRunKind[] = ['patch', 'hotfix', 'news', 'event', 'treasure', 'treasure_follow_up'];

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The newest announcement each kind would run: the same tests the writer's way uses to tell them apart. */
function candidateOf(kind: DevRunKind, events: readonly DevRunEventRow[]): DevRunEventRow | null {
  const patch = (event: DevRunEventRow) => patchVersionOf(event.title) !== null;
  const hotfix = (event: DevRunEventRow) => isHotfixTitle(event.title);
  const treasure = (event: DevRunEventRow) => event.eventType === 'treasure';
  const test: Record<DevRunKind, (event: DevRunEventRow) => boolean> = {
    patch,
    hotfix,
    // An event with its own dota2.com page became a series before; the rest is one news post.
    event: (event) => event.hadSeries && !patch(event) && !hotfix(event) && !treasure(event),
    news: (event) => !event.hadSeries && !patch(event) && !hotfix(event) && !treasure(event),
    treasure,
    treasure_follow_up: treasure
  };
  return events.find(test[kind]) ?? null;
}

function guard(c: Context<AppBindings>): void {
  if (c.env.AUTOPUBLISH_TEST !== 'true')
    throw new AppError('FORBIDDEN', 'Dev runs are off here', { reason: 'DEV_RUNS_OFF' });
  if (c.env.DB === undefined) throw new AppError('UNAVAILABLE', 'Database is not configured');
}

export const devRunsRoutes = new Hono<AppBindings>()
  .get('/', async (c) => {
    guard(c);
    const events = await createDevRunsStore(c.env.DB as D1Database).latestEvents();
    return c.json(
      devRunCandidatesSchema.parse({
        items: KINDS.map((kind) => {
          const event = candidateOf(kind, events);
          return {
            kind,
            externalId: event?.externalId ?? null,
            title: event?.title.slice(0, 500) ?? null,
            publishedAt: event === null ? null : new Date(event.publishedAt).toISOString()
          };
        })
      })
    );
  })
  .post(
    '/',
    rateLimit({ name: 'dev-runs', limit: RUNS_LIMIT, windowMs: RUNS_WINDOW_MS }),
    validated('json', startDevRunInputSchema),
    async (c) => {
      guard(c);
      const container = c.get('container');
      const store = createDevRunsStore(c.env.DB as D1Database);
      const { kind } = c.req.valid('json');
      const event = candidateOf(kind, await store.latestEvents());
      if (event === null) throw new AppError('NOT_FOUND', 'No announcement of this kind', { reason: 'NO_EVENT' });
      const chatId = Number(container.ownerChatId);
      if (container.ownerChatId === null || !Number.isSafeInteger(chatId))
        throw new AppError('UNAVAILABLE', 'The owner chat is not configured', { reason: 'NO_OWNER_CHAT' });
      const found = await container.sourceEvents.find({ sourceKey: 'steam_news', externalId: event.externalId });
      if (found?.aiWriting === true)
        throw new AppError('CONFLICT', 'The AI is writing it already', { reason: 'AI_WRITING' });
      const appOrigin = appOriginOf(c.req.url);
      if (kind === 'treasure_follow_up') {
        // Liquipedia down or slow is a 503 the page can name, not an internal error.
        await queueFollowUp(c, event, chatId, appOrigin).catch((error: unknown) => {
          if (error instanceof AppError) throw error;
          throw new AppError('UNAVAILABLE', 'Liquipedia did not answer', { reason: 'LIQUIPEDIA_UNAVAILABLE' });
        });
      } else {
        // The old run's publication key goes first: the new post then goes out instead of replaying the old one.
        await store.forgetPublication(event.externalId);
        const queued = await requestSourceEventDraft(
          {
            repo: container.dotaRepository,
            enqueue: (job) => container.aiJobs.send(job),
            newId: container.newId,
            now: () => container.clock.now()
          },
          { externalId: event.externalId, chatId, appOrigin, replay: true, automatic: true }
        );
        if (!queued) throw new AppError('CONFLICT', 'The AI is writing it already', { reason: 'AI_WRITING' });
      }
      return c.json(
        startDevRunResponseSchema.parse({ kind, externalId: event.externalId, title: event.title.slice(0, 500) }),
        202
      );
    }
  );

/**
 * The treasure's follow-up as the watch would queue it on its first post: every fact its Liquipedia page has now, the
 * sets' icons for the slider. The watch's own state is left alone.
 */
async function queueFollowUp(
  c: Context<AppBindings>,
  event: DevRunEventRow,
  chatId: number,
  appOrigin: string
): Promise<void> {
  const container = c.get('container');
  let page: { title: string; text: string } | null = null;
  // Liquipedia asks for 2 s between requests; the watch's own run may have just talked to it.
  await pause(LIQUIPEDIA_SPACING_MS);
  for (const title of await findLiquipediaPages(event.title)) {
    await pause(LIQUIPEDIA_SPACING_MS);
    const read = await readLiquipediaPage(title, true);
    if (read?.text != null && isTreasurePage(read.text)) {
      page = { title, text: read.text };
      break;
    }
  }
  if (page === null)
    throw new AppError('CONFLICT', 'Liquipedia has no page of this treasure yet', { reason: 'NO_TREASURE_PAGE' });
  const pending = await factTexts(page.text);
  const now = container.clock.now();
  const watch: TreasureWatch = {
    externalId: event.externalId,
    title: event.title,
    startedAt: now,
    endsAt: now,
    pageTitle: page.title,
    lastRevision: null,
    lastChangeAt: null,
    checkedAt: null,
    published: {},
    pending,
    posts: 0,
    hasSeries: false,
    hidden: false,
    mainTold: true
  };
  const setNames = Object.keys(pending)
    .filter((key) => factKind(key) === 'sets')
    .map((key) => key.slice('sets:'.length))
    .reverse();
  await pause(LIQUIPEDIA_SPACING_MS);
  const urls =
    setNames.length === 0
      ? []
      : await liquipediaSetIcons(setNames)
          .then((icons) => icons.slice(0, SET_ICONS_MAX))
          .catch(() => []);
  await createDevRunsStore(c.env.DB as D1Database).forgetPublication(event.externalId);
  await container.aiJobs.send({
    id: container.newId(),
    kind: 'treasure_post',
    chatId,
    appOrigin,
    externalId: event.externalId,
    number: 1,
    task: followUpTask(watch),
    ...(urls.length === 0 ? {} : { urls })
  });
}
