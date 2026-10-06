import type { PublicationDto, PublicationStatus } from '@alexeev/contracts';

// Statuses that can still change on their own (cron, queue): the list and the drawer poll only while one is visible.
const IN_PROGRESS: ReadonlySet<PublicationStatus> = new Set([
  'scheduled',
  'queued',
  'preparing',
  'sending',
  'retry_wait'
]);

export function isInProgress(status: PublicationStatus): boolean {
  return IN_PROGRESS.has(status);
}

type Statusful = Pick<PublicationDto, 'status' | 'externalMessageId'>;

/**
 * The status shown to the owner. `sent` without a Telegram message id is not a confirmed send, so it must not
 * read «Опубликовано»: it is shown as needing a check instead.
 */
export function displayStatus(publication: Statusful): PublicationStatus {
  return publication.status === 'sent' && !publication.externalMessageId ? 'unknown' : publication.status;
}

/** Deep link to the sent message: a public @username, or the private `t.me/c` form of a -100… chat id. */
export function messageLink(chatId: string, externalMessageId: string): string | undefined {
  if (!/^\d{1,12}$/.test(externalMessageId)) return undefined;
  if (/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(chatId)) return `https://t.me/${chatId.slice(1)}/${externalMessageId}`;
  const privateChat = /^-100(\d{1,13})$/.exec(chatId);
  return privateChat ? `https://t.me/c/${privateChat[1]}/${externalMessageId}` : undefined;
}

export type StepState = 'done' | 'current' | 'upcoming' | 'skipped' | 'final';
export type PipelineStepId = 'scheduled' | 'queued' | 'sending' | 'result';
export type PipelineStep = { id: PipelineStepId; state: StepState };

const IDS: readonly PipelineStepId[] = ['scheduled', 'queued', 'sending', 'result'];

const STATES: Record<PublicationStatus, readonly StepState[]> = {
  scheduled: ['current', 'upcoming', 'upcoming', 'upcoming'],
  queued: ['done', 'current', 'upcoming', 'upcoming'],
  preparing: ['done', 'done', 'current', 'upcoming'],
  sending: ['done', 'done', 'current', 'upcoming'],
  retry_wait: ['done', 'done', 'current', 'upcoming'],
  sent: ['done', 'done', 'done', 'final'],
  failed: ['done', 'done', 'done', 'final'],
  unknown: ['done', 'done', 'done', 'final'],
  // Cancelling is only possible before sending starts, so the later stages never happened.
  cancelled: ['done', 'skipped', 'skipped', 'final']
};

/** The four-stage pipeline of a publication; the last stage carries the outcome status. */
export function pipelineFor(status: PublicationStatus): PipelineStep[] {
  const states = STATES[status];
  return IDS.map((id, index) => ({ id, state: states[index] ?? 'upcoming' }));
}
