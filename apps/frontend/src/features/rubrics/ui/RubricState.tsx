import type { RubricItemDto } from '@alexeev/contracts';
import { StatusPill, type StatusGroup } from '../../../shared/ui';
import { rubricsCopy as copy } from './copy';

const STATE: Record<
  RubricItemDto['state'],
  { group: StatusGroup; icon: 'check-circle' | 'pause' | 'alert' | 'clock' | 'minus-circle' }
> = {
  active: { group: 'done', icon: 'check-circle' },
  paused: { group: 'retry', icon: 'pause' },
  unavailable: { group: 'unknown', icon: 'alert' },
  waiting: { group: 'pending', icon: 'clock' },
  off: { group: 'muted', icon: 'minus-circle' }
};

/** The rubric's state as text + icon (never colour alone). */
export function RubricState({ state }: { state: RubricItemDto['state'] }) {
  const view = STATE[state];
  return <StatusPill label={copy.list.states[state]} group={view.group} icon={view.icon} />;
}
