import type { AiCatalogModelDto, AiFormatQualityDto, AiOverviewDto } from '@alexeev/contracts';
import type { IconName, StatusGroup } from '../../../shared/ui';
import { copy } from '../ui/copy';

export const BUDGET_PRESETS: readonly number[] = [2, 5, 10, 20];
export const DAILY_PRESETS: readonly number[] = [0.5, 1, 2];
export const WARN_PRESETS: readonly number[] = [70, 80, 90];

/** A typical draft: about 3 000 input tokens (profile, examples, task) and 500 output tokens, uncached. */
export function draftCostCents(model: AiCatalogModelDto): number {
  return (3000 * model.inputPerMillion + 500 * model.outputPerMillion) / 10_000;
}

/** The one state the top of the page shows, with what to do next. */
export function aiStatus(overview: AiOverviewDto): { label: string; group: StatusGroup; icon: IconName; next: string } {
  const { connection, settings, spend } = overview;
  if (!connection.keyConfigured)
    return { label: copy.status.noKey, group: 'unknown', icon: 'alert', next: copy.next.noKey };
  if (!settings.enabled) return { label: copy.status.off, group: 'muted', icon: 'pause', next: copy.next.off };
  if (spend.blockedBy === 'monthly_budget' || spend.blockedBy === 'daily_cap')
    return { label: copy.status.budget, group: 'retry', icon: 'pause', next: copy.blocked[spend.blockedBy] };
  if (spend.blockedBy !== null)
    return { label: copy.status.setup, group: 'unknown', icon: 'alert', next: copy.blocked[spend.blockedBy] };
  if (connection.lastCheck === null)
    return { label: copy.status.unchecked, group: 'pending', icon: 'info', next: copy.next.unchecked };
  if (!connection.lastCheck.ok)
    return {
      label: copy.status.failed,
      group: 'failed',
      icon: 'x-circle',
      next: copy.next.failed(connection.lastCheck.errorCode)
    };
  return { label: copy.status.ready, group: 'done', icon: 'check-circle', next: copy.next.ready };
}

/** Approved drafts as a whole percent; null without a draft. */
export function approvalPercent(quality: AiOverviewDto['quality']): number | null {
  return quality.drafts === 0 ? null : Math.round((quality.approved / quality.drafts) * 100);
}

/** Below this share of approvals over at least this many drafts, the page suggests what to change. */
const LOW_APPROVAL_PERCENT = 30;
const LOW_APPROVAL_MIN_DRAFTS = 5;

export function lowApproval(quality: AiOverviewDto['quality']): boolean {
  const percent = approvalPercent(quality);
  return percent !== null && quality.drafts >= LOW_APPROVAL_MIN_DRAFTS && percent < LOW_APPROVAL_PERCENT;
}

/** Median minutes to approval as «12 мин», «2 ч», «2 ч 5 мин»; «—» without approvals. */
export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return '—';
  const total = Math.max(1, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${total} мин`;
  return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`;
}

export function sharePercent(share: number | null): string {
  return share === null ? '—' : `${Math.round(share * 100)}%`;
}

/** Formats that wrote nothing and approved nothing collapse into one muted line. */
export function splitFormats(rows: readonly AiFormatQualityDto[]): {
  active: AiFormatQualityDto[];
  idle: AiFormatQualityDto[];
} {
  const idle = rows.filter((row) => row.drafts === 0 && row.approved === 0);
  return { active: rows.filter((row) => !idle.includes(row)), idle };
}

export type QualityComparison =
  | { comparable: false }
  | { comparable: true; approved: number; ratioPercent: number | null; direction: 'less' | 'more' | 'same' | null };

/** The previous period next to the current one: two numbers and a direction, never a cause. */
export function qualityComparison(quality: AiOverviewDto['quality']): QualityComparison | null {
  const { previous } = quality;
  if (!previous) return null;
  if (!previous.comparable) return { comparable: false };
  const before = previous.averageEditRatio === null ? null : Math.round(previous.averageEditRatio * 100);
  const now = quality.averageEditRatio === null ? null : Math.round(quality.averageEditRatio * 100);
  const direction = before === null || now === null ? null : now < before ? 'less' : now > before ? 'more' : 'same';
  return { comparable: true, approved: previous.approved, ratioPercent: before, direction };
}
