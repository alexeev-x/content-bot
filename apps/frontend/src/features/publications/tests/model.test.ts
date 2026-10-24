import { publicationStatusSchema } from '@alexeev/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../shared/api/http-client';
import { formatShort, utcOffsetLabel } from '../model/format-time';
import { describeActionError, explainErrorCode } from '../model/publication-errors';
import { buildTimeline } from '../model/publication-timeline';
import { displayStatus, isInProgress, messageLink, pipelineFor } from '../model/publication-view';
import { publication } from '../../../test/fixtures';

describe('displayStatus', () => {
  it('keeps «sent» only with a message id; a bare sent needs a check', () => {
    expect(displayStatus({ status: 'sent', externalMessageId: '1' })).toBe('sent');
    expect(displayStatus({ status: 'sent' })).toBe('unknown');
    expect(displayStatus({ status: 'queued', externalMessageId: '1' })).toBe('queued');
  });
});

describe('isInProgress', () => {
  it('is true exactly for the statuses that can still change by themselves', () => {
    const active = ['scheduled', 'queued', 'preparing', 'sending', 'retry_wait'];
    for (const status of publicationStatusSchema.options) {
      expect(isInProgress(status), status).toBe(active.includes(status));
    }
  });
});

describe('messageLink', () => {
  it('builds t.me links for a public username and for a private -100 chat', () => {
    expect(messageLink('@alexeev_chan', '42')).toBe('https://t.me/alexeev_chan/42');
    expect(messageLink('-1001234567890', '42')).toBe('https://t.me/c/1234567890/42');
  });
  it('returns nothing when the chat or the id cannot form a safe link', () => {
    expect(messageLink('-12345', '42')).toBeUndefined();
    expect(messageLink('@alexeev_chan', '4/2')).toBeUndefined();
    expect(messageLink('@alexeev_chan', '')).toBeUndefined();
  });
});

describe('pipelineFor', () => {
  it('always has four stages and a single current one while in progress', () => {
    for (const status of publicationStatusSchema.options) {
      const steps = pipelineFor(status);
      expect(steps.map((step) => step.id)).toEqual(['scheduled', 'queued', 'sending', 'result']);
      expect(steps.filter((step) => step.state === 'current').length).toBeLessThanOrEqual(1);
    }
    expect(pipelineFor('queued').map((step) => step.state)).toEqual(['done', 'current', 'upcoming', 'upcoming']);
    expect(pipelineFor('unknown')[3]?.state).toBe('final');
    expect(pipelineFor('cancelled').map((step) => step.state)).toEqual(['done', 'skipped', 'skipped', 'final']);
  });
});

describe('time formatting', () => {
  it('prints the UTC offset of the zone at that instant, including half hours and DST', () => {
    expect(utcOffsetLabel(new Date('2026-10-07T09:00:00Z'), 'Europe/Moscow')).toBe('UTC+3');
    expect(utcOffsetLabel(new Date('2026-10-07T09:00:00Z'), 'Asia/Kolkata')).toBe('UTC+5:30');
    expect(utcOffsetLabel(new Date('2026-07-01T09:00:00Z'), 'Europe/Chisinau')).toBe('UTC+3');
    expect(utcOffsetLabel(new Date('2026-01-01T09:00:00Z'), 'Europe/Chisinau')).toBe('UTC+2');
    expect(utcOffsetLabel(new Date('2026-10-07T09:00:00Z'), 'UTC')).toBe('UTC');
  });
  it('prints a zero offset as UTC even when ICU spells it GMT+00:00', () => {
    const spy = vi
      .spyOn(Intl.DateTimeFormat.prototype, 'formatToParts')
      .mockReturnValue([{ type: 'timeZoneName', value: 'GMT+00:00' }]);
    try {
      expect(utcOffsetLabel(new Date('2026-10-07T09:00:00Z'), 'UTC')).toBe('UTC');
    } finally {
      spy.mockRestore();
    }
  });
  it('formats in the explicit zone, not the machine zone', () => {
    expect(formatShort('2026-10-07T21:30:00Z', 'Asia/Tokyo')).toContain('06:30');
  });
});

describe('describeActionError', () => {
  const api = (status: number, code: ApiError['code'], reason?: string) =>
    new ApiError({ status, code, message: 'x', requestId: 'req-9', ...(reason ? { details: { reason } } : {}) });

  it('treats an unavailable create as unconfirmed and an unavailable cancel as a plain failure', () => {
    expect(describeActionError(api(503, 'UNAVAILABLE'), 'create').title).toMatch(/создана ли публикация/);
    expect(describeActionError(api(503, 'UNAVAILABLE'), 'cancel').title).toBe('Сервис недоступен');
  });
  it('carries the request id and a conflict tone for stale revisions', () => {
    const described = describeActionError(api(409, 'CONFLICT', 'STALE_REVISION'), 'reschedule');
    expect(described).toMatchObject({ tone: 'conflict', requestId: 'req-9' });
  });
  it('falls back to a generic message for anything else', () => {
    expect(describeActionError(new Error('boom'), 'create').title).toBe('Не удалось выполнить действие');
  });
});

describe('explainErrorCode', () => {
  it('explains known codes and does not echo prototype keys or unknown codes as text', () => {
    expect(explainErrorCode('RATE_LIMITED')).toMatch(/Telegram временно ограничил/);
    expect(explainErrorCode('constructor')).toBe('Причина не расшифрована.');
    expect(explainErrorCode('SOMETHING_NEW')).toBe('Причина не расшифрована.');
  });
});

describe('buildTimeline', () => {
  it('lists only what the DTO proves, oldest first, and adds the message id for a confirmed send', () => {
    const items = buildTimeline(
      publication({
        status: 'sent',
        externalMessageId: '77',
        createdAt: '2026-10-06T09:00:00.000Z',
        scheduledAt: '2026-10-07T09:00:00.000Z',
        updatedAt: '2026-10-07T09:00:05.000Z'
      }),
      'UTC'
    );
    expect(items.map((item) => item.id)).toEqual(['created', 'scheduled', 'latest']);
    expect(items[2]).toMatchObject({ status: 'sent', description: 'Сообщение № 77' });
  });
  it('has no outcome entry while the publication is only scheduled', () => {
    expect(buildTimeline(publication(), 'UTC').map((item) => item.id)).toEqual(['created', 'scheduled']);
  });
});
