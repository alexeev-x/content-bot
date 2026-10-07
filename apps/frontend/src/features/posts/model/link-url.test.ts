import { describe, expect, it } from 'vitest';
import { normalizeLinkUrl, parseLinkInput } from './link-url';

describe('normalizeLinkUrl', () => {
  it.each([
    ['https://example.com', 'https://example.com/'],
    ['  http://Example.com/a b  ', 'http://example.com/a%20b'],
    ['tg://resolve?domain=durov', 'tg://resolve?domain=durov'],
    ['https://пример.рф/путь', 'https://xn--e1afmkfd.xn--p1ai/%D0%BF%D1%83%D1%82%D1%8C']
  ])('turns %s into %s', (input, output) => {
    expect(normalizeLinkUrl(input)).toBe(output);
  });

  it.each([
    '',
    'example.com',
    'javascript:alert(1)',
    'ftp://example.com',
    'mailto:a@b.c',
    'http://',
    `https://a.example/${'a'.repeat(2100)}`
  ])('refuses %s', (input) => {
    expect(normalizeLinkUrl(input)).toBeNull();
  });
});

describe('parseLinkInput', () => {
  it('adds https:// to an address typed without a scheme', () => {
    expect(parseLinkInput(' example.com/a ')).toEqual({ ok: true, href: 'https://example.com/a' });
  });

  it('keeps tg:// and http:// addresses', () => {
    expect(parseLinkInput('tg://resolve?domain=x')).toEqual({ ok: true, href: 'tg://resolve?domain=x' });
    expect(parseLinkInput('http://a.example')).toEqual({ ok: true, href: 'http://a.example/' });
  });

  it('says why an address is refused', () => {
    expect(parseLinkInput('  ')).toEqual({ ok: false, reason: 'required' });
    expect(parseLinkInput('javascript:alert(1)')).toEqual({ ok: false, reason: 'invalid' });
    expect(parseLinkInput('ftp://a.example')).toEqual({ ok: false, reason: 'invalid' });
    expect(parseLinkInput('https://a b')).toEqual({ ok: false, reason: 'invalid' });
    expect(parseLinkInput(`https://a.example/${'a'.repeat(2100)}`)).toEqual({ ok: false, reason: 'too_long' });
  });
});
