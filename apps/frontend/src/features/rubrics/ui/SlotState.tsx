import type { RubricSlotDto } from '@alexeev/contracts';
import { StatusPill, type StatusGroup } from '../../../shared/ui';
import { rubricsCopy as copy } from './copy';

const GROUP: Record<RubricSlotDto['state'], StatusGroup> = {
  planned: 'pending',
  building: 'active',
  ready: 'active',
  released: 'active',
  waiting_parent: 'active',
  unknown: 'unknown',
  sent: 'done',
  partial: 'retry',
  unresolved: 'unknown',
  send_failed: 'failed',
  missed: 'failed',
  empty: 'retry',
  skipped: 'muted',
  yielded: 'muted',
  cancelled: 'muted',
  superseded: 'muted'
};

const ICON = {
  pending: 'clock',
  active: 'loader',
  unknown: 'help',
  done: 'check-circle',
  retry: 'retry',
  failed: 'x-circle',
  muted: 'minus-circle'
} as const;

/** The icon of a slot state: with the label it is the state's second signal beside colour. */
export const slotStateIcon = (state: RubricSlotDto['state']) => ICON[GROUP[state]];

export function SlotState({ state }: { state: RubricSlotDto['state'] }) {
  const group = GROUP[state];
  return <StatusPill label={copy.slots.states[state]} group={group} icon={ICON[group]} />;
}
