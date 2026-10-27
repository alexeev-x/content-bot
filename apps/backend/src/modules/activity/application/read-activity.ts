import {
  activityActionSchema,
  type ActivityAction,
  type ActivityCategory,
  type ActivityItemDto,
  type ActivityPageDto,
  type ActivityQuery
} from '@alexeev/contracts';
import { z } from 'zod';
import { decodeKeysetCursor, encodeKeysetCursor } from '../../../platform/pagination/keyset-cursor';
import { AppError } from '../../../shared/app-error';
import type { ActivityRepository, ActivityRow } from './ports';

const CATEGORY: Record<ActivityAction, ActivityCategory> = {
  'post.create': 'posts',
  'post.approve': 'posts',
  'post.return_to_draft': 'posts',
  'post.archive': 'posts',
  'post.restore': 'posts',
  'post.delete': 'posts',
  'post.purge': 'posts',
  'media.upload': 'media',
  'media.derive': 'media',
  'media.delete': 'media',
  'publication.create': 'publications',
  'publication.reschedule': 'publications',
  'publication.cancel': 'publications',
  'publication.resolve_unknown': 'publications',
  'publication.delete': 'publications',
  'job.succeeded': 'publications',
  'job.retry_wait': 'publications',
  'job.failed': 'errors',
  'job.unknown': 'errors',
  'incident.resolve': 'system',
  'destination.create': 'system',
  'destination.update': 'system',
  'automation.pause': 'system',
  'automation.resume': 'system',
  'automation.run_now': 'system'
};

const ALL_ACTIONS = activityActionSchema.options;
const ENTITY_TYPES = ['post', 'media', 'publication', 'destination', 'automation', 'incident', 'job'] as const;
const cursorSchema = z.tuple([z.number().int().nonnegative(), z.number().int().positive()]);
// Our own metadata: parsing stays tolerant so one odd row never hides the feed.
const detailsSchema = z
  .object({ scheduledAt: z.number().int().nonnegative().optional(), code: z.string().max(64).optional() })
  .catch({});

function parseDetails(raw: string | null): z.infer<typeof detailsSchema> {
  if (raw === null) return {};
  try {
    return detailsSchema.parse(JSON.parse(raw));
  } catch {
    return {};
  }
}

function toItem(
  row: ActivityRow,
  ownerId: string,
  autopublishActor: string | undefined,
  aiPosts: ReadonlySet<string>
): ActivityItemDto | null {
  const action = activityActionSchema.safeParse(row.action);
  const entityType = ENTITY_TYPES.find((type) => type === row.entityType);
  if (!action.success || entityType === undefined) return null;
  const details = parseDetails(row.details);
  return {
    id: String(row.id),
    at: new Date(row.at).toISOString(),
    action: action.data,
    category: CATEGORY[action.data],
    // The automatic publishing acts with no one approving (owner, 27.10.2026: its posts read «ИИ» everywhere); a post
    // made from an approved AI draft was written by the AI editor, though the owner's tap created it.
    actor:
      autopublishActor !== undefined && row.actor === autopublishActor
        ? 'autopublish'
        : action.data === 'post.create' && row.postId !== null && aiPosts.has(row.postId)
          ? 'ai'
          : row.actor === ownerId
            ? 'owner'
            : 'system',
    entityType,
    entityId: row.entityId,
    title: row.title,
    postId: row.postId,
    publicationId: row.publicationId,
    channelTitle: row.channelTitle,
    scheduledAt: details.scheduledAt === undefined ? null : new Date(details.scheduledAt).toISOString(),
    errorCode: details.code ?? null
  };
}

/** What happened in the studio, newest first, from the audit log (owner, 14.10.2026). */
export async function readActivity(
  deps: {
    repo: ActivityRepository;
    ownerId: string;
    /** Consumer-owned port: which of these posts came from an approved AI draft (the AI module knows). */
    aiPosts?: (postIds: readonly string[]) => Promise<ReadonlySet<string>>;
    /** The automatic publishing's audit actor: its rows are the AI's own, not the system's. */
    autopublishActor?: string;
  },
  query: ActivityQuery
): Promise<ActivityPageDto> {
  const key = query.cursor === undefined ? undefined : decodeKeysetCursor(query.cursor, cursorSchema);
  if (key === null) throw new AppError('VALIDATION_ERROR', 'Invalid cursor', { field: 'cursor' });
  const actions =
    query.category === undefined ? ALL_ACTIONS : ALL_ACTIONS.filter((action) => CATEGORY[action] === query.category);
  // One extra row tells whether another page exists.
  const rows = await deps.repo.list({
    actions,
    from: query.from === undefined ? undefined : Date.parse(query.from),
    to: query.to === undefined ? undefined : Date.parse(query.to),
    before: key === undefined ? undefined : { at: key[0], id: key[1] },
    limit: query.limit + 1
  });
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  const created = page.filter((row) => row.action === 'post.create' && row.postId !== null);
  const aiPosts =
    deps.aiPosts === undefined || created.length === 0
      ? new Set<string>()
      : await deps.aiPosts(created.map((row) => row.postId ?? ''));
  return {
    items: page.flatMap((row) => toItem(row, deps.ownerId, deps.autopublishActor, aiPosts) ?? []),
    nextCursor: rows.length > query.limit && last !== undefined ? encodeKeysetCursor([last.at, last.id]) : null
  };
}
