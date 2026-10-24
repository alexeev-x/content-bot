import type { PostStatus, PublicationStatus } from '@alexeev/contracts';
import { ru } from '../lib/ru';
import type { IconName } from './Icon';

export type AutomationStatus = 'ok' | 'paused' | 'stale';
export type StatusKey = PublicationStatus | PostStatus | AutomationStatus;
/** Token group: `--color-status-<group>-{fg,bg,ring}`. */
export type StatusGroup = 'pending' | 'active' | 'done' | 'retry' | 'failed' | 'unknown' | 'muted';

// Labels and groups of publication statuses are canonical in skill `page-spec`; post and automation
// statuses follow the same hues (draft/paused muted, approved/ok done, stale needs a look like unknown).
const META: Record<StatusKey, { group: StatusGroup; icon: IconName }> = {
  scheduled: { group: 'pending', icon: 'clock' },
  queued: { group: 'pending', icon: 'more' },
  preparing: { group: 'active', icon: 'loader' },
  sending: { group: 'active', icon: 'loader' },
  sent: { group: 'done', icon: 'check-circle' },
  retry_wait: { group: 'retry', icon: 'retry' },
  failed: { group: 'failed', icon: 'x-circle' },
  unknown: { group: 'unknown', icon: 'help' },
  cancelled: { group: 'muted', icon: 'minus-circle' },
  draft: { group: 'muted', icon: 'edit' },
  approved: { group: 'done', icon: 'check-circle' },
  ok: { group: 'done', icon: 'check-circle' },
  paused: { group: 'muted', icon: 'pause' },
  stale: { group: 'unknown', icon: 'alert' }
};

export function statusMeta(status: StatusKey): { label: string; group: StatusGroup; icon: IconName } {
  return { ...META[status], label: ru.status[status] };
}
