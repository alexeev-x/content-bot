import { describe, expect, it } from 'vitest';
import { parseMessageRef } from '../model/message-ref';

describe('parseMessageRef', () => {
  it.each([
    ['4821', undefined, '4821'],
    ['  4821  ', undefined, '4821'],
    ['https://t.me/alexeev_chan/4821', undefined, '4821'],
    ['http://t.me/alexeev_chan/4821?single', undefined, '4821'],
    ['t.me/alexeev_chan/4821', undefined, '4821'],
    ['https://t.me/alexeev_chan/4821/', '@alexeev_chan', '4821'],
    ['https://t.me/Alexeev_Chan/4821', '@alexeev_chan', '4821'],
    ['t.me/c/1234567890/55', undefined, '55'],
    ['https://t.me/c/1234567890/55', '-1001234567890', '55']
  ])('accepts %s', (input, chatId, id) => {
    expect(parseMessageRef(input, chatId)).toEqual({ ok: true, id });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['0', 'format'],
    ['012', 'format'],
    ['12345678901234567', 'format'],
    ['-5', 'format'],
    ['abc', 'format'],
    ['https://example.com/alexeev_chan/12', 'format'],
    ['https://t.me/alexeev_chan', 'format'],
    ['https://t.me/alexeev_chan/abc', 'format'],
    ['https://t.me/c/abc/12', 'format'],
    ['javascript://t.me/a/1', 'format']
  ])('refuses %j as %s', (input, reason) => {
    expect(parseMessageRef(input)).toEqual({ ok: false, reason });
  });

  it('refuses a link into another channel when the chat id is known', () => {
    expect(parseMessageRef('https://t.me/other_chan/12', '@alexeev_chan')).toEqual({ ok: false, reason: 'channel' });
    expect(parseMessageRef('t.me/c/999/12', '-1001234567890')).toEqual({ ok: false, reason: 'channel' });
  });
});
