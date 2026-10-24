import type { PostEntity } from '@alexeev/contracts';
import { describe, expect, it } from 'vitest';
import { formatPublicationText, TELEGRAM_TEXT_MAX } from './format-message';

const plain = (title: string, body: string) => ({ title, body, entities: [] as PostEntity[] });

describe('formatPublicationText', () => {
  it('puts the title in bold, a blank line, then the body', () => {
    expect(formatPublicationText(plain('Patch 7.40', 'Heroes changed.'))).toEqual({
      ok: true,
      text: 'Patch 7.40\n\nHeroes changed.',
      entities: [{ type: 'bold', offset: 0, length: 10 }]
    });
  });

  it('sends only the title when the body is empty', () => {
    expect(formatPublicationText(plain('Just a title', '  '))).toEqual({
      ok: true,
      text: 'Just a title',
      entities: [{ type: 'bold', offset: 0, length: 12 }]
    });
  });

  it('keeps <, >, & and quotes as plain characters: no parse mode, so nothing to escape', () => {
    expect(formatPublicationText(plain('A & B <i>', '1 < 2 > 0 "x"'))).toEqual({
      ok: true,
      text: 'A & B <i>\n\n1 < 2 > 0 "x"',
      entities: [{ type: 'bold', offset: 0, length: 9 }]
    });
  });

  it('shifts the body entities past the title and the blank line', () => {
    const result = formatPublicationText({
      title: 'Title',
      body: 'Hello bold world',
      entities: [
        { type: 'bold', offset: 6, length: 4 },
        { type: 'text_link', offset: 11, length: 5, url: 'https://example.com/' }
      ]
    });

    expect(result).toEqual({
      ok: true,
      text: 'Title\n\nHello bold world',
      entities: [
        { type: 'bold', offset: 0, length: 5 },
        { type: 'bold', offset: 13, length: 4 },
        { type: 'text_link', offset: 18, length: 5, url: 'https://example.com/' }
      ]
    });
  });

  it('counts surrogate pairs as two units, in the title and before an entity', () => {
    // "😀" is two UTF-16 units: the title is 3 units long, the entity sits after "a😀" (3 units) in the body.
    const result = formatPublicationText({
      title: '😀a',
      body: 'a😀b😀',
      entities: [{ type: 'italic', offset: 3, length: 3 }]
    });

    expect(result).toEqual({
      ok: true,
      text: '😀a\n\na😀b😀',
      entities: [
        { type: 'bold', offset: 0, length: 3 },
        { type: 'italic', offset: 8, length: 3 }
      ]
    });
    if (result.ok) expect(result.text.slice(8, 11)).toBe('b😀');
  });

  it('moves body entities left by the leading whitespace that trimming removes', () => {
    const result = formatPublicationText({
      title: 'T',
      body: '  \n  bold text',
      entities: [{ type: 'bold', offset: 5, length: 4 }]
    });

    expect(result).toEqual({
      ok: true,
      text: 'T\n\nbold text',
      entities: [
        { type: 'bold', offset: 0, length: 1 },
        { type: 'bold', offset: 3, length: 4 }
      ]
    });
  });

  it('clips an entity that reaches into trimmed whitespace and drops one that covers only whitespace', () => {
    const result = formatPublicationText({
      title: 'T',
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
      text: 'T\n\nab cd',
      entities: [
        { type: 'bold', offset: 0, length: 1 },
        { type: 'italic', offset: 3, length: 3 },
        { type: 'underline', offset: 7, length: 1 }
      ]
    });
  });

  it('sends a body without a title entity shift when the title is empty', () => {
    expect(
      formatPublicationText({ title: ' ', body: 'x', entities: [{ type: 'code', offset: 0, length: 1 }] })
    ).toEqual({
      ok: true,
      text: 'x',
      entities: [{ type: 'code', offset: 0, length: 1 }]
    });
  });

  it('sends only the body of a post without a title in its message, its entities unshifted (owner, 16.10.2026)', () => {
    expect(
      formatPublicationText({
        title: 'Если бы тиммейтов можно было денаить',
        titleInMessage: false,
        body: 'Если бы тиммейтов можно было денаить, я бы до врагов не доходил))',
        entities: [{ type: 'italic', offset: 3, length: 4 }]
      })
    ).toEqual({
      ok: true,
      text: 'Если бы тиммейтов можно было денаить, я бы до врагов не доходил))',
      entities: [{ type: 'italic', offset: 3, length: 4 }]
    });
  });

  it('a post with no entities reads exactly as before: same visible text, bold title', () => {
    const result = formatPublicationText(plain('Old post', 'Written before entities existed.'));

    expect(result).toEqual({
      ok: true,
      text: 'Old post\n\nWritten before entities existed.',
      entities: [{ type: 'bold', offset: 0, length: 8 }]
    });
  });

  it('counts the text, not the entities: a limit-sized message full of special characters is still valid', () => {
    const body = '&'.repeat(TELEGRAM_TEXT_MAX - 'T'.length - 2);

    expect(formatPublicationText(plain('T', body)).ok).toBe(true);
  });

  it('refuses text over 4096 characters', () => {
    const body = 'x'.repeat(TELEGRAM_TEXT_MAX - 'T'.length - 2 + 1);

    expect(formatPublicationText(plain('T', body))).toEqual({ ok: false, reason: 'TOO_LONG' });
  });

  it('refuses a message with nothing to send', () => {
    expect(formatPublicationText(plain(' ', ''))).toEqual({ ok: false, reason: 'EMPTY' });
  });

  it('refuses stored entities that do not fit the body, before anything is sent', () => {
    expect(
      formatPublicationText({ title: 'T', body: 'abc', entities: [{ type: 'bold', offset: 2, length: 5 }] })
    ).toEqual({ ok: false, reason: 'ENTITIES_INVALID' });
  });
});
