import { GrammyError, HttpError } from 'grammy';
import { describe, expect, it } from 'vitest';
import { classifySendResult, classifyTelegramError } from './classify-telegram-result';

function apiError(error_code: number, description: string, parameters: Record<string, number> = {}) {
  return new GrammyError(description, { ok: false, error_code, description, parameters }, 'sendMessage', {
    chat_id: '-100'
  });
}

describe('classifyTelegramError', () => {
  it('429 with retry_after is rate_limited', () => {
    expect(classifyTelegramError(apiError(429, 'Too Many Requests: retry after 7', { retry_after: 7 }))).toMatchObject({
      kind: 'rate_limited',
      retryAfterSec: 7
    });
  });

  it('429 without retry_after is still a refusal: rate_limited with a conservative wait (review 24.10.2026)', () => {
    expect(classifyTelegramError(apiError(429, 'Too Many Requests'))).toMatchObject({
      kind: 'rate_limited',
      retryAfterSec: 30
    });
  });

  it('413 is a definite refusal of a too large upload', () => {
    expect(classifyTelegramError(apiError(413, 'Request Entity Too Large'))).toMatchObject({
      kind: 'rejected',
      code: 'CONTENT_INVALID'
    });
  });

  it('400 with migrate_to_chat_id is CHAT_MIGRATED', () => {
    const error = apiError(400, 'Bad Request: group chat was upgraded to a supergroup chat', {
      migrate_to_chat_id: -1001234567890
    });
    expect(classifyTelegramError(error)).toMatchObject({ kind: 'rejected', code: 'CHAT_MIGRATED' });
  });

  it.each([
    'Bad Request: message text is empty',
    "Bad Request: can't parse entities: Unsupported start tag",
    'Bad Request: message caption is too long',
    'Bad Request: message is too long'
  ])('400 "%s" is CONTENT_INVALID', (description) => {
    expect(classifyTelegramError(apiError(400, description))).toMatchObject({
      kind: 'rejected',
      code: 'CONTENT_INVALID'
    });
  });

  it('400 chat not found is DESTINATION_UNAVAILABLE', () => {
    expect(classifyTelegramError(apiError(400, 'Bad Request: chat not found'))).toMatchObject({
      kind: 'rejected',
      code: 'DESTINATION_UNAVAILABLE'
    });
  });

  it.each([
    'Bad Request: not enough rights to send text messages to the chat',
    'Bad Request: need administrator rights in the channel chat'
  ])('400 permission problem "%s" is DESTINATION_UNAVAILABLE, not CONTENT_INVALID', (description) => {
    expect(classifyTelegramError(apiError(400, description))).toMatchObject({
      kind: 'rejected',
      code: 'DESTINATION_UNAVAILABLE'
    });
  });

  it('403 is DESTINATION_UNAVAILABLE', () => {
    expect(classifyTelegramError(apiError(403, 'Forbidden: bot was kicked from the channel chat'))).toMatchObject({
      kind: 'rejected',
      code: 'DESTINATION_UNAVAILABLE'
    });
  });

  it.each([
    [401, 'Unauthorized'],
    [404, 'Not Found']
  ])('%i from the Bot API means the token is wrong: BOT_UNAUTHORIZED, a definite refusal', (code, description) => {
    expect(classifyTelegramError(apiError(code, description))).toMatchObject({
      kind: 'rejected',
      code: 'BOT_UNAUTHORIZED'
    });
  });

  it('an unrecognised 400 is a definite content rejection', () => {
    expect(classifyTelegramError(apiError(400, 'Bad Request: something new'))).toMatchObject({
      kind: 'rejected',
      code: 'CONTENT_INVALID'
    });
  });

  it.each([500, 502, 503])('%i is unknown', (code) => {
    expect(classifyTelegramError(apiError(code, 'Internal Server Error'))).toMatchObject({
      kind: 'unknown',
      reason: `telegram_http_${code}`
    });
  });

  it('HttpError (network failure) is unknown', () => {
    expect(classifyTelegramError(new HttpError('Network request failed', new Error('boom')))).toMatchObject({
      kind: 'unknown',
      reason: 'network_error'
    });
  });

  it.each(['TimeoutError', 'AbortError'])('%s is unknown with reason timeout', (name) => {
    const error = new Error('aborted');
    error.name = name;
    expect(classifyTelegramError(error)).toMatchObject({ kind: 'unknown', reason: 'timeout' });
  });

  it('anything else is unknown', () => {
    expect(classifyTelegramError('weird')).toMatchObject({ kind: 'unknown', reason: 'unexpected_error' });
  });

  it('classifies a definite Telegram 400 for an unrecognized media error as a rejected content send', () => {
    expect(
      classifyTelegramError(
        new GrammyError(
          'wrong media type',
          {
            ok: false,
            error_code: 400,
            description: 'wrong media type',
            parameters: {}
          },
          'sendMediaGroup',
          { chat_id: '1' }
        )
      )
    ).toMatchObject({ kind: 'rejected', code: 'CONTENT_INVALID' });
  });
});

describe('classifySendResult', () => {
  it.each([1, Number.MAX_SAFE_INTEGER])('positive safe integer message_id %i is sent', (id) => {
    expect(classifySendResult({ message_id: id })).toEqual({
      kind: 'sent',
      externalMessageIds: [String(id)]
    });
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity])('invalid message_id %s is unknown', (id) => {
    expect(classifySendResult({ message_id: id })).toEqual({ kind: 'unknown', reason: 'ok_without_message_id' });
  });

  it('a message with message_id is sent', () => {
    expect(classifySendResult({ message_id: 55, chat: { id: 1 } })).toEqual({
      kind: 'sent',
      externalMessageIds: ['55']
    });
  });

  it.each([[undefined], [null], [{}], [{ message_id: 'x' }], [true]])('%j is unknown, not sent', (result) => {
    expect(classifySendResult(result)).toEqual({ kind: 'unknown', reason: 'ok_without_message_id' });
  });
});
