import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  destination,
  errorBody,
  ids,
  post,
  postPage,
  postWith,
  publication,
  publicationPage
} from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { fetchCalendarData, CalendarRangeTooDenseError } from '../api/calendar-api';

setupMswServer();

const range = { from: '2026-10-07T00:00:00.000Z', to: '2026-10-08T00:00:00.000Z' };

describe('fetchCalendarData', () => {
  it('loads every cursor page, applies half-open client boundaries and keeps unscheduled posts independent of destination', async () => {
    const requestBounds: Array<{ limit: string | null; from: string | null; to: string | null }> = [];
    server.use(
      http.get('*/api/v1/publications', ({ request }) => {
        const url = new URL(request.url);
        requestBounds.push({
          limit: url.searchParams.get('limit'),
          from: url.searchParams.get('from'),
          to: url.searchParams.get('to')
        });
        if (url.searchParams.get('cursor'))
          return HttpResponse.json(
            publicationPage([publication({ id: '33333333-3333-4333-8333-444444444444', scheduledAt: range.to })])
          );
        return HttpResponse.json(
          publicationPage(
            [publication({ scheduledAt: range.from }), publication({ scheduledAt: '2026-10-06T23:59:59.999Z' })],
            { nextCursor: 'next' }
          )
        );
      }),
      http.get('*/api/v1/posts', ({ request }) => {
        const status = new URL(request.url).searchParams.get('status');
        return HttpResponse.json(
          status === 'approved'
            ? postPage([
                postWith({ scheduled: 1 }, { title: 'Пост с публикацией' }),
                postWith(
                  { unknown: 1 },
                  { id: '11111111-1111-4111-8111-333333333333', status: 'approved', title: 'Не планировать' }
                ),
                postWith({}, { id: ids.post2, status: 'approved', title: 'Свободный пост' })
              ])
            : postPage([post({ title: 'Черновик' })])
        );
      }),
      http.get('*/api/v1/destinations', () => HttpResponse.json({ items: [destination()], nextCursor: null }))
    );

    const result = await fetchCalendarData(range);
    expect(requestBounds).toEqual(
      Array.from({ length: 2 }, () => ({
        limit: '100',
        from: '2026-10-06T23:59:59.999Z',
        to: '2026-10-08T00:00:00.001Z'
      }))
    );
    expect(result.publications).toHaveLength(1);
    expect(result.publications[0]?.scheduledAt).toBe(range.from);
    expect(result.posts.map((item) => item.title)).toEqual([
      'Черновик',
      'Пост с публикацией',
      'Не планировать',
      'Свободный пост'
    ]);
    expect(result.unscheduledPosts.map((item) => item.title)).toEqual(['Черновик', 'Свободный пост']);
    expect(result.destinations).toHaveLength(1);
  });

  it('fails closed when a collection still has a cursor after page ten', async () => {
    let requests = 0;
    server.use(
      http.get('*/api/v1/publications', () => {
        requests += 1;
        return HttpResponse.json(publicationPage([], { nextCursor: `cursor-${requests}` }));
      })
    );

    await expect(fetchCalendarData(range)).rejects.toBeInstanceOf(CalendarRangeTooDenseError);
    expect(requests).toBe(10);
  });

  it('rejects the complete collection when any requested page fails', async () => {
    server.use(http.get('*/api/v1/publications', () => HttpResponse.json(errorBody('UNAVAILABLE'), { status: 503 })));
    await expect(fetchCalendarData(range)).rejects.toMatchObject({ status: 503, requestId: 'req-test-1' });
  });
});
