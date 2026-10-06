import type { BotStatusDto } from '@alexeev/contracts';
import type { StatusKey } from '../../../shared/ui';

export type BotState = 'not_configured' | 'not_connected' | 'other_address' | 'connected';

export function botStateOf(status: BotStatusDto): BotState {
  if (status.missing.length > 0 || status.webhook === null) {
    return status.missing.length > 0 ? 'not_configured' : 'not_connected';
  }
  if (status.webhook.url === null) return 'not_connected';
  return status.webhook.pointsHere ? 'connected' : 'other_address';
}

// Badge labels are canonical in ru.status; the headline text beside the badge says what actually happens.
export const BADGE: Record<BotState, StatusKey> = {
  connected: 'ok',
  not_connected: 'unknown',
  other_address: 'unknown',
  not_configured: 'failed'
};
