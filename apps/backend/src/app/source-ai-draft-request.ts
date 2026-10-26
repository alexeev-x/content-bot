import type { SourceEventDto } from '@alexeev/contracts';
import type { Context } from 'hono';
import { parseSourceEventId } from '../modules/dota';
import { AppError } from '../shared/app-error';
import { appOriginOf } from './bot/app-origin';
import type { AppBindings } from './env';
import { requestSourceEventDraft } from './workflows/source-event-ai-draft';

/**
 * Queues the AI writer for a Steam announcement: «Написать через ИИ» in «Источники», or with `automatic` the whole way
 * without the owner, as if Cron had just found it (only «Тестирование» → «Автопубликация», app/lab, asks for that).
 */
export async function requestSourceAiDraft(
  c: Context<AppBindings>,
  id: string,
  automatic: boolean
): Promise<SourceEventDto> {
  const container = c.get('container');
  if (c.env.DB === undefined) throw new AppError('UNAVAILABLE', 'Database is not configured');
  const key = parseSourceEventId(id);
  const event = key === null ? null : await container.sourceEvents.find(key);
  if (key === null || event === null) throw new AppError('NOT_FOUND', 'Event not found');
  if (key.sourceKey !== 'steam_news')
    throw new AppError('CONFLICT', 'Only a Steam announcement is written by the AI', { reason: 'NOT_AI_SOURCE' });
  if (event.status === 'hidden') throw new AppError('CONFLICT', 'Event is hidden', { reason: 'EVENT_HIDDEN' });
  if (event.aiWriting) throw new AppError('CONFLICT', 'The AI is writing it already', { reason: 'AI_WRITING' });
  const chatId = Number(container.ownerChatId);
  // The draft arrives in the owner's bot chat: without it there is nowhere to send it.
  if (container.ownerChatId === null || !Number.isSafeInteger(chatId))
    throw new AppError('UNAVAILABLE', 'The owner chat is not configured', { reason: 'NO_OWNER_CHAT' });
  const queued = await requestSourceEventDraft(
    {
      repo: container.dotaRepository,
      enqueue: (job) => container.aiJobs.send(job),
      newId: container.newId,
      now: () => container.clock.now()
    },
    { externalId: key.externalId, chatId, appOrigin: appOriginOf(c.req.url), replay: true, automatic }
  );
  // Lost a race with another tap (or a hide): the claim decides, the read says which.
  if (!queued) {
    const now = await container.sourceEvents.find(key);
    throw now?.aiWriting
      ? new AppError('CONFLICT', 'The AI is writing it already', { reason: 'AI_WRITING' })
      : new AppError('CONFLICT', 'Event is hidden', { reason: 'EVENT_HIDDEN' });
  }
  const updated = await container.sourceEvents.find(key);
  if (updated === null) throw new AppError('NOT_FOUND', 'Event not found');
  return updated;
}
