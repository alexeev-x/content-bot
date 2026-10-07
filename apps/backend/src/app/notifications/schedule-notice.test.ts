import { describe, expect, it } from 'vitest';
import { formatScheduleNotice, formatScheduledTime, type ScheduleNoticeInput } from './schedule-notice';

const PUBLICATION_ID = '5d4f8a7e-3b6c-4e2a-9f10-1a2b3c4d5e6f';
// 2026-10-17 11:30 UTC = 14:30 in Moscow (UTC+3, no DST).
const AT = Date.UTC(2026, 9, 17, 11, 30);

const base: ScheduleNoticeInput = {
  kind: 'scheduled',
  post: { title: 'Patch 7.40', body: 'Body' },
  channelTitle: 'Main channel',
  scheduledAt: AT,
  timezone: 'Europe/Moscow',
  publicationId: PUBLICATION_ID,
  appOrigin: 'https://studio.example.dev'
};

describe('formatScheduleNotice', () => {
  it('names the post, the channel and the time in the owner zone, with a deep link button', () => {
    const notice = formatScheduleNotice(base);

    expect(notice.html).toBe(
      [
        '<b>Публикация запланирована</b>',
        'Пост: Patch 7.40',
        'Канал: Main channel',
        'Время: 17 октября 2026 г., 14:30 (Europe/Moscow)'
      ].join('\n')
    );
    expect(notice.button).toEqual({
      text: 'Подробнее',
      url: `https://studio.example.dev/publications?id=${PUBLICATION_ID}`
    });
  });

  it('says the publication was moved to the new time', () => {
    const notice = formatScheduleNotice({ ...base, kind: 'rescheduled' });

    expect(notice.html).toContain('<b>Публикация перенесена</b>');
    expect(notice.html).toContain('Перенесена на: 17 октября 2026 г., 14:30 (Europe/Moscow)');
  });

  it('escapes post and channel text so it can never become markup', () => {
    const notice = formatScheduleNotice({
      ...base,
      post: { title: '<b>Hack</b> & "co"', body: '' },
      channelTitle: '<a href="x">chan</a>'
    });

    expect(notice.html).toContain('Пост: &lt;b&gt;Hack&lt;/b&gt; &amp; &quot;co&quot;');
    expect(notice.html).toContain('Канал: &lt;a href=&quot;x&quot;&gt;chan&lt;/a&gt;');
    expect(notice.html.match(/<[^>]+>/g)).toEqual(['<b>', '</b>']);
  });

  it('uses the start of the text when the post has no title, clipped to one line', () => {
    const body = `<i>${'word '.repeat(60)}`;
    const notice = formatScheduleNotice({ ...base, post: { title: '  ', body } });
    const line = notice.html.split('\n')[1] ?? '';

    expect(line.startsWith('Пост: &lt;i&gt;word word')).toBe(true);
    expect(line.endsWith('…')).toBe(true);
    expect(line.length).toBeLessThan(180);
  });

  it('falls back to a neutral label when the post or channel is gone', () => {
    const notice = formatScheduleNotice({ ...base, post: null, channelTitle: null });

    expect(notice.html).toContain('Пост: Без названия');
    expect(notice.html).toContain('Канал: Без названия');
  });
});

describe('formatScheduledTime', () => {
  it('shows the same instant in the zone it was scheduled in', () => {
    expect(formatScheduledTime(AT, 'Asia/Tokyo')).toBe('17 октября 2026 г., 20:30 (Asia/Tokyo)');
  });

  it('shows UTC, labelled as such, for a zone the runtime does not know', () => {
    expect(formatScheduledTime(AT, 'Not/AZone')).toBe('17 октября 2026 г., 11:30 (UTC)');
  });
});
