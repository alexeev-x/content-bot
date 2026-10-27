import {
  DASHBOARD_ATTENTION_TOTAL_CAP,
  type DashboardAttentionDto,
  type DashboardDto,
  type DashboardPublicationDto,
  type DashboardQuery,
  type DashboardSentDto,
  type PostOriginDto,
  DASHBOARD_TODAY_TOTAL_CAP
} from '@alexeev/contracts';
import { projectPublicationStatus } from '../domain/status-projection';
import type { DashboardAttentionRow, DashboardPublicationRow, DashboardRepository, DashboardSentRow } from './ports';

/** A scheduled or queued publication this far past its time means Cron or the kill switch is not sending. */
const STUCK_AFTER_MS = 10 * 60 * 1000;

const iso = (ms: number) => new Date(ms).toISOString();

function toPublicationDto(row: DashboardPublicationRow, now: number): DashboardPublicationDto {
  return {
    publicationId: row.publicationId,
    scheduledAt: iso(row.scheduledAt),
    status: projectPublicationStatus(row.job, now),
    postTitle: row.postTitle,
    destinationName: row.destinationName
  };
}

const TELEGRAM_USERNAME = /^@([A-Za-z][A-Za-z0-9_]{4,31})$/;
const TELEGRAM_MESSAGE_ID = /^[1-9]\d{0,15}$/;

// A message link needs a public username and the message id; a private channel has neither, so it has no link.
function messageUrlOf(row: DashboardSentRow): string | undefined {
  const username = TELEGRAM_USERNAME.exec(row.chatId)?.[1];
  if (username === undefined || row.externalMessageId === null || !TELEGRAM_MESSAGE_ID.test(row.externalMessageId)) {
    return undefined;
  }
  return `https://t.me/${username}/${row.externalMessageId}`;
}

function toSentDto(row: DashboardSentRow, now: number): DashboardSentDto {
  const messageUrl = messageUrlOf(row);
  return {
    ...toPublicationDto(row, now),
    sentAt: iso(row.updatedAt),
    ...(messageUrl === undefined ? {} : { messageUrl })
  };
}

function toAttentionDto(row: DashboardAttentionRow): DashboardAttentionDto {
  const { incident, publication } = row;
  const publicationFields =
    publication === null
      ? {}
      : {
          publicationId: publication.publicationId,
          postTitle: publication.postTitle,
          destinationName: publication.destinationName,
          scheduledAt: iso(publication.scheduledAt)
        };
  if (incident === null) {
    // A stuck row is a publication, so it is there; its missed time is when the trouble began.
    if (publication === null) throw new Error('A stuck dashboard row lost its publication');
    return { kind: 'stuck', ...publicationFields, occurredAt: iso(publication.scheduledAt) };
  }
  return {
    kind: incident.kind === 'publish_unknown' ? 'unknown' : 'failed',
    incidentId: incident.id,
    code: incident.code,
    ...publicationFields,
    occurredAt: iso(incident.createdAt)
  };
}

/** The owner's day on one screen: five bounded reads in one batch, projected to the contract. */
export async function readDashboard(
  deps: {
    repo: DashboardRepository;
    now: number;
    /** Consumer-owned port: who wrote these posts (the «ИИ» mark of the day line; owner, 27.10.2026). */
    origins?: (postIds: readonly string[]) => Promise<ReadonlyMap<string, PostOriginDto>>;
  },
  query: DashboardQuery
): Promise<DashboardDto> {
  const { now } = deps;
  const snapshot = await deps.repo.read({
    from: Date.parse(query.from),
    to: Date.parse(query.to),
    stuckBefore: now - STUCK_AFTER_MS
  });
  const rows = [...snapshot.today, ...snapshot.upcoming, ...snapshot.recentSent];
  const origins =
    deps.origins === undefined || rows.length === 0
      ? new Map<string, PostOriginDto>()
      : await deps.origins(rows.map((row) => row.postId));
  const withOrigin = <T extends DashboardPublicationDto>(dto: T, row: DashboardPublicationRow): T => ({
    ...dto,
    postOrigin: origins.get(row.postId) ?? null
  });
  return {
    attention: snapshot.attention.map(toAttentionDto),
    attentionTotal: Math.min(snapshot.openIncidents + snapshot.stuck, DASHBOARD_ATTENTION_TOTAL_CAP),
    today: snapshot.today.map((row) => withOrigin(toPublicationDto(row, now), row)),
    todayTotal: Math.min(snapshot.todayTotal, DASHBOARD_TODAY_TOTAL_CAP),
    upcoming: snapshot.upcoming.map((row) => withOrigin(toPublicationDto(row, now), row)),
    recentSent: snapshot.recentSent.map((row) => withOrigin(toSentDto(row, now), row)),
    generatedAt: iso(now)
  };
}
