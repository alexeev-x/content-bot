import type { ReactNode } from 'react';

export type CheckTone = 'loading' | 'ok' | 'warning' | 'danger';

/** One thing the system status strip reports on; features describe their check, the dashboard only lists them. */
export type StatusCheck = {
  id: string;
  /** Row name in the details list: «Сервис», «Бот». */
  name: string;
  tone: CheckTone;
  /** Short state in the details list. */
  summary: string;
  /** Strip text when this is the only problem. */
  headline?: string;
  /** The one action that fixes it: shown on the strip and on the details row. */
  action?: { label: string; onPress: () => void; isLoading?: boolean };
  /** Extra content under the row; it carries its own controls, so the row action is not repeated. */
  details?: ReactNode;
};
