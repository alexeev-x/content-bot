import type { Page, Route } from '@playwright/test';

const T = '2026-10-06T09:00:00.000Z';
const LONG_POST_TITLE =
  'Очень длинный заголовок поста про обновление правил турнира Dota 2 и расписание групповой стадии на всю неделю';
const LONG_CHANNEL_TITLE = 'Официальный русскоязычный канал сообщества киберспорта и стримеров Dota 2 Studio';
const UNBROKEN = 'Сверхдлинноеназваниеканалабезпробеловкотороенеразбиваетсянастрокивообще';

export const ids = {
  post: '11111111-1111-4111-8111-111111111111',
  destination: '22222222-2222-4222-8222-222222222222',
  destination2: '22222222-2222-4222-8222-333333333333',
  publication: '33333333-3333-4333-8333-333333333333'
} as const;

const post = (id: string, title: string, status = 'draft') => ({
  id,
  title,
  body: 'Текст поста. '.repeat(40),
  revision: 0,
  status,
  createdAt: T,
  updatedAt: T
});
const destination = (id: string, title: string, chatId: string) => ({
  id,
  title,
  chatId,
  kind: 'channel',
  enabled: true,
  revision: 0,
  createdAt: T,
  updatedAt: T
});
const publication = (id: string, postId: string, destinationId: string, status: string, at: string) => ({
  id,
  postId,
  postRevision: 0,
  destinationId,
  status,
  scheduledAt: at,
  timezone: 'Europe/Moscow',
  revision: 0,
  createdAt: T,
  updatedAt: T,
  ...(status === 'sent' ? { externalMessageId: '4242' } : {})
});

const posts = [
  post(ids.post, LONG_POST_TITLE),
  post('11111111-1111-4111-8111-222222222222', UNBROKEN, 'approved'),
  post('11111111-1111-4111-8111-333333333333', 'Короткий пост')
];
const destinations = [
  destination(ids.destination, LONG_CHANNEL_TITLE, '-1001234567890'),
  destination(ids.destination2, UNBROKEN, '-1009876543210')
];
const publications = [
  publication(ids.publication, ids.post, ids.destination, 'scheduled', '2026-10-07T09:00:00.000Z'),
  publication(
    '33333333-3333-4333-8333-444444444444',
    posts[1]!.id,
    ids.destination2,
    'sent',
    '2026-10-05T09:00:00.000Z'
  ),
  publication(
    '33333333-3333-4333-8333-555555555555',
    posts[2]!.id,
    ids.destination,
    'unknown',
    '2026-10-04T09:00:00.000Z'
  )
];

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const page_ = <T>(items: T[]) => ({ items, nextCursor: null });

/** Deterministic API for every implemented endpoint, with long titles and channel names. Later routes win. */
export async function mockApi(page: Page): Promise<void> {
  await page.route('**/api/v1/**', (route) =>
    json(route, { error: { code: 'NOT_FOUND', message: 'not mocked', requestId: 'req-e2e' } }, 404)
  );
  await page.route('**/api/v1/health', (route) =>
    json(route, { status: 'ok', service: 'e2e', publishingEnabled: false, time: T })
  );
  await page.route('**/api/v1/auth/refresh', (route) =>
    json(route, { accessToken: 'access-e2e', expiresAt: '2030-01-01T00:00:00.000Z' })
  );
  await page.route('**/api/v1/auth/telegram', (route) =>
    json(route, { accessToken: 'access-e2e', expiresAt: '2030-01-01T00:00:00.000Z' })
  );
  await page.route('**/api/v1/auth/me', (route) => json(route, { telegramId: '1000001', name: 'Владелец' }));
  await page.route('**/api/v1/bot/status', (route) =>
    json(route, {
      missing: [],
      botUsername: 'alexeev_bot',
      expectedUrl: 'https://app.example.test/webhooks/telegram',
      webhook: {
        url: 'https://app.example.test/webhooks/telegram',
        pointsHere: true,
        pendingUpdateCount: 0,
        lastErrorAt: null,
        lastErrorMessage: null
      }
    })
  );
  let appearance = {
    themeMode: 'system',
    lightAccent: { kind: 'preset', id: 'cobalt' },
    darkAccent: { kind: 'preset', id: 'cobalt' },
    customPresets: [],
    revision: 0,
    updatedAt: null as string | null
  };
  await page.route('**/api/v1/settings/appearance', (route) => {
    if (route.request().method() === 'PUT') {
      const sent = route.request().postDataJSON() as typeof appearance;
      appearance = { ...sent, revision: appearance.revision + 1, updatedAt: T };
    }
    return json(route, appearance);
  });
  await page.route(/\/api\/v1\/posts(\?.*)?$/, (route) => json(route, page_(posts)));
  await page.route(/\/api\/v1\/posts\/[^/?]+$/, (route) => json(route, posts[0]));
  await page.route(/\/api\/v1\/destinations(\?.*)?$/, (route) => json(route, page_(destinations)));
  await page.route(/\/api\/v1\/destinations\/[^/?]+$/, (route) => json(route, destinations[0]));
  await page.route(/\/api\/v1\/publications(\?.*)?$/, (route) => json(route, page_(publications)));
  await page.route(/\/api\/v1\/publications\/[^/?]+$/, (route) => json(route, publications[0]));
}
