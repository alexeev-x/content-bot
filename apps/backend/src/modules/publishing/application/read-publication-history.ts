import {
  PUBLICATION_HISTORY_LIMIT,
  publicationAttemptOutcomeSchema,
  type PublicationHistoryDto,
  type PublicationHistoryEvent
} from '@alexeev/contracts';
import { z } from 'zod';
import type { PublicationHistoryRows, PublicationRepository } from './ports';
import { publicationNotFound } from './publication-errors';

// Audit details are metadata we wrote ourselves; parsing stays tolerant so one odd row never hides the history.
const detailsSchema = z
  .object({ scheduledAt: z.number().int().nonnegative().optional(), outcome: z.string().optional() })
  .catch({});

function details(raw: string | null): z.infer<typeof detailsSchema> {
  if (raw === null) return {};
  try {
    return detailsSchema.parse(JSON.parse(raw));
  } catch {
    return {};
  }
}

const iso = (ms: number) => new Date(ms).toISOString();
const planned = (ms: number | undefined) => (ms === undefined ? {} : { scheduledAt: iso(ms) });

function auditEvent(row: PublicationHistoryRows['audit'][number]): PublicationHistoryEvent | null {
  const meta = details(row.details);
  const at = iso(row.at);
  switch (row.action) {
    case 'publication.create':
      return { kind: 'created', at, ...planned(meta.scheduledAt) };
    case 'publication.reschedule':
      return { kind: 'rescheduled', at, ...planned(meta.scheduledAt) };
    case 'publication.cancel':
      return { kind: 'cancelled', at };
    case 'publication.resolve_unknown': {
      const outcome = meta.outcome === 'sent' || meta.outcome === 'resend' ? meta.outcome : 'cancel';
      return { kind: 'resolved', at, outcome, ...planned(meta.scheduledAt) };
    }
    default:
      return null;
  }
}

export async function getPublicationHistory(
  deps: { repo: PublicationRepository },
  id: string
): Promise<PublicationHistoryDto> {
  const rows = await deps.repo.history(id, PUBLICATION_HISTORY_LIMIT);
  if (rows === null) throw publicationNotFound();
  const events: PublicationHistoryEvent[] = [];
  for (const row of rows.audit) {
    const event = auditEvent(row);
    if (event !== null) events.push(event);
  }
  for (const row of rows.attempts) {
    const outcome = publicationAttemptOutcomeSchema.safeParse(row.outcome);
    if (!outcome.success) continue;
    events.push({
      kind: 'attempt',
      at: iso(row.finishedAt),
      attempt: row.attempt,
      outcome: outcome.data,
      errorCode: row.errorCode,
      retryAfterSeconds: row.retryAfter
    });
  }
  // Stable: an attempt finishing in the same millisecond as an owner action keeps the audit row first.
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return { items: events.slice(-PUBLICATION_HISTORY_LIMIT) };
}
