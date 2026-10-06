import { describe, expect, it } from 'vitest';
import { escapeHtml, formatPublicationText, TELEGRAM_TEXT_MAX } from './format-message';

describe('formatPublicationText', () => {
  it('puts the title in bold, a blank line, then the body', () => {
    expect(formatPublicationText({ title: 'Patch 7.40', body: 'Heroes changed.' })).toEqual({
      ok: true,
      html: '<b>Patch 7.40</b>\n\nHeroes changed.'
    });
  });

  it('sends only the title when the body is empty', () => {
    expect(formatPublicationText({ title: 'Just a title', body: '  ' })).toEqual({
      ok: true,
      html: '<b>Just a title</b>'
    });
  });

  it('escapes &, <, > and quotes in both parts, so user text never becomes markup', () => {
    expect(formatPublicationText({ title: 'A & B <i>', body: '1 < 2 > 0 "x"' })).toEqual({
      ok: true,
      html: '<b>A &amp; B &lt;i&gt;</b>\n\n1 &lt; 2 &gt; 0 &quot;x&quot;'
    });
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });

  it('counts the parsed text, not the markup: a limit-sized message full of escapes is still valid', () => {
    const body = '&'.repeat(TELEGRAM_TEXT_MAX - 'T'.length - 2);

    const result = formatPublicationText({ title: 'T', body });

    expect(result.ok).toBe(true);
  });

  it('refuses text over 4096 characters after parsing', () => {
    const body = 'x'.repeat(TELEGRAM_TEXT_MAX - 'T'.length - 2 + 1);

    expect(formatPublicationText({ title: 'T', body })).toEqual({ ok: false, reason: 'TOO_LONG' });
  });

  it('refuses a message with nothing to send', () => {
    expect(formatPublicationText({ title: ' ', body: '' })).toEqual({ ok: false, reason: 'EMPTY' });
  });
});
