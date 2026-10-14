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

const NO_COUNTS = {
  scheduled: 0,
  queued: 0,
  preparing: 0,
  sending: 0,
  sent: 0,
  retry_wait: 0,
  failed: 0,
  unknown: 0,
  cancelled: 0
};
const summary = (counts: Partial<typeof NO_COUNTS> = {}, extra: Record<string, unknown> = {}) => ({
  counts: { ...NO_COUNTS, ...counts },
  nextScheduled: null,
  lastSentAt: null,
  destinations: [],
  ...extra
});

const post = (id: string, title: string, status = 'draft', extra: Record<string, unknown> = {}) => ({
  id,
  title,
  body: 'Текст поста. '.repeat(40),
  entities: [],
  revision: 0,
  status,
  archivedAt: null,
  autoDeleteAt: null,
  publicationSummary: summary(),
  createdAt: T,
  updatedAt: T,
  ...extra
});
const archived = (n: number, title: string, daysLeft: number) =>
  post(`11111111-1111-4111-8111-0000000000a${n}`, title, 'approved', {
    revision: 3,
    archivedAt: '2026-10-05T09:00:00.000Z',
    autoDeleteAt: new Date(Date.now() + daysLeft * 86_400_000).toISOString(),
    publicationSummary: summary(
      { sent: 1 },
      { lastSentAt: '2026-10-05T09:00:00.000Z', destinations: [{ id: ids.destination, title: LONG_CHANNEL_TITLE }] }
    )
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
  post('11111111-1111-4111-8111-222222222222', UNBROKEN, 'approved', {
    publicationSummary: summary(
      { scheduled: 1 },
      {
        nextScheduled: { scheduledAt: '2026-10-08T09:00:00.000Z', destinationId: ids.destination },
        destinations: [{ id: ids.destination, title: LONG_CHANNEL_TITLE }]
      }
    )
  }),
  post('11111111-1111-4111-8111-333333333333', 'Короткий пост', 'approved', {
    publicationSummary: summary({ unknown: 1 })
  }),
  post('11111111-1111-4111-8111-444444444444', 'Идёт отправка', 'approved', {
    publicationSummary: summary({ sending: 1 })
  })
];
const archivedPosts = [archived(1, LONG_POST_TITLE, 20), archived(2, 'Итоги недели', 2), archived(3, UNBROKEN, 12)];
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
].map((item) => (item.status === 'unknown' ? { ...item, revision: 4, lastErrorCode: 'SEND_UNCONFIRMED' } : item));

const incidentIds = {
  unknown: '44444444-4444-4444-8444-000000000001',
  failed: '44444444-4444-4444-8444-000000000002',
  failedLong: '44444444-4444-4444-8444-000000000003'
} as const;
const UNKNOWN_PUBLICATION = '33333333-3333-4333-8333-555555555555';
const SOON = '2026-10-07T06:00:00.000Z';
const inPublication = (id: string, status: string, postTitle: string, destinationName: string) => ({
  id,
  status,
  postTitle,
  destinationName,
  scheduledAt: SOON
});
const incidents = (): Array<Record<string, unknown>> => [
  {
    id: incidentIds.unknown,
    kind: 'publish_unknown',
    code: 'SEND_UNCONFIRMED',
    occurredAt: '2026-10-07T06:05:00.000Z',
    jobId: '66666666-6666-4666-8666-000000000001',
    attemptCount: 1,
    publication: inPublication(UNKNOWN_PUBLICATION, 'unknown', 'Короткий пост', LONG_CHANNEL_TITLE)
  },
  {
    id: incidentIds.failed,
    kind: 'publish_failed',
    code: 'DESTINATION_UNAVAILABLE',
    occurredAt: '2026-10-07T05:30:00.000Z',
    jobId: '66666666-6666-4666-8666-000000000002',
    attemptCount: 3,
    publication: inPublication(ids.publication, 'failed', 'Итоги недели', 'Dota Studio')
  },
  {
    id: incidentIds.failedLong,
    kind: 'publish_failed',
    code: 'CONTENT_INVALID',
    occurredAt: '2026-10-06T15:00:00.000Z',
    attemptCount: 1,
    publication: inPublication(ids.publication, 'failed', LONG_POST_TITLE, UNBROKEN)
  }
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
  // `npm run dev` signs in through this route instead of the refresh cookie (src/app/auth/bootstrap.ts).
  await page.route('**/api/v1/auth/local', (route) =>
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
  await page.route(/\/api\/v1\/posts(\?.*)?$/, (route) => {
    const view = new URL(route.request().url()).searchParams.get('view');
    const items = view === 'archive' ? archivedPosts : posts;
    return json(route, { ...page_(items), archivedCount: archivedPosts.length, totalCount: items.length });
  });
  await page.route(/\/api\/v1\/posts\/[^/?]+$/, (route) => {
    const wanted = route.request().url().split('/').pop()?.split('?')[0];
    return json(route, [...posts, ...archivedPosts].find((item) => item.id === wanted) ?? posts[0]);
  });
  await page.route(/\/api\/v1\/posts\/delete$/, async (route) => {
    const { items } = route.request().postDataJSON() as { items: Array<{ id: string }> };
    return json(route, {
      items: items.map((item) => ({ id: item.id, outcome: 'deleted', cancelledPublications: [] }))
    });
  });
  await page.route(/\/api\/v1\/posts\/restore$/, async (route) => {
    const { items } = route.request().postDataJSON() as { items: Array<{ id: string }> };
    return json(route, { items: items.map((item) => ({ id: item.id, outcome: 'restored' })) });
  });
  await page.route(/\/api\/v1\/posts\/[^/?]+\/delete$/, (route) =>
    json(route, { id: route.request().url().split('/').slice(-2)[0], cancelledPublications: [] })
  );
  await page.route(/\/api\/v1\/destinations(\?.*)?$/, (route) => json(route, page_(destinations)));
  await page.route(/\/api\/v1\/destinations\/[^/?]+$/, (route) => json(route, destinations[0]));
  // Per-test copy: resolving an `unknown` publication changes what the next read returns, as the server would.
  const store: Array<Record<string, unknown>> = publications.map((item) => ({ ...item }));
  await page.route(/\/api\/v1\/publications(\?.*)?$/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    const items = store.filter(
      (item) =>
        (!params.get('status') || item['status'] === params.get('status')) &&
        (!params.get('postId') || item['postId'] === params.get('postId'))
    );
    const statusCounts = { ...NO_COUNTS };
    for (const item of store) statusCounts[item['status'] as keyof typeof NO_COUNTS] += 1;
    return json(route, { ...page_(items), totalCount: items.length, statusCounts });
  });
  await page.route(/\/api\/v1\/publications\/[^/?]+$/, (route) => {
    const wanted = route.request().url().split('/').pop()?.split('?')[0];
    return json(route, store.find((item) => item['id'] === wanted) ?? store[0]);
  });
  // Per-test incidents: the same store backs the dashboard, the list and the badge, as the server would.
  const incidentStore = incidents();
  const openIncidents = () => incidentStore.filter((item) => item['resolvedAt'] === undefined);
  await page.route(/\/api\/v1\/incidents(\?.*)?$/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    const state = params.get('state') ?? 'open';
    const kind = params.get('kind');
    const limit = Number(params.get('limit') ?? 25);
    const items = incidentStore
      .filter((item) => (state === 'open') === (item['resolvedAt'] === undefined))
      .filter((item) => !kind || item['kind'] === kind)
      .slice(0, limit);
    return json(route, { items, nextCursor: null, openCount: openIncidents().length });
  });
  await page.route(/\/api\/v1\/incidents\/[^/?]+\/resolve$/, (route) => {
    const wanted = route.request().url().split('/').slice(-2)[0];
    const found = incidentStore.find((item) => item['id'] === wanted);
    if (!found) return json(route, { error: { code: 'NOT_FOUND', message: 'missing', requestId: 'req-e2e' } }, 404);
    if (found['kind'] === 'publish_unknown') {
      return json(
        route,
        { error: { code: 'CONFLICT', message: 'x', requestId: 'req-e2e', details: { reason: 'USE_RESOLVE_UNKNOWN' } } },
        409
      );
    }
    found['resolvedAt'] ??= '2026-10-07T07:10:00.000Z';
    return json(route, found);
  });
  await page.route('**/api/v1/settings/operations', (route) =>
    json(route, {
      timezone: 'Europe/Moscow',
      notifications: {
        warningsEnabled: true,
        publicationAlerts: true,
        sourceAlerts: true,
        automationAlerts: true,
        recoveryAlerts: true,
        dotaWatchlistAlerts: true
      },
      revision: 1,
      updatedAt: T
    })
  );
  await page.route(/\/api\/v1\/media(\?.*)?$/, (route) =>
    json(
      route,
      page_(
        ['Турнир.jpg', 'Патч 7.37.png', 'Хайлайты.mp4', 'Обложка.jpg'].map((fileName, index) => ({
          id: `55555555-5555-4555-8555-${String(index).padStart(12, '0')}`,
          kind: fileName.endsWith('.mp4') ? 'video' : 'photo',
          fileName,
          contentType: fileName.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg',
          sizeBytes: 240_000 + index * 1000,
          width: 1280,
          height: 720,
          durationMs: fileName.endsWith('.mp4') ? 42_000 : null,
          createdAt: T,
          duplicateCount: 1,
          usageCount: index % 2,
          usages: []
        }))
      )
    )
  );
  await page.route(/\/api\/v1\/dota(\?.*)?$/, (route) =>
    json(route, {
      sources: [
        {
          key: 'steam_news',
          name: 'Steam News',
          officialUrl: 'https://store.steampowered.com/news/app/570',
          lastAttemptAt: T,
          lastSuccessAt: T,
          health: 'healthy'
        },
        {
          key: 'patch_notes',
          name: 'Patch notes',
          officialUrl: 'https://www.dota2.com/patches',
          lastAttemptAt: T,
          lastSuccessAt: T,
          health: 'healthy'
        }
      ],
      updates: [
        ['Вышло обновление 7.37d', 'patch', 'patch_notes'],
        ['Известны участники The International', 'news', 'steam_news'],
        ['Новый герой в разработке', 'news', 'steam_news']
      ].map(([title, type, sourceKey], index) => ({
        id: `update-${index}`,
        sourceKey,
        type,
        title,
        sourceUrl: 'https://www.dota2.com/news',
        publishedAt: T,
        detectedAt: T,
        isBaseline: false
      }))
    })
  );
  await page.route(/\/api\/v1\/automations(\?.*)?$/, (route) =>
    json(
      route,
      page_([
        {
          id: 'dota-intelligence',
          enabled: true,
          revision: 1,
          cron: '*/15 * * * *',
          cadenceMinutes: 15,
          nextRunAt: T,
          health: 'healthy',
          executionState: 'idle',
          activeRunId: null,
          lastRun: null,
          runNowAllowed: true,
          sideEffects: ['persist_dota_updates']
        }
      ])
    )
  );
  // Private media bytes: one real photo, so thumbnails and previews render like production.
  await page.route(/\/api\/v1\/(media|posts\/[^/]+\/media)\/[^/]+\/content$/, (route) =>
    route.fulfill({ path: new URL('./crop-lake-demo.png', import.meta.url).pathname })
  );
  await page.route('**/api/v1/dota/watchlists', (route) => json(route, { watches: [], matches: [] }));
  await page.route(/\/api\/v1\/dashboard(\?.*)?$/, (route) => {
    const open = openIncidents();
    const attention = [
      ...open.filter((item) => item['kind'] === 'publish_unknown'),
      ...open.filter((item) => item['kind'] === 'publish_failed')
    ].map((item) => {
      const publication = item['publication'] as ReturnType<typeof inPublication>;
      return {
        kind: item['kind'] === 'publish_unknown' ? 'unknown' : 'failed',
        publicationId: publication.id,
        incidentId: item['id'],
        code: item['code'],
        postTitle: publication.postTitle,
        destinationName: publication.destinationName,
        scheduledAt: publication.scheduledAt,
        occurredAt: item['occurredAt']
      };
    });
    const row = (id: string, at: string, status: string, postTitle: string, destinationName: string) => ({
      publicationId: id,
      scheduledAt: at,
      status,
      postTitle,
      destinationName
    });
    return json(route, {
      attention: attention.slice(0, 5),
      attentionTotal: Math.min(attention.length, 99),
      today: [
        row('33333333-3333-4333-8333-000000000a01', SOON, 'sent', 'Утренние новости', 'Dota Studio'),
        row(
          '33333333-3333-4333-8333-000000000a02',
          '2026-10-07T11:00:00.000Z',
          'scheduled',
          LONG_POST_TITLE,
          LONG_CHANNEL_TITLE
        ),
        row('33333333-3333-4333-8333-000000000a03', '2026-10-07T15:30:00.000Z', 'queued', UNBROKEN, UNBROKEN)
      ],
      todayTotal: 3,
      upcoming: [
        row(
          '33333333-3333-4333-8333-000000000b01',
          '2026-10-08T09:00:00.000Z',
          'scheduled',
          LONG_POST_TITLE,
          'Dota Studio'
        ),
        row('33333333-3333-4333-8333-000000000b02', '2026-10-09T12:30:00.000Z', 'scheduled', 'Разбор патча', UNBROKEN)
      ],
      recentSent: [
        {
          ...row('33333333-3333-4333-8333-000000000a01', SOON, 'sent', 'Утренние новости', 'Dota Studio'),
          sentAt: '2026-10-07T06:00:05.000Z',
          messageUrl: 'https://t.me/dota_studio/4821'
        },
        {
          ...row(
            '33333333-3333-4333-8333-000000000c01',
            '2026-10-06T09:00:00.000Z',
            'sent',
            'Итоги недели',
            LONG_CHANNEL_TITLE
          ),
          sentAt: '2026-10-06T09:00:07.000Z'
        }
      ],
      generatedAt: '2026-10-07T07:00:00.000Z'
    });
  });
  await page.route(/\/api\/v1\/publications\/[^/?]+\/resolve-unknown$/, (route) => {
    const wanted = route.request().url().split('/').slice(-2)[0];
    const found = store.find((item) => item['id'] === wanted);
    const body = route.request().postDataJSON() as {
      outcome: string;
      revision: number;
      externalMessageId?: string;
      scheduledAt?: string;
    };
    const error = (code: string, reason: string, status: number) =>
      json(route, { error: { code, message: reason, requestId: 'req-e2e', details: { reason } } }, status);
    if (!found) return json(route, { error: { code: 'NOT_FOUND', message: 'missing', requestId: 'req-e2e' } }, 404);
    if (found['status'] !== 'unknown') return error('CONFLICT', 'NOT_UNKNOWN', 409);
    if (found['revision'] !== body.revision) return error('CONFLICT', 'STALE_REVISION', 409);
    const next =
      body.outcome === 'sent'
        ? { status: 'sent', externalMessageId: body.externalMessageId }
        : body.outcome === 'resend'
          ? {
              status: Date.parse(String(body.scheduledAt)) > Date.now() ? 'scheduled' : 'queued',
              scheduledAt: body.scheduledAt
            }
          : { status: 'cancelled' };
    Object.assign(found, next, { revision: body.revision + 1, updatedAt: T });
    for (const incident of incidentStore) {
      const linked = incident['publication'] as { id: string } | undefined;
      if (linked?.id === wanted && incident['resolvedAt'] === undefined)
        incident['resolvedAt'] = '2026-10-07T07:10:00.000Z';
    }
    return json(route, found);
  });
}
