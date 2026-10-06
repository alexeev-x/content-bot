export interface SchedulablePost {
  status: 'draft' | 'approved';
  /** The post's current revision. */
  revision: number;
}

export interface SchedulableDestination {
  enabled: boolean;
}

export type ScheduleRefusal =
  'POST_NOT_FOUND' | 'DESTINATION_NOT_FOUND' | 'POST_NOT_APPROVED' | 'STALE_REVISION' | 'DESTINATION_DISABLED';

// Why a publication cannot be created now, or null when it can. A missing entity is reported
// before a state problem; a draft is "not approved" whatever revision the client holds, and an
// approved post never changes again, so any other revision is simply stale.
export function checkSchedulable(
  post: SchedulablePost | null,
  destination: SchedulableDestination | null,
  expectedRevision: number
): ScheduleRefusal | null {
  if (post === null) return 'POST_NOT_FOUND';
  if (destination === null) return 'DESTINATION_NOT_FOUND';
  if (post.status !== 'approved') return 'POST_NOT_APPROVED';
  if (post.revision !== expectedRevision) return 'STALE_REVISION';
  if (!destination.enabled) return 'DESTINATION_DISABLED';
  return null;
}
