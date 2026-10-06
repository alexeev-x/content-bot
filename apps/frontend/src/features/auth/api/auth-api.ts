import { accessTokenSchema, meSchema, type AccessTokenDto, type TelegramWidgetSignInInput } from '@alexeev/contracts';
import { apiRequest, apiRequestNoContent, cancelSessionRenewal, refreshSession } from '../../../shared/api/http-client';
import { setSession } from '../../../shared/api/session';
import { getInitData } from '../../../shared/telegram/web-app';

/** Thrown when Mini App sign-in is requested outside Telegram (initData is empty). */
export class NotInsideTelegramError extends Error {
  constructor() {
    super('Not running inside Telegram');
    this.name = 'NotInsideTelegramError';
  }
}

export async function signInWithMiniApp(signal?: AbortSignal): Promise<AccessTokenDto> {
  const initData = getInitData();
  if (initData === undefined) throw new NotInsideTelegramError();
  const token = await apiRequest('/api/v1/auth/telegram', accessTokenSchema, {
    method: 'POST',
    body: { initData },
    anonymous: true,
    signal
  });
  setSession(token);
  return token;
}

/** `user` is the Telegram Login Widget object, passed through unchanged: the hash covers every field. */
export async function signInWithWidget(user: TelegramWidgetSignInInput, signal?: AbortSignal): Promise<AccessTokenDto> {
  const token = await apiRequest('/api/v1/auth/telegram-widget', accessTokenSchema, {
    method: 'POST',
    body: user,
    anonymous: true,
    signal
  });
  setSession(token);
  return token;
}

/** Restores or renews the session (cookie in a browser, current Bearer in the Mini App). Single-flight. */
export { refreshSession };

export function logoutRequest(signal?: AbortSignal): Promise<void> {
  cancelSessionRenewal();
  return apiRequestNoContent('/api/v1/auth/logout', { method: 'POST', skipReauth: true, signal });
}

export function fetchMe(signal?: AbortSignal) {
  return apiRequest('/api/v1/auth/me', meSchema, { signal });
}
