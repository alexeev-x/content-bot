import type { PublicationDto } from '@alexeev/contracts';
import type { TelegramOwnerMessageApi } from '../../integrations/telegram/telegram-api';
import type { DestinationRepository, PostRevisionSource, ScheduleNotifier } from '../../modules/publishing';
import type { Logger } from '../../platform/logging/logger';
import { AppError } from '../../shared/app-error';
import { createTelegramCaller } from '../bot/telegram-call';
import { formatScheduleNotice } from './schedule-notice';

// One message must not hold the request's background work for long; nothing is retried.
export const NOTICE_TIMEOUT_MS = 5_000;

export interface ScheduleNotifierDeps {
  /** Null when the bot token is not set: the owner is simply not told. */
  messenger: TelegramOwnerMessageApi | null;
  /** The owner's Telegram ID: in a private chat the chat id is the user id. */
  ownerChatId: string;
  appOrigin: string;
  /** Resolved when a notice is built, so a request that never notifies does not touch the database. */
  posts: () => PostRevisionSource;
  destinations: () => Pick<DestinationRepository, 'findById'>;
  logger: Logger;
  requestId: string;
  /** The request's `ctx.waitUntil`: the work outlives the response, and a failure cannot reach it. */
  waitUntil: (work: Promise<unknown>) => void;
  timeoutMs?: number;
}

// Best effort by design: the publication is already stored, so every failure ends here as one log
// line with a stable code. Nothing about the post, the chat or the Telegram answer is logged.
export function createScheduleNotifier(deps: ScheduleNotifierDeps): ScheduleNotifier {
  const log = (operation: string, status: 'sent' | 'skipped' | 'failed', errorCode?: string) =>
    deps.logger[status === 'failed' ? 'warn' : 'info']({
      component: 'owner_notice',
      operation,
      requestId: deps.requestId,
      status,
      ...(errorCode === undefined ? {} : { errorCode })
    });

  async function send(kind: 'scheduled' | 'rescheduled', publication: PublicationDto): Promise<void> {
    const { messenger } = deps;
    if (messenger === null) {
      log(`schedule_notice.${kind}`, 'skipped', 'BOT_TOKEN_MISSING');
      return;
    }
    const [post, destination] = await Promise.all([
      deps.posts().findRevision(publication.postId, publication.postRevision),
      deps.destinations().findById(publication.destinationId)
    ]);
    const notice = formatScheduleNotice({
      kind,
      post,
      channelTitle: destination?.title ?? null,
      scheduledAt: Date.parse(publication.scheduledAt),
      timezone: publication.timezone,
      publicationId: publication.id,
      appOrigin: deps.appOrigin
    });
    const call = createTelegramCaller({
      logger: deps.logger,
      requestId: deps.requestId,
      timeoutMs: deps.timeoutMs ?? NOTICE_TIMEOUT_MS
    });
    await call.act(`schedule_notice.${kind}`, (signal) =>
      messenger.sendMessageWithWebAppButton(deps.ownerChatId, notice, signal)
    );
    log(`schedule_notice.${kind}`, 'sent');
  }

  function notify(kind: 'scheduled' | 'rescheduled', publication: PublicationDto): void {
    const operation = `schedule_notice.${kind}`;
    const guarded = send(kind, publication).catch((error: unknown) => {
      log(operation, 'failed', error instanceof AppError ? error.code : 'UNEXPECTED_ERROR');
    });
    try {
      deps.waitUntil(guarded);
    } catch {
      // No execution context: the promise still runs to its own end and logs there.
      log(operation, 'failed', 'NO_EXECUTION_CONTEXT');
    }
  }

  return {
    scheduled: (publication) => notify('scheduled', publication),
    rescheduled: (publication) => notify('rescheduled', publication)
  };
}
