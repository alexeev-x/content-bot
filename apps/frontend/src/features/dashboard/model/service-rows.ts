import type { CheckTone } from '../../../shared/lib/status-check';

/** One light of the «Система» widget: the page maps its system checks to this, so the feature stays independent. */
export type ServiceRow = {
  id: string;
  name: string;
  tone: CheckTone;
  word: string;
  title?: string;
  /** Fine but deliberately switched off (publishing disabled): a neutral light instead of green. */
  off?: boolean;
  /** What to do about a problem light. */
  action?: { label: string; onPress: () => void; isLoading?: boolean };
};
