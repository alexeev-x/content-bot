import { Api, InlineKeyboard } from 'grammy';
import { POST_MEDIA_MAX_ITEMS } from '@alexeev/contracts';
import { generateCheckedDraft, planSeries, SOURCE_LINK_LABEL } from '../../modules/ai';
import {
  fetchEventPage,
  fetchSteamAnnouncement,
  fetchStorePrices,
  type EventPage,
  type EventPageGap,
  type EventPageText
} from '../../modules/dota';
import { getOwnerOperationsSettings } from '../../modules/settings';
import { createWriterDeps } from '../bot/writer-deps';
import type { Container } from '../container';

// An event with its own dota2.com page becomes a planned series of posts (owner, 21.10.2026: «в 1 пост не сделаешь…
// разбить красиво»). The `source_event` job plans it here (one model call) and queues one `series_post` job per post,
// each a writer call of its own (a Free-plan invocation has 50 subrequests and 50 queries). The studio shows the
// series in the event's side panel; the owner gets one notice when the last post is written.

const PLAN_TIMEOUT_MS = 120_000;
const WRITE_TIMEOUT_MS = 120_000;
const TASK_MAX = 4_000;
const TELEGRAM_TIMEOUT_SECONDS = 10;
const ANNOUNCEMENT_FOR_PLAN = 3_000;

const mediaName = (url: string) => url.replace(/^.*\/dota_react\/[^/]+\//, '');

const TREASURE_TEXT_KEY = 'treasure_by_rarity';
const STORE_PRICES_KEY = 'store_prices';
const GAP_TEXT: Record<EventPageGap, string> = {
  texts_truncated: 'тексты страницы обрезаны',
  no_media: 'не нашлось ни одной картинки',
  treasure_order_unknown: 'порядок сетов сокровищницы (редкость) не найден',
  treasure_images_missing: 'нет картинок сетов сокровищницы'
};

/**
 * The page's texts and media for the planner, with the treasure added: its sets by rarity as one text, so the post
 * names the top reward, and each set's image named by hero and set (owner, 22.10.2026: the treasure post shows the
 * rarest set).
 */
export function seriesMaterial(
  page: EventPage,
  /** Valve's prices of the page's own items (`fetchStorePrices`), by item id. */
  prices: ReadonlyMap<number, string> = new Map()
): {
  texts: EventPageText[];
  media: string[];
  mediaNames: string[];
  /** The rarest set's image when the rarity order is known: the treasure post opens with it. */
  topReward: string | null;
} {
  const media = [...page.images];
  const mediaNames = media.map(mediaName);
  const textOf = new Map(page.texts.map((text) => [text.key, text.text]));
  // Valve's own prices of what the page sells (an automaton persona): a fact for the post about it (owner, 22.10.2026).
  const priced = page.storeItems
    .map((item) => ({ name: textOf.get(item.nameKey), price: prices.get(item.itemId) }))
    .filter((item): item is { name: string; price: string } => item.name !== undefined && item.price !== undefined)
    .map((item) => `${item.name} — ${item.price}`);
  const baseTexts =
    priced.length === 0
      ? page.texts
      : [...page.texts, { key: STORE_PRICES_KEY, text: `Цены в магазине Dota 2 (Valve): ${priced.join('; ')}` }];
  const sets = page.treasure;
  if (sets.length === 0) return { texts: baseTexts, media, mediaNames, topReward: null };
  const ordered = !page.gaps.includes('treasure_order_unknown');
  const list = sets.map((set) => (set.hero === '' ? set.set : `${set.hero} — ${set.set}`)).join('; ');
  const text = ordered
    ? `Сеты сокровищницы по редкости, от обычного к самому редкому; последний — главная награда: ${list}`
    : `Сеты сокровищницы (редкость неизвестна): ${list}`;
  sets.forEach((set, index) => {
    if (set.image === null) return;
    const rarest = ordered && index === sets.length - 1 ? ' (самый редкий, главная награда)' : '';
    media.push(set.image);
    mediaNames.push(`сокровищница: ${set.hero === '' ? set.set : `${set.hero} — ${set.set}`}${rarest}`);
  });
  const topReward = ordered ? (sets.at(-1)?.image ?? null) : null;
  return { texts: [...baseTexts, { key: TREASURE_TEXT_KEY, text }], media, mediaNames, topReward };
}

/**
 * A post's images as planned; the treasure post (the one given the treasure text) opens with the top reward even when
 * the plan left it out or put it later (owner, 22.10.2026).
 */
export function postImages(
  planned: readonly string[],
  input: { treasurePost: boolean; topReward: string | null; max: number; pageImages?: readonly string[] }
): string[] {
  const shown = withBackground(planned, input.pageImages ?? []);
  if (!input.treasurePost || input.topReward === null) return shown.slice(0, input.max);
  return [input.topReward, ...shown.filter((url) => url !== input.topReward)].slice(0, input.max);
}

/**
 * A picture with its background rather than a cut-out on Telegram's white (owner, 22.10.2026): Valve's PNGs are often
 * transparent, its JPGs never. A PNG gives way to the one JPG of its own folder (an automaton's folder holds one
 * gameplay frame); with no JPG there, or several, the PNG stays (a treasure's sets have PNGs only).
 */
export function withBackground(planned: readonly string[], pageImages: readonly string[]): string[] {
  const folder = (url: string) => url.slice(0, url.lastIndexOf('/') + 1);
  const result: string[] = [];
  for (const url of planned) {
    const jpgs = /\.png$/i.test(url)
      ? pageImages.filter((image) => /\.jpe?g$/i.test(image) && folder(image) === folder(url))
      : [];
    const chosen = jpgs.length === 1 && jpgs[0] !== undefined ? jpgs[0] : url;
    if (!result.includes(chosen)) result.push(chosen);
  }
  return result;
}

/**
 * The writer's task for one post: its topic and brief, the link, and only its own facts (Valve's texts). Each post
 * reads on its own: that the posts belong together is ours to know, never the reader's (owner, 22.10.2026: no
 * «продолжение во 2 части»), so the task never says «серия», a post number or what comes next.
 */
export function seriesPostTask(input: {
  title: string;
  pageUrl: string;
  position: number;
  total: number;
  topic: string;
  brief: string;
  facts: readonly string[];
}): string {
  const head = [
    `Повод: событие Dota 2 «${input.title}». Тема поста — ${input.topic}.`,
    `${SOURCE_LINK_LABEL}${input.pageUrl}`,
    `Что рассказать: ${input.brief}`,
    'Пиши живо, не сухую сводку: возьми самое интересное из фактов, не перечисляй всё. Шутка — не обязательно.',
    input.position > 1
      ? 'Пиши только эту тему: о событии в целом не пересказывай, хватит его названия.'
      : 'Что вышло и самое цепляющее для игрока.',
    'Пост самостоятельный: о других постах ни слова.',
    'Факты (официальные тексты Valve; бери только отсюда):'
  ].join('\n');
  const facts = input.facts.join('\n').replaceAll('>>>', '> > >').replaceAll('<<<', '< < <');
  return `${head}\n<<<${facts.slice(0, TASK_MAX - head.length - 8)}>>>`;
}

/**
 * Plans the event's series when its announcement links an event page that can be read. False when there is none,
 * the page cannot be read or the plan failed: the caller then writes the one post from the announcement.
 */
export async function planEventSeries(
  container: Container,
  job: { id: string; externalId: string; chatId: number; appOrigin: string; automatic?: boolean },
  token: string,
  requestId: string,
  onError: (error: unknown) => void
): Promise<boolean> {
  const source = await container.dotaRepository.findSteamAnnouncement(job.externalId);
  if (source === null) return false;
  const announcement = await fetchSteamAnnouncement({ externalId: job.externalId, publishedAt: source.publishedAt });
  if (announcement === null || announcement.pages.length === 0) return false;
  let page: EventPage | null = null;
  for (const slug of announcement.pages) {
    page = await fetchEventPage(slug).catch((error: unknown) => {
      onError(error);
      return null;
    });
    if (page !== null) break;
  }
  if (page === null) return false;
  if (page.gaps.length > 0) {
    container.logger.warn({
      component: 'sources',
      operation: 'event_page',
      requestId,
      status: 'partial',
      errorCode: page.gaps.join(',')
    });
    // Nothing is lost silently (owner, 22.10.2026): the series is still planned from what was read.
    if (token !== '')
      await new Api(token, { timeoutSeconds: TELEGRAM_TIMEOUT_SECONDS })
        .sendMessage(
          job.chatId,
          `Страница ${page.url} прочитана не полностью: ${page.gaps.map((gap) => GAP_TEXT[gap]).join('; ')}. ` +
            'Серию пишу из того, что прочитал, — проверьте посты.'
        )
        .catch(onError);
  }

  const prices = await fetchStorePrices(page.storeItems.map((item) => item.itemId));
  const { texts, media, mediaNames, topReward } = seriesMaterial(page, prices);
  const deps = await createWriterDeps(container, requestId);
  const plan = await planSeries(deps, {
    title: source.title,
    announcement: (announcement.text ?? '').slice(0, ANNOUNCEMENT_FOR_PLAN),
    texts,
    media: mediaNames,
    signal: AbortSignal.timeout(PLAN_TIMEOUT_MS)
  });
  if (plan.posts === null) {
    container.logger.warn({
      component: 'sources',
      operation: 'series_plan',
      requestId,
      status: 'failed',
      errorCode: plan.errorCode ?? 'unknown'
    });
    return false;
  }

  const textOf = new Map(texts.map((text) => [text.key, text.text]));
  const posts = plan.posts.map((post, index) => ({
    id: container.newId(),
    position: index + 1,
    topic: post.topic,
    task: seriesPostTask({
      title: source.title,
      pageUrl: page.url,
      position: index + 1,
      total: plan.posts?.length ?? 1,
      topic: post.topic,
      brief: post.brief,
      facts: post.texts.map((key) => textOf.get(key) ?? '').filter((text) => text !== '')
    }),
    media: postImages(
      post.media.map((number) => media[number]).filter((url): url is string => url !== undefined),
      {
        treasurePost: post.texts.includes(TREASURE_TEXT_KEY),
        topReward,
        max: POST_MEDIA_MAX_ITEMS,
        pageImages: page.images
      }
    )
  }));
  await container.sourceSeries.create({
    id: job.id,
    externalId: job.externalId,
    title: source.title,
    pageUrl: page.url,
    now: container.clock.now(),
    automatic: job.automatic === true,
    posts
  });
  // From here the series exists: it never falls back to the one post (a second paid draft). A post whose job the
  // queue refused is marked failed, so nothing waits for it.
  for (const post of posts) {
    try {
      await container.aiJobs.send({
        id: container.newId(),
        kind: 'series_post',
        chatId: job.chatId,
        appOrigin: job.appOrigin,
        seriesPostId: post.id
      });
    } catch (error) {
      onError(error);
      await container.sourceSeries.finishPost({ id: post.id, status: 'failed', generationId: null }).catch(onError);
    }
  }
  return true;
}

async function autopublishEnabled(container: Container, requestId: string): Promise<boolean> {
  return getOwnerOperationsSettings({ repo: container.settings, logger: container.logger, requestId })
    .then((settings) => settings.autopublish.enabled)
    .catch(() => false);
}

/** Writes one planned post; the last one of its series tells the owner. Never throws: a failure marks the post. */
export async function writeSeriesPost(
  container: Container,
  job: { id: string; chatId: number; appOrigin: string; seriesPostId: string },
  token: string,
  requestId: string,
  onError: (error: unknown) => void
): Promise<void> {
  const post = await container.sourceSeries.findPost(job.seriesPostId).catch((error: unknown) => {
    onError(error);
    return null;
  });
  if (post === null || post.status !== 'writing') return;
  try {
    const deps = await createWriterDeps(container, requestId);
    const result = await generateCheckedDraft(deps, {
      format: 'telegram',
      mode: 'automatic',
      source: 'bot',
      task: post.task,
      signal: AbortSignal.timeout(WRITE_TIMEOUT_MS)
    });
    await container.sourceSeries.finishPost({
      id: post.id,
      status: result.text === null ? 'failed' : 'ready',
      // The first version of the chain: a fix by the fact check is its child.
      generationId: result.generation.parentGenerationId ?? result.generation.id,
      factCheck: result.factCheck ?? null
    });
  } catch (error) {
    onError(error);
    await container.sourceSeries.finishPost({ id: post.id, status: 'failed', generationId: null }).catch(onError);
  }
  const notice = await container.sourceSeries
    .claimNotice(post.seriesId, container.clock.now())
    .catch((error: unknown) => {
      onError(error);
      return null;
    });
  if (notice === null) return;
  // Cron's series, every post written and its facts clean: published without the owner, one post per queue message
  // (owner, 22.10.2026); anything that stops it on the way tells the owner then.
  if (notice.automatic && notice.ready === notice.total && notice.clean === notice.total) {
    try {
      await container.aiJobs.send({
        id: container.newId(),
        kind: 'series_publish',
        chatId: job.chatId,
        appOrigin: job.appOrigin,
        seriesId: post.seriesId,
        position: 1
      });
      return;
    } catch (error) {
      onError(error);
    }
  }
  if (token === '') return;
  const text =
    notice.ready === notice.total
      ? `Серия постов «${notice.title}» готова: ${notice.total}. Посмотрите и одобрите в студии.`
      : `Серия постов «${notice.title}»: готово ${notice.ready} из ${notice.total}. Остальные не написались — повторите в студии.`;
  const url = `${job.appOrigin}/sources?open=${encodeURIComponent(`steam_news:${post.externalId}`)}`;
  await new Api(token, { timeoutSeconds: TELEGRAM_TIMEOUT_SECONDS })
    .sendMessage(job.chatId, text, {
      reply_markup: new InlineKeyboard().webApp('Открыть в студии', url),
      // With the automatic publishing on, Cron's series never wakes the owner at night (owner, 22.10.2026).
      disable_notification: notice.automatic && (await autopublishEnabled(container, requestId))
    })
    .catch(onError);
}
