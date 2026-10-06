import { describe, expect, it } from 'vitest';
import { appOriginOf, webhookUrlFor } from './app-origin';

describe('appOriginOf', () => {
  it.each([
    ['https://studio.example.com/api/v1/bot/status?x=1', 'https://studio.example.com'],
    ['http://studio.example.com/webhooks/telegram', 'https://studio.example.com'],
    ['http://localhost:8790/api/v1/bot/status', 'http://localhost:8790'],
    ['http://127.0.0.1:8790/x', 'http://127.0.0.1:8790']
  ])('%s -> %s', (url, origin) => {
    expect(appOriginOf(url)).toBe(origin);
  });

  it('builds the webhook URL from the origin', () => {
    expect(webhookUrlFor('https://a.example.com')).toBe('https://a.example.com/webhooks/telegram');
  });
});
