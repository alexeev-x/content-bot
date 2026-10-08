import type { CheckTone } from '../../../shared/lib/status-check';

/** One line of the «Система» panel: the page maps its system checks to this, so the feature stays independent. */
export type ServiceRow = {
  id: string;
  name: string;
  tone: CheckTone;
  word: string;
  title?: string;
  /** Fine but deliberately switched off (publishing disabled): a neutral dot instead of green. */
  off?: boolean;
};
