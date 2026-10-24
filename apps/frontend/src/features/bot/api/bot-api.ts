import { botStatusSchema } from '@alexeev/contracts';
import { apiRequest } from '../../../shared/api/http-client';

export function getBotStatus(signal?: AbortSignal) {
  return apiRequest('/api/v1/bot/status', botStatusSchema, { signal });
}

/** Registers this Worker's webhook in Telegram. Idempotent on the server: every step sets the same values. */
export function connectBot() {
  return apiRequest('/api/v1/bot/connect', botStatusSchema, { method: 'POST', body: {} });
}
