import type { PostEntity } from '@alexeev/contracts';
import { describe, expect, it } from 'vitest';
import { formatPublicationText, TELEGRAM_TEXT_MAX } from './format-message';

const plain = (body: string) => ({ body, entities: [] as PostEntity[] });

describe('formatPublicationText', () => {
  it('never adds a title line: a post with a stored title still sends only its body (owner, 31.10.2026)', () => {
    const post = { title: 'Переводчик с токсичного', body: 'Heroes changed.', entities: [] as PostEntity[] };

    expect(formatPublicationText(post)).toEqual({ ok: true, text: 'Heroes changed.', entities: [] });
  });

  it('keeps <, >, & and quotes as plain characters: no parse mode, so nothing to escape', () => {
    expect(formatPublicationText(plain('1 < 2 > 0 "x" & <i>'))).toEqual({
      ok: true,
      text: '1 < 2 > 0 "x" & <i>',
      entities: []
    });
  });

  it('keeps the body entities where they are', () => {
    expect(
      formatPublicationText({
        body: 'Hello bold world',
        entities: [
          { type: 'bold', offset: 6, length: 4 },
          { type: 'text_link', offset: 11, length: 5, url: 'https://example.com/' }
        ]
      })
    ).toEqual({
      ok: true,
      text: 'Hello bold world',
      entities: [
        { type: 'bold', offset: 6, length: 4 },
        { type: 'text_link', offset: 11, length: 5, url: 'https://example.com/' }
      ]
    });
  });

  it('counts surrogate pairs as two units before an entity', () => {
    // "😀" is two UTF-16 units: the entity sits after "a😀" (3 units).
    const result = formatPublicationText({ body: 'a😀b😀', entities: [{ type: 'italic', offset: 3, length: 3 }] });

    expect(result).toEqual({ ok: true, text: 'a😀b😀', entities: [{ type: 'italic', offset: 3, length: 3 }] });
    if (result.ok) expect(result.text.slice(3, 6)).toBe('b😀');
  });

  it('moves body entities left by the leading whitespace that trimming removes', () => {
    expect(
      formatPublicationText({ body: '  \n  bold text', entities: [{ type: 'bold', offset: 5, length: 4 }] })
    ).toEqual({
      ok: true,
      text: 'bold text',
      entities: [{ type: 'bold', offset: 0, length: 4 }]
    });
  });

  it('clips an entity that reaches into trimmed whitespace and drops one that covers only whitespace', () => {
    const result = formatPublicationText({
      body: '  ab cd  \n',
      entities: [
        { type: 'italic', offset: 0, length: 5 },
        { type: 'underline', offset: 6, length: 4 },
        { type: 'strikethrough', offset: 0, length: 2 },
        { type: 'spoiler', offset: 8, length: 2 }
      ]
    });

    expect(result).toEqual({
      ok: true,
      text: 'ab cd',
      entities: [
        { type: 'italic', offset: 0, length: 3 },
        { type: 'underline', offset: 4, length: 1 }
      ]
    });
  });

  it('counts the text, not the entities: a limit-sized message full of special characters is still valid', () => {
    expect(formatPublicationText(plain('&'.repeat(TELEGRAM_TEXT_MAX))).ok).toBe(true);
  });

  it('refuses text over 4096 characters', () => {
    expect(formatPublicationText(plain('x'.repeat(TELEGRAM_TEXT_MAX + 1)))).toEqual({ ok: false, reason: 'TOO_LONG' });
  });

  it('refuses a message with nothing to send, whatever the title', () => {
    const post = { title: 'Only a title', body: ' ', entities: [] as PostEntity[] };

    expect(formatPublicationText(post)).toEqual({
      ok: false,
      reason: 'EMPTY'
    });
  });

  it('refuses stored entities that do not fit the body, before anything is sent', () => {
    expect(formatPublicationText({ body: 'abc', entities: [{ type: 'bold', offset: 2, length: 5 }] })).toEqual({
      ok: false,
      reason: 'ENTITIES_INVALID'
    });
  });
});
