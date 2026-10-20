import type { ContentItemDto, ContentRubricsDto } from '@alexeev/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken, errorBody } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { createTestQueryClient } from '../../../test/query-wrapper';
import { rubricStats } from '../model/rubrics';
import { PostRubricSelect } from '../ui/PostRubricSelect';
import { RubricsSettings } from '../ui/RubricsSettings';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});
afterEach(cleanup);

const AT = Date.parse('2026-10-20T12:00:00.000Z');
const HOUR = 3_600_000;
const VERDICT = '00000000-0000-4000-8000-0000000000b1';
const FIDIT = '00000000-0000-4000-8000-0000000000b2';
const POST = '00000000-0000-4000-8000-0000000000c1';

let next = 0;
function post(views: number, hoursAgo: number): ContentItemDto {
  next += 1;
  const published = new Date(AT - hoursAgo * HOUR).toISOString();
  return {
    id: `telegram:${next}`,
    platform: 'telegram',
    title: `Пост ${next}`,
    url: 'https://t.me/x/1',
    thumbnailUrl: null,
    publishedAt: published,
    views,
    likes: null,
    comments: null,
    shares: null,
    observedAt: published
  };
}

const rubrics = (items: ContentRubricsDto['items']): ContentRubricsDto => ({
  rubrics: [
    { id: VERDICT, name: 'Вердикт чата', tag: 'вердикт' },
    { id: FIDIT, name: 'Учу фидить', tag: null }
  ],
  items
});

const mount = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={createTestQueryClient()}>{ui}</QueryClientProvider>);

describe('rubricStats', () => {
  it('compares each rubric with the usual post and counts the posts without one', () => {
    // Settled posts (older than three days) of 400 views make the usual; the verdicts do twice that.
    const items = [post(800, 100), post(800, 124), post(400, 148), post(400, 172), post(400, 196), post(50, 2)];
    const summary = rubricStats(
      items,
      rubrics([
        { itemId: items[0]!.id, rubricId: VERDICT, source: 'marker' },
        { itemId: items[1]!.id, rubricId: VERDICT, source: 'studio' },
        { itemId: items[2]!.id, rubricId: FIDIT, source: 'marker' }
      ]),
      AT,
      'UTC'
    );
    expect(summary.stats.map((stat) => [stat.name, stat.posts.length, stat.multiple])).toEqual([
      ['Вердикт чата', 2, 2],
      ['Учу фидить', 1, 1]
    ]);
    expect(summary.withoutRubric).toBe(3);
  });
});

describe('rubrics UI', () => {
  it('tells a taken hashtag apart from a taken name and keeps the dialog open', async () => {
    server.use(
      http.get('*/api/v1/content-analytics/rubrics', () => HttpResponse.json(rubrics([]))),
      http.post('*/api/v1/content-analytics/rubrics', () =>
        HttpResponse.json(errorBody('CONFLICT', { reason: 'TAG_TAKEN' }), { status: 409 })
      )
    );
    mount(<RubricsSettings />);
    expect(await screen.findByText('#вердикт')).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Новая рубрика' }));
    await user.type(screen.getByRole('textbox', { name: /Название/ }), 'Мемы');
    await user.type(screen.getByRole('textbox', { name: /Хештег/ }), '#вердикт');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText('Этот хештег уже у другой рубрики')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('saves the pick for a post and shows the server answer', async () => {
    const sent: unknown[] = [];
    server.use(
      http.get('*/api/v1/content-analytics/rubrics', () => HttpResponse.json(rubrics([]))),
      http.get('*/api/v1/content-analytics/posts/:id/rubric', () => HttpResponse.json({ rubricId: null })),
      http.put('*/api/v1/content-analytics/posts/:id/rubric', async ({ request }) => {
        const body = (await request.json()) as { rubricId: string | null };
        sent.push(body);
        return HttpResponse.json(body);
      })
    );
    mount(<PostRubricSelect postId={POST} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Рубрика/ }));
    await user.click(await screen.findByRole('option', { name: 'Учу фидить' }));
    await waitFor(() => expect(sent).toEqual([{ rubricId: FIDIT }]));
    await waitFor(() => expect(screen.getByRole('button', { name: /Рубрика/ }).textContent).toContain('Учу фидить'));
  });

  it('shows nothing in the editor until a rubric exists', async () => {
    let asked = false;
    server.use(
      http.get('*/api/v1/content-analytics/rubrics', () => {
        asked = true;
        return HttpResponse.json({ rubrics: [], items: [] });
      }),
      http.get('*/api/v1/content-analytics/posts/:id/rubric', () => HttpResponse.json({ rubricId: null }))
    );
    const { container } = mount(<PostRubricSelect postId={POST} />);
    await waitFor(() => expect(asked).toBe(true));
    expect(container.textContent).toBe('');
  });
});
