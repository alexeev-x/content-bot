import { readPublicationOutcomes } from '../../modules/publishing';
import { projectedStatus, scheduleOf, type SlotRow, type SlotStatus } from '../../modules/rubric-scheduler';
import type { Container } from '../container';

// A released slot follows its publications (area-backend-core §11.1): all sent → sent (the rubric's rest starts from
// the real send time); some sent and some not → partial; any unconfirmed → unknown, until the owner reconciles it in
// «Публикации»; dropped past `not_after` → missed. Publishing owns delivery: the slot only reads it.

export async function projectSlot(
  container: Pick<Container, 'clock' | 'publicationOutcomes' | 'rubricSlots' | 'rubricSchedulerSettings'>,
  slot: SlotRow
): Promise<SlotStatus | null> {
  const now = container.clock.now();
  const ids = slot.build?.publications ?? (slot.publicationId === null ? [] : [slot.publicationId]);
  if (ids.length === 0) return null;
  const outcomes = await readPublicationOutcomes({ repo: container.publicationOutcomes, now }, ids);
  const statuses = outcomes.map((outcome) => projectedStatus(outcome.status, outcome.lastErrorCode));
  // Not all of them finished: look again later.
  if (statuses.length < ids.length || statuses.some((status) => status === null)) return null;
  const sent = statuses.filter((status) => status === 'sent').length;
  const next: SlotStatus = statuses.includes('unknown')
    ? 'unknown'
    : sent === statuses.length
      ? 'sent'
      : sent > 0
        ? 'partial'
        : (statuses[0] ?? 'send_failed');
  if (next === slot.status) return null;
  const messageIds = outcomes.flatMap((outcome) => outcome.externalMessageIds);
  const pollId = outcomes.find((outcome) => outcome.externalPollId !== null)?.externalPollId ?? null;
  const sentAt = outcomes
    .filter((outcome) => outcome.status === 'sent')
    .reduce<number | null>((latest, outcome) => Math.max(latest ?? 0, outcome.finishedAt ?? 0), null);
  const times = next === 'unknown' ? scheduleOf('unknown', { slotAt: slot.slotAt, buildAt: slot.buildAt }, now) : null;
  const moved = await container.rubricSlots.transition({
    id: slot.id,
    from: slot.status,
    to: next,
    now,
    set: {
      messageIds,
      pollId,
      sentAt,
      ...(times === null ? {} : { nextActionAt: times.nextActionAt, deadlineAt: times.deadlineAt }),
      ...(next === 'sent' || next === 'partial' || next === 'unknown'
        ? {}
        : { errorCode: outcomes.find((outcome) => outcome.lastErrorCode !== null)?.lastErrorCode ?? next })
    }
  });
  if (!moved) return null;
  if ((next === 'sent' || next === 'partial') && sentAt !== null)
    await container.rubricSchedulerSettings.rubricSent(slot.rubricKey, sentAt);
  return next;
}
