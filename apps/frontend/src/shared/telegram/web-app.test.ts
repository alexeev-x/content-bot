import { afterEach, describe, expect, it } from 'vitest';
import { isInsideTelegram } from './web-app';

afterEach(() => {
  delete (window as unknown as { Telegram?: unknown }).Telegram;
});

describe('telegram wrapper', () => {
  it('is false outside Telegram', () => {
    expect(isInsideTelegram()).toBe(false);
  });
  it('is false with empty initData', () => {
    (window as unknown as { Telegram: unknown }).Telegram = { WebApp: { initData: '' } };
    expect(isInsideTelegram()).toBe(false);
  });
  it('is true with non-empty initData', () => {
    (window as unknown as { Telegram: unknown }).Telegram = { WebApp: { initData: 'query_id=1&hash=x' } };
    expect(isInsideTelegram()).toBe(true);
  });
});
