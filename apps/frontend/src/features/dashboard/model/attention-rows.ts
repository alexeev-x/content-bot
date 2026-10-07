import { DASHBOARD_ATTENTION_LIMIT, type DashboardAttentionDto } from '@alexeev/contracts';
import type { StatusCheck } from '../../../shared/lib/status-check';

export type AttentionRow =
  | {
      key: string;
      type: 'publication';
      kind: 'unknown' | 'failed';
      publicationId: string | undefined;
      title: string;
      channel: string | undefined;
      at: string;
    }
  | {
      key: string;
      type: 'stuck';
      publicationId: string | undefined;
      title: string;
      channel: string | undefined;
      at: string;
    }
  | { key: string; type: 'check'; check: StatusCheck };

function fromServer(item: DashboardAttentionDto, index: number): AttentionRow {
  const key = item.incidentId ?? item.publicationId ?? `${item.kind}-${index}`;
  const common = {
    key: `${item.kind}-${key}`,
    publicationId: item.publicationId,
    title: item.postTitle ?? '',
    channel: item.destinationName,
    at: item.occurredAt
  };
  return item.kind === 'stuck' ? { ...common, type: 'stuck' } : { ...common, type: 'publication', kind: item.kind };
}

/**
 * Severity order of the story: unknown, failed, failing system checks, stuck. The server already sends its own
 * items in that order (unknown, failed, stuck); the page's checks slot between failed and stuck. Capped at 5.
 */
export function attentionRows(items: readonly DashboardAttentionDto[], checks: readonly StatusCheck[]): AttentionRow[] {
  const rows = items.map(fromServer);
  const unknown = rows.filter((row) => row.type === 'publication' && row.kind === 'unknown');
  const failed = rows.filter((row) => row.type === 'publication' && row.kind === 'failed');
  const stuck = rows.filter((row) => row.type === 'stuck');
  const problems: AttentionRow[] = checks
    .filter((check) => check.tone === 'warning' || check.tone === 'danger')
    .map((check) => ({ key: `check-${check.id}`, type: 'check', check }));
  return [...unknown, ...failed, ...problems, ...stuck].slice(0, DASHBOARD_ATTENTION_LIMIT);
}
