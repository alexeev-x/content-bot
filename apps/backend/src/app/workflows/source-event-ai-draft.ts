import { SOURCE_LINK_LABEL } from '../../modules/ai';
import {
  fetchSteamAnnouncementText,
  findDotaNewsEntryUrl,
  type DotaDraftSource,
  type DotaWatcherRepository
} from '../../modules/dota';
import { AppError } from '../../shared/app-error';
import type { AiJob, EventWriterJob } from '../bot/ai-job';

// A Steam announcement becomes an AI draft in the owner's chat (plan item 1, owner 21.10.2026): Cron requests it
// for a new event, /events for a past one. The model call runs in the AI_JOBS consumer; its «Пишу…» message turns
// into the usual writer draft, and approving it makes the event's post (`linkAiPost`).

/** Claims the event's AI draft and queues it. False when another request has it already. */
export async function requestSourceEventDraft(
  deps: {
    repo: Pick<DotaWatcherRepository, 'claimAiDraft' | 'releaseAiDraft'>;
    enqueue: (job: AiJob) => Promise<void>;
    newId: () => string;
  },
  input: { externalId: string; chatId: number; appOrigin: string; replay: boolean }
): Promise<boolean> {
  const jobId = deps.newId();
  if (!(await deps.repo.claimAiDraft({ externalId: input.externalId, jobId, replay: input.replay }))) return false;
  try {
    await deps.enqueue({
      id: jobId,
      kind: 'source_event',
      chatId: input.chatId,
      appOrigin: input.appOrigin,
      externalId: input.externalId
    });
  } catch (error) {
    // Nothing was queued. Cron's claim goes back for the next tick. A replay's stays: given back, it would make the
    // row look like a fresh event to Cron, and the owner, told it failed, simply taps again.
    if (!input.replay) await deps.repo.releaseAiDraft({ externalId: input.externalId, jobId });
    throw error;
  }
  return true;
}

/** What the consumer's writer needs for an event job. */
export function sourceEventWriter(deps: {
  repo: Pick<DotaWatcherRepository, 'findSteamAnnouncement' | 'setAiGeneration'>;
  fetchText?: typeof fetchSteamAnnouncementText;
  findOfficialUrl?: typeof findDotaNewsEntryUrl;
  onError: (error: unknown) => void;
}) {
  const fetchText = deps.fetchText ?? fetchSteamAnnouncementText;
  const findOfficialUrl = deps.findOfficialUrl ?? findDotaNewsEntryUrl;
  return {
    async task(externalId: string): Promise<string> {
      const source = await deps.repo.findSteamAnnouncement(externalId);
      if (source === null) throw new AppError('NOT_FOUND', 'The announcement is gone');
      // The feed's 500 characters are too little to write from; without the whole text the job fails visibly.
      const text = await fetchText({ externalId, publishedAt: source.publishedAt });
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
    }
  };
}

const TYPE_NAME: Record<DotaDraftSource['eventType'], string> = {
  treasure: 'новая сокровищница',
  news: 'новость',
  patch: 'патч'
};

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
    `<<<${text.replaceAll('>>>', '> > >').replaceAll('<<<', '< < <')}>>>`
  ].join('\n');
}
