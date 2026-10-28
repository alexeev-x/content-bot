import { GrammyError } from 'grammy';
import { describe, expect, it } from 'vitest';
import { boundDetail, describeError, detailFromBody, readErrorDetail, redactSecrets } from './error-detail';

// A redaction mistake leaks a secret into the owner's chat and the logs, so every secret shape is pinned here.
describe('redactSecrets', () => {
  it.each([
    ['bot token in a Bot API path', 'Not Found: /bot123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw9/sendMessage'],
    ['OpenAI key', 'Incorrect API key provided: sk-proj-abcdEFGH1234567890xyz'],
    ['Bearer header', 'sent Authorization: Bearer abc.def-ghi_jkl123'],
    ['query key', 'GET https://www.googleapis.com/youtube/v3/videos?part=id&key=AIzaSyA1234567890abcdef failed'],
    ['initData', 'bad initData=query_id%3DAAH&hash=0f1e2d3c'],
    ['JWT', 'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJlMTIz rejected'],
    ['long opaque key', 'key 0123456789abcdef0123456789abcdef0123 unknown']
  ])('hides a %s', (_name, input) => {
    const out = redactSecrets(input);
    expect(out).toContain('скрыто');
    expect(out).not.toMatch(/AAHdqTcv|abcdEFGH1234|abc\.def-ghi|AIzaSyA|0f1e2d3c|c2lnbmF0dXJl|0123456789abcdef0123/);
  });

  it('keeps a UUID and plain words readable', () => {
    const text = 'job 3f2a9c1e-1b2c-4d5e-8f90-123456789abc: Bad Request: message is too long';
    expect(redactSecrets(text)).toBe(text);
  });
});

describe('boundDetail', () => {
  it('collapses whitespace, strips tags and stays within the limit', () => {
    const out = boundDetail(`<html><body>${'x '.repeat(400)}</body></html>`, 300);
    expect(out.length).toBeLessThanOrEqual(300);
    expect(out).not.toContain('<');
  });
});

describe('detailFromBody', () => {
  it('reads OpenAI, GraphQL and plain shapes', () => {
    expect(
      detailFromBody(
        '{"error":{"code":"invalid_api_key","message":"Incorrect API key provided: sk-proj-abcdefgh1234"}}'
      )
    ).toBe('invalid_api_key: Incorrect API key provided: [скрыто]');
    expect(detailFromBody('{"errors":[{"message":"Field x is unknown"}]}')).toBe('Field x is unknown');
    expect(detailFromBody('upstream timed out')).toBe('upstream timed out');
  });
});

describe('readErrorDetail', () => {
  it('reads a bounded part of a failed response and never throws', async () => {
    const response = new Response(`{"message":"${'a b '.repeat(2000)}"}`, { status: 500 });
    const detail = await readErrorDetail(response);
    expect((detail ?? '').length).toBeLessThanOrEqual(300);
    expect(await readErrorDetail(new Response(null, { status: 500 }))).toBeUndefined();
  });
});

describe('describeError', () => {
  it('names the API, the step, the code, the status and the provider text', () => {
    const error = new GrammyError(
      { message: 'x', method: 'sendRichMessage' } as never,
      { ok: false, error_code: 400, description: "Bad Request: can't parse rich message" },
      'sendRichMessage',
      {}
    );
    expect(describeError(error)).toBe(
      "Telegram sendRichMessage: TELEGRAM_API, HTTP 400 — Bad Request: can't parse rich message"
    );
  });

  it('uses the error code, status and detail of an integration error, with secrets removed', () => {
    class StratzError extends Error {
      constructor(
        readonly code: string,
        readonly httpStatus: number | null,
        readonly detail?: string
      ) {
        super(code);
        this.name = 'StratzError';
      }
    }
    const line = describeError(
      new StratzError('STRATZ_HTTP', 502, boundDetail('Bearer abcdef123456 bad gateway')),
      'heroStats'
    );
    expect(line).toBe('STRATZ heroStats: STRATZ_HTTP, HTTP 502 — Bearer [скрыто] bad gateway');
  });
});
