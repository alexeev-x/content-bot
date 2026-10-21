import { Api, InlineKeyboard } from 'grammy';
import { generateDraft, planSeries, SOURCE_LINK_LABEL } from '../../modules/ai';
import { fetchEventPage, fetchSteamAnnouncement, type EventPage } from '../../modules/dota';
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

const mediaName = (url: string) =>
  `${/\.(?:mp4|webm)$/i.test(url) ? 'видео: ' : ''}${url.replace(/^.*\/dota_react\/[^/]+\//, '')}`;

/** The writer's task for one post: its topic and brief, the link, and only its own facts (Valve's texts). */
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
    `Повод: серия постов о событии Dota 2 «${input.title}», пост ${input.position} из ${input.total} — ${input.topic}.`,
    `${SOURCE_LINK_LABEL}${input.pageUrl}`,
    `Что рассказать: ${input.brief}`,
    'Пиши весело и живо, не сухую сводку: возьми самое интересное из фактов, не перечисляй всё.',
    input.position > 1
      ? 'Это не первый пост серии: о событии в целом уже рассказано, пиши только эту тему.'
      : 'Это первый пост серии: что вышло и самое цепляющее, подробности будут в следующих постах.',
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
  job: { id: string; externalId: string; chatId: number; appOrigin: string },
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

  const media = [...page.images, ...page.videos];
  const deps = await createWriterDeps(container, requestId);
  const plan = await planSeries(deps, {
    title: source.title,
    announcement: (announcement.text ?? '').slice(0, ANNOUNCEMENT_FOR_PLAN),
    texts: page.texts,
    media: media.map(mediaName),
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

  const textOf = new Map(page.texts.map((text) => [text.key, text.text]));
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
    media: post.media.map((index) => media[index]).filter((url): url is string => url !== undefined)
  }));
  await container.sourceSeries.create({
    id: job.id,
    externalId: job.externalId,
    title: source.title,
    pageUrl: page.url,
    now: container.clock.now(),
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
    const result = await generateDraft(deps, {
      format: 'telegram',
      mode: 'automatic',
      source: 'bot',
      task: post.task,
      signal: AbortSignal.timeout(WRITE_TIMEOUT_MS)
    });
    await container.sourceSeries.finishPost({
      id: post.id,
      status: result.text === null ? 'failed' : 'ready',
      generationId: result.generation.id
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
  if (notice === null || token === '') return;
  const text =
    notice.ready === notice.total
      ? `Серия постов «${notice.title}» готова: ${notice.total}. Посмотрите и одобрите в студии.`
      : `Серия постов «${notice.title}»: готово ${notice.ready} из ${notice.total}. Остальные не написались — повторите в студии.`;
  const url = `${job.appOrigin}/sources?open=${encodeURIComponent(`steam_news:${post.externalId}`)}`;
  await new Api(token, { timeoutSeconds: TELEGRAM_TIMEOUT_SECONDS })
    .sendMessage(job.chatId, text, { reply_markup: new InlineKeyboard().webApp('Открыть в студии', url) })
    .catch(onError);
}
