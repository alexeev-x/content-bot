import {
  type CreatePublicationSeriesInput,
  type PublicationSeriesDto,
  publicationSeriesSchema
} from '@alexeev/contracts';
import { sha256Hex } from '../../../platform/security/sha256';
import { AppError } from '../../../shared/app-error';
import { checkSchedulable } from '../domain/schedulable';
import { isInScheduleWindow } from '../domain/schedule-window';
import type { CreatePublicationDeps } from './create-publication';
import { inFlight, runIdempotent } from './idempotent-create';
import type { PublicationRecord } from './ports';
import { alreadyPublished, scheduleOutOfRange, scheduleRefusal } from './publication-errors';
import { toPublicationDto } from './publication-dto';

const MINUTE_MS = 60_000;

// Posts of one event go out in order with a gap (owner, 22.10.2026): the first at the chosen time, each next one only
// after the previous went out, and no sooner than the interval after it and after its own planned time. One batch
// writes all of them or none; a refusal names the post it is about (`details.postId`).
export async function createPublicationSeries(
  deps: CreatePublicationDeps,
  command: { actor: string; idempotencyKey: string; input: CreatePublicationSeriesInput }
): Promise<PublicationSeriesDto> {
  const { actor, idempotencyKey, input } = command;
  const scheduledAt = Date.parse(input.scheduledAt);
  const gapMs = input.intervalMinutes * MINUTE_MS;
  const requestHash = await sha256Hex(
    JSON.stringify({
      items: input.items,
      destinationId: input.destinationId,
      scheduledAt,
      timezone: input.timezone,
      intervalMinutes: input.intervalMinutes
    })
  );
  return runIdempotent(
    {
      gate: deps.idempotency,
      actor,
      key: idempotencyKey,
      requestHash,
      now: deps.now,
      replay: (body) => publicationSeriesSchema.parse(JSON.parse(body))
    },
    async (ref) => {
      if (!isInScheduleWindow(scheduledAt, deps.now)) throw scheduleOutOfRange();
      if (new Set(input.items.map((item) => item.postId)).size !== input.items.length)
        throw new AppError('VALIDATION_ERROR', 'A post is listed twice in the series', { reason: 'DUPLICATE_POST' });
      await checkAll(deps, input);

      const seriesId = deps.newId();
      const records = input.items.map((item, index) => {
        const at = scheduledAt + index * gapMs;
        const record: PublicationRecord = {
          id: deps.newId(),
          postId: item.postId,
          postRevision: item.revision,
          destinationId: input.destinationId,
          scheduledAt: at,
          timezone: input.timezone,
          revision: 0,
          externalMessageId: null,
          lastErrorCode: null,
          createdAt: deps.now,
          updatedAt: deps.now,
          job: { status: 'pending', runAt: at, sendStartedAt: null },
          series: {
            id: seriesId,
            position: index + 1,
            total: input.items.length,
            blocked: index > 0,
            previousDoneAt: null,
            gapMs
          }
        };
        return { record, jobId: deps.newId() };
      });
      const dto: PublicationSeriesDto = {
        seriesId,
        publications: records.map(({ record }) => toPublicationDto(record, deps.now))
      };
      const written = await deps.publications.createSeries({
        seriesId,
        destinationId: input.destinationId,
        timezone: input.timezone,
        gapMs,
        items: records.map(({ record, jobId }) => ({
          id: record.id,
          jobId,
          postId: record.postId,
          postRevision: record.postRevision,
          scheduledAt: record.scheduledAt
        })),
        now: deps.now,
        actor,
        idempotency: ref,
        response: { status: 202, body: JSON.stringify(dto) }
      });
      if (written) {
        const first = dto.publications[0];
        if (first?.status === 'scheduled') deps.notifier.scheduled(first);
        return dto;
      }
      // A post or the channel changed between the checks and the write: say which, else the claim was lost.
      await checkAll(deps, input);
      throw inFlight();
    }
  );
}

/** Each post, then the channel once; the first refusal names its post. */
async function checkAll(deps: CreatePublicationDeps, input: CreatePublicationSeriesInput): Promise<void> {
  const destination = await deps.destinations.findById(input.destinationId);
  for (const item of input.items) {
    const refusal = checkSchedulable(await deps.posts.findState(item.postId), destination, item.revision, deps.now);
    const error =
      refusal !== null
        ? scheduleRefusal(refusal)
        : (await deps.publications.hasLivePublication(item.postId, input.destinationId))
          ? alreadyPublished()
          : null;
    if (error !== null) throw new AppError(error.code, error.message, { ...error.details, postId: item.postId });
  }
}
