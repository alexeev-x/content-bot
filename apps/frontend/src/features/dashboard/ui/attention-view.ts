import type { AttentionRow } from '../model/attention-rows';
import { copy } from './copy';

export type AttentionView = {
  key: string;
  kind: 'failed' | 'unknown';
  tag: string;
  title: string;
  reason: string;
  publicationId: string | undefined;
  action: { label: string; aria: string; primary: boolean; onPress: () => void; isLoading: boolean } | undefined;
};

/** One row of «Требует внимания»: what happened and the one action that moves it on. */
export function toAttentionView(row: AttentionRow, open: (id: string) => void): AttentionView {
  if (row.type === 'check') {
    const { check } = row;
    return {
      key: row.key,
      kind: check.tone === 'danger' ? 'failed' : 'unknown',
      tag: copy.attention.systemTag,
      title: check.headline ?? `${check.name}: ${check.summary}`,
      reason: check.headline ? check.summary : '',
      publicationId: undefined,
      action: check.action
        ? {
            label: check.action.label,
            aria: check.action.label,
            primary: true,
            onPress: check.action.onPress,
            isLoading: check.action.isLoading ?? false
          }
        : undefined
    };
  }
  const id = row.publicationId;
  const unknown = row.type === 'publication' && row.kind === 'unknown';
  const stuck = row.type === 'stuck';
  return {
    key: row.key,
    kind: unknown || stuck ? 'unknown' : 'failed',
    tag: unknown ? copy.attention.unknownTag : stuck ? copy.attention.stuckTag : copy.attention.failedTag,
    title: row.title,
    reason: unknown ? copy.attention.unknownReason : stuck ? copy.attention.stuckReason : copy.attention.failedReason,
    publicationId: id,
    action: id
      ? {
          label: unknown ? copy.attention.check : copy.attention.open,
          aria: unknown ? copy.attention.checkLabel(row.title) : copy.attention.openLabel(row.title),
          primary: unknown,
          onPress: () => open(id),
          isLoading: false
        }
      : undefined
  };
}
