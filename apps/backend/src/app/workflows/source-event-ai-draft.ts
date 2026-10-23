import { SOURCE_LINK_LABEL } from '../../modules/ai';
import {
  fetchSteamAnnouncement,
  findDotaNewsEntryUrl,
  type PatchDigest,
  patchDigestText,
  patchVersionOf,
  type SteamAnnouncement,
  type DotaDraftSource,
  type DotaWatcherRepository
} from '../../modules/dota';
import { AppError } from '../../shared/app-error';
import type { AiJob, EventWriterJob } from '../bot/ai-job';

// A Steam announcement becomes an AI draft in the owner's chat (plan item 1, owner 21.10.2026): Cron requests it
// for a new event, the studio's «Написать через ИИ» for any announcement, a past one included. The model call runs in the AI_JOBS consumer; its «Пишу…» message turns
// into the usual writer draft, and approving it makes the event's post (`linkAiPost`).

/** Claims the event's AI draft and queues it. False when another request has it already. */
export async function requestSourceEventDraft(
  deps: {
    repo: Pick<DotaWatcherRepository, 'claimAiDraft' | 'releaseAiDraft' | 'finishAiDraft'>;
    enqueue: (job: AiJob) => Promise<void>;
    newId: () => string;
    now: () => number;
  },
  input: { externalId: string; chatId: number; appOrigin: string; replay: boolean }
): Promise<boolean> {
  const jobId = deps.newId();
  if (!(await deps.repo.claimAiDraft({ externalId: input.externalId, jobId, replay: input.replay, now: deps.now() })))
    return false;
  try {
    await deps.enqueue({
      id: jobId,
      kind: 'source_event',
      chatId: input.chatId,
      appOrigin: input.appOrigin,
      externalId: input.externalId,
      automatic: !input.replay
    });
  } catch (error) {
    // Nothing was queued. Cron's claim goes back for the next tick. A replay's job stays (given back, the row would
    // look like a fresh event to Cron) but stops «writing», so the owner, told it failed, can tap again.
    if (!input.replay) await deps.repo.releaseAiDraft({ externalId: input.externalId, jobId });
    else await deps.repo.finishAiDraft({ externalId: input.externalId, jobId });
    throw error;
  }
  return true;
}

/** What the consumer's writer needs for an event job. */
export function sourceEventWriter(deps: {
  repo: Pick<DotaWatcherRepository, 'findSteamAnnouncement' | 'setAiGeneration' | 'finishAiDraft'>;
  fetchAnnouncement?: typeof fetchSteamAnnouncement;
  findOfficialUrl?: typeof findDotaNewsEntryUrl;
  /** A patch's notes by version (Valve's datafeed); without it a patch is written from its announcement. */
  digestPatch?: (version: string) => Promise<PatchDigest | null>;
  onError: (error: unknown) => void;
}) {
  const fetchAnnouncement = deps.fetchAnnouncement ?? fetchSteamAnnouncement;
  const findOfficialUrl = deps.findOfficialUrl ?? findDotaNewsEntryUrl;
  return {
    async task(externalId: string): Promise<string> {
      const source = await deps.repo.findSteamAnnouncement(externalId);
      if (source === null) throw new AppError('NOT_FOUND', 'The announcement is gone');
      // A patch is written from Valve's notes of that version, not from the announcement's few lines (owner,
      // 22.10.2026); when Valve has no notes yet, from the announcement as any news.
      const version = patchVersionOf(source.title);
      if (version !== null && deps.digestPatch !== undefined) {
        const digest = await deps.digestPatch(version).catch((error: unknown) => {
          deps.onError(error);
          return null;
        });
        if (digest !== null) return patchTask(source, digest);
      }
      // The feed's 500 characters are too little to write from; without the whole text the job fails visibly.
      const text = (await fetchAnnouncement({ externalId, publishedAt: source.publishedAt }))?.text ?? null;
      if (text === null) throw new AppError('NOT_FOUND', 'Steam no longer returns the announcement');
      // The post links to dota2.com (owner, 21.10.2026); Steam's page when that lookup fails.
      const official = await findOfficialUrl({ publishedAt: source.publishedAt }).catch((error: unknown) => {
        deps.onError(error);
        return null;
      });
      return sourceEventTask(source, text, official ?? source.sourceUrl);
    },
    async generated(job: EventWriterJob, generationId: string): Promise<void> {
      await deps.repo.setAiGeneration({ externalId: job.externalId, jobId: job.id, generationId });
    },
    /** The job ended, whatever happened: the event's button unlocks. */
    async finished(job: EventWriterJob): Promise<void> {
      await deps.repo.finishAiDraft({ externalId: job.externalId, jobId: job.id });
    }
  };
}

/** The writer's task is at most 4 000 characters; the announcement gets what the request leaves. */
const TASK_TEXT_MAX = 3_500;

/** The side panel's view of an announcement: its text, images and dota2.com page, read from Steam. */
export async function readSourceEventContent(
  source: { sourceKey: 'steam_news' | 'patch_notes'; externalId: string; publishedAt: number },
  deps: {
    fetchAnnouncement?: typeof fetchSteamAnnouncement;
    findOfficialUrl?: typeof findDotaNewsEntryUrl;
    onError: (error: unknown) => void;
  }
): Promise<Omit<SteamAnnouncement, 'pages'> & { officialUrl: string | null }> {
  if (source.sourceKey !== 'steam_news') return { text: null, images: [], officialUrl: null };
  const [announcement, officialUrl] = await Promise.all([
    (deps.fetchAnnouncement ?? fetchSteamAnnouncement)(source).catch((error: unknown) => {
      throw new AppError('UNAVAILABLE', 'Steam did not return the announcement', {
        reason: error instanceof Error ? error.name : 'unknown'
      });
    }),
    // A missing dota2.com link is not worth failing the panel for.
    (deps.findOfficialUrl ?? findDotaNewsEntryUrl)(source).catch((error: unknown) => {
      deps.onError(error);
      return null;
    })
  ]);
  return { text: announcement?.text ?? null, images: announcement?.images ?? [], officialUrl };
}

const TYPE_NAME: Record<DotaDraftSource['eventType'], string> = {
  treasure: 'новая сокровищница',
  news: 'новость',
  patch: 'патч'
};

/** The patch's page on dota2.com, the post's link: the full notes are there. */
export const patchPageUrl = (version: string) => `https://www.dota2.com/patches/${version}`;

/**
 * The writer's task of a patch (owner, 22.10.2026): one short post — the main change first (a joke welcome), then who
 * was cut and who was buffed the most, then the items; the rest is on the linked patch page.
 */
export function patchTask(source: DotaDraftSource, digest: PatchDigest): string {
  const date = new Date(source.publishedAt).toISOString().slice(0, 10).split('-').reverse().join('.');
  const small = /[a-z]$/.test(digest.version);
  return [
    `Повод: вышел ${small ? 'небольшой ' : ''}патч Dota 2 ${digest.version} (официальные патчноуты Valve).`,
    `Дата: ${date}`,
    `${SOURCE_LINK_LABEL}${patchPageUrl(digest.version)}`,
    `Напиши один ${small ? 'короткий ' : ''}пост о патче. Первая строка — ровно «Вышел ${digest.version}.» и больше ничего, затем пустая строка, дальше по порядку:`,
    '1. Главное изменение — первым: самое крупное из раздела «ГЛАВНОЕ», если он есть. Уместна одна короткая шутка о нём.',
    '2. Кого ослабили сильнее всего и кого усилили — по 2–4 героя, по фразе на каждого, только самое заметное. Ослабление или усиление суди по самим изменениям (меньше перезарядка или больше урон — усиление).',
    '3. Самые важные изменения предметов — коротко.',
    'Мелкие числа не перечисляй: остальное — по ссылке на патч.',
    // Last, so the writer's 4 000-character cap can only shorten the notes, never the request.
    'Патчноуты Valve (английский; факты бери только отсюда):',
    `<<<${patchDigestText(digest).replaceAll('>>>', '> > >').replaceAll('<<<', '< < <')}>>>`
  ].join('\n');
}

/** The writer's task: the announcement's own words as the only facts (automatic mode). */
export function sourceEventTask(source: DotaDraftSource, text: string, link: string): string {
  const date = new Date(source.publishedAt).toISOString().slice(0, 10).split('-').reverse().join('.');
  return [
    `Повод: официальный анонс Valve о Dota 2 в Steam (${TYPE_NAME[source.eventType]}).`,
    `Заголовок: ${source.title}`,
    `Дата: ${date}`,
    `${SOURCE_LINK_LABEL}${link}`,
    'Напиши новость для канала: что вышло и чем это важно игроку. Пиши только то, что есть в анонсе.',
    // Last, so the writer's 4 000-character cap can only shorten the announcement, never the request.
    'Текст анонса (английский; факты бери только отсюда):',
    `<<<${text.slice(0, TASK_TEXT_MAX).replaceAll('>>>', '> > >').replaceAll('<<<', '< < <')}>>>`
  ].join('\n');
}
