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

const HOUR_MS = 3_600_000;
const uuid = (group: string, n: number) => `55555555-5555-4555-8555-${group}${String(n).padStart(8, '0')}`;
const DEMO_POSTS = [
  ['Итоги группового этапа', 'Dota Studio'],
  ['Разбор патча 7.38', LONG_CHANNEL_TITLE],
  ['Расписание плей-офф', 'Dota Studio'],
  ['Новый герой: что известно', UNBROKEN],
  ['Дайджест недели', 'Dota Studio'],
  ['Анонс стрима', LONG_CHANNEL_TITLE],
  ['Мемы вечера', 'Dota Studio'],
  ['Скидки в магазине', UNBROKEN],
  ['Подборка клипов', 'Dota Studio']
] as const;
// Publication hours of a demo day; a past slot is sent (one is failed), a future slot is scheduled.
const DEMO_HOURS = [1.5, 6.5, 9, 11.25, 13.5, 15, 17.75, 20, 22.5];
const demoDay = (from: number, day: number, now: number) =>
  DEMO_HOURS.slice(0, [3, 5, 2, 9, 4, 1, 2][day % 7]!).map((hour, index) => {
    const at = from + day * 24 * HOUR_MS + hour * HOUR_MS;
    const [postTitle, destinationName] = DEMO_POSTS[(day + index) % DEMO_POSTS.length]!;
    const failed = day === 1 && index === 0;
    return {
      publicationId: uuid(String(day).padStart(4, '0'), index + 1),
      scheduledAt: new Date(at).toISOString(),
      status: failed ? 'failed' : at < now ? 'sent' : 'scheduled',
      postTitle,
      destinationName
    };
  });

// The newest drafts of the dashboard: edited an hour, a day and three days ago.
const demoDrafts = () =>
  [
    ['11111111-1111-4111-8111-aaaaaaaaaa01', 'Итоги недели в Dota 2', 1],
    ['11111111-1111-4111-8111-aaaaaaaaaa02', 'Гайд по новой роли для керри', 26],
    ['11111111-1111-4111-8111-aaaaaaaaaa03', LONG_POST_TITLE, 74]
  ].map(([id, title, hoursAgo]) =>
    post(id as string, title as string, 'draft', {
      updatedAt: new Date(Date.now() - (hoursAgo as number) * HOUR_MS).toISOString()
    })
  );

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
// Page-number lists also carry `page` and `totalCount`; plain cursor lists ignore the extra fields.
const page_ = <T>(items: T[]) => ({ items, nextCursor: null, page: 1, totalCount: items.length });

/** Deterministic API for every implemented endpoint, with long titles and channel names. Later routes win. */
export async function mockApi(page: Page): Promise<void> {
  await page.route('**/api/v1/**', (route) =>
    json(route, { error: { code: 'NOT_FOUND', message: 'not mocked', requestId: 'req-e2e' } }, 404)
  );
  await page.route(/\/api\/v1\/publications\/[^/?]+\/history$/, (route) => json(route, { items: [] }));
  // Content analytics: the owner's real scale (836 Telegram subscribers, YouTube ~1.2K), TikTok not connected.
  {
    const now = Date.now();
    const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000).toISOString();
    const day = (daysAgo: number) => new Date(now - daysAgo * 86_400_000).toISOString().slice(0, 10);
    const item = (
      id: string,
      platform: string,
      title: string,
      hoursAgo: number,
      views: number,
      likes: number,
      comments: number | null
    ) => ({
      id: `${platform}:${id}`,
      platform,
      title,
      url: platform === 'telegram' ? `https://t.me/alexeev_x/${id}` : `https://www.youtube.com/shorts/${id}`,
      thumbnailUrl: null,
      publishedAt: iso(hoursAgo),
      views,
      likes,
      comments,
      shares: null,
      observedAt: iso(0.3)
    });
    // Deterministic history: Telegram posts every ~1.5 days (≈300 views), YouTube every ~4 days with hits.
    let seed = 7;
    const rand = () => {
      seed = (seed * 16_807) % 2_147_483_647;
      return seed / 2_147_483_647;
    };
    const tgTitles = [
      'Оракл — лёгкий саппорт для руина игры',
      'Открыл обучение, ничего не понял',
      'Трансформация',
      'Мем дня',
      'Вердикт чата: кто виноват?',
      'Учу фидить: правило дня',
      'Итоги недели'
    ];
    const ytTitles = [
      'БКБ покупают только те, кто не умеет играть',
      'Откуда саппорту брать деньги?',
      'Учусь играть, часть 14',
      '90% саппортов совершают эту ошибку',
      'Как правильно стакать лагеря',
      'Устал проигрывать на миде?',
      'Я взял героя и пожалел'
    ];
    const items: ReturnType<typeof item>[] = [];
    for (let hours = 6, n = 700; hours < 180 * 24; hours += 20 + Math.round(rand() * 30), n -= 1) {
      const evening = new Date(now - hours * 3_600_000).getUTCHours() >= 15;
      items.push(
        item(
          String(n),
          'telegram',
          tgTitles[n % tgTitles.length]!,
          hours,
          Math.round((evening ? 360 : 240) * (0.6 + rand())),
          Math.round(4 + rand() * 12),
          null
        )
      );
    }
    for (let hours = 30, n = 0; hours < 180 * 24; hours += 60 + Math.round(rand() * 70), n += 1) {
      const hit = rand() > 0.82;
      const views = Math.round((hit ? 120_000 : 14_000) * (0.4 + rand()) * (1 + (180 * 24 - hours) / 6000));
      items.push(
        item(
          `yt${String(n).padStart(9, '0')}`,
          'youtube',
          ytTitles[n % ytTitles.length]!,
          hours,
          views,
          Math.round(views * 0.055),
          Math.round(views * 0.004)
        )
      );
    }
    // TikTok copies of the newest videos, a few hours later: the cross-posted panel and the third platform.
    for (const video of items.filter((entry) => entry.platform === 'youtube').slice(0, 4)) {
      const hours = (now - Date.parse(video.publishedAt)) / 3_600_000 - 3;
      items.push(
        item(
          `7400${video.id.slice(2)}`,
          'tiktok',
          video.title,
          Math.max(1, hours),
          Math.round((video.views ?? 0) * 2.4),
          Math.round((video.likes ?? 0) * 2),
          video.comments
        )
      );
    }
    items.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    const series = (start: number, gain: number) =>
      Array.from({ length: 30 }, (_, index) => ({
        day: day(29 - index),
        followers: Math.round(start + gain * index + (index % 4) * 3)
      }));
    const overview = {
      observedAt: iso(0),
      sources: [
        {
          platform: 'telegram',
          state: 'ok',
          handle: 'alexeev_x',
          profileUrl: 'https://t.me/alexeev_x',
          followers: 836,
          followersChange7d: 24,
          views7d: 1_480,
          items7d: 6,
          lastSyncedAt: iso(0.3),
          errorCode: null,
          connection: 'none'
        },
        {
          platform: 'youtube',
          state: 'ok',
          handle: 'UCE-VQmi1Qym7MrEzHg9ngjA',
          profileUrl: 'https://www.youtube.com/channel/UCE-VQmi1Qym7MrEzHg9ngjA',
          followers: 1_180,
          followersChange7d: 41,
          views7d: 66_500,
          items7d: 3,
          lastSyncedAt: iso(0.3),
          errorCode: null,
          connection: 'none'
        },
        {
          platform: 'tiktok',
          state: 'not_configured',
          handle: null,
          profileUrl: null,
          followers: null,
          followersChange7d: null,
          views7d: null,
          items7d: 0,
          lastSyncedAt: null,
          errorCode: null,
          connection: 'available'
        }
      ],
      followers: [
        { platform: 'telegram', points: series(700, 4.6) },
        { platform: 'youtube', points: series(1_010, 5.8) }
      ],
      recent: items.slice(0, 8),
      top: [...items].sort((a, b) => b.views - a.views).slice(0, 5)
    };
    await page.route(/\/api\/v1\/content-analytics(\/sync)?$/, (route) => json(route, overview));
    await page.route(/\/api\/v1\/content-analytics\/report(\?.*)?$/, (route) => {
      const days = Number(new URL(route.request().url()).searchParams.get('days') ?? '30');
      const previousFrom = now - 2 * days * 86_400_000;
      json(route, {
        from: iso(days * 24),
        to: iso(0),
        previousFrom: new Date(previousFrom).toISOString(),
        items: items.filter((entry) => Date.parse(entry.publishedAt) >= previousFrom),
        truncated: false,
        // Tracked from their first hours: the items of the last ten days.
        tracked: items
          .filter((entry) => now - Date.parse(entry.publishedAt) < 10 * 86_400_000)
          .map((entry) => entry.id),
        // Daily readings started five days ago: growth exists for those days only.
        growth: [4, 3, 2, 1, 0].flatMap((ago) => [
          { platform: 'telegram', day: day(ago), views: 900 + ago * 70 },
          { platform: 'youtube', day: day(ago), views: 14_000 + ago * 2_300 }
        ]),
        baselines: [
          {
            platform: 'telegram',
            points: [1, 3, 6, 12, 24, 48, 72].map((ageHours) => ({
              ageHours,
              views: Math.round(290 * (1 - Math.exp(-ageHours / 10))),
              items: 12
            }))
          },
          {
            platform: 'youtube',
            points: [1, 3, 6, 12, 24, 48, 72].map((ageHours) => ({
              ageHours,
              views: Math.round(9_000 * (1 - Math.exp(-ageHours / 20))),
              items: 6
            }))
          },
          { platform: 'tiktok', points: [] }
        ],
        followers: [
          { platform: 'telegram', points: series(700, 4.6).filter((point) => point.day >= day(2 * days)) },
          { platform: 'youtube', points: series(1_010, 5.8).filter((point) => point.day >= day(2 * days)) }
        ]
      });
    });
    await page.route(/\/api\/v1\/content-analytics\/items(\?.*)?$/, (route) => {
      const platform = new URL(route.request().url()).searchParams.get('platform');
      json(route, {
        items: items.filter((entry) => platform === null || entry.platform === platform),
        nextCursor: null
      });
    });
    await page.route(/\/api\/v1\/content-analytics\/items\/[^/?]+$/, (route) => {
      const id = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop() ?? '');
      const found = items.find((entry) => entry.id === id) ?? items[1]!;
      // Hourly for the first day, then daily: the views approach the item's current count.
      const published = Date.parse(found.publishedAt);
      const snapshots = Array.from({ length: 40 }, (_, index) => {
        const age = index < 24 ? index + 1 : 24 + (index - 23) * 24;
        return {
          observedAt: new Date(published + age * 3_600_000).toISOString(),
          views: Math.round(found.views * (1 - Math.exp(-age / 12))),
          likes: null,
          comments: null,
          shares: null
        };
      }).filter((snapshot) => Date.parse(snapshot.observedAt) <= now);
      const ageHours = (Date.parse(found.observedAt) - Date.parse(found.publishedAt)) / 3_600_000;
      json(route, {
        item: found,
        snapshots,
        baseline: {
          platform: found.platform,
          points: [1, 3, 6, 12, 24, 48, 72]
            .filter((age) => age <= Math.max(72, ageHours))
            .map((age) => ({
              ageHours: age,
              views: Math.round((found.views / 2) * (1 - Math.exp(-age / 12))),
              items: 8
            }))
        }
      });
    });
  }
  // Activity: a few events around «now» so the feed and the day lane have something to show.
  await page.route(/\/api\/v1\/activity(\?.*)?$/, (route) => {
    const now = Date.now();
    const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
    const base = {
      actor: 'owner',
      postId: null,
      publicationId: null,
      channelTitle: null,
      scheduledAt: null,
      errorCode: null
    };
    const items = [
      {
        ...base,
        id: '6',
        at: at(5),
        action: 'job.failed',
        category: 'errors',
        actor: 'system',
        entityType: 'publication',
        entityId: ids.publication,
        title: 'Итоги недели',
        publicationId: ids.publication,
        channelTitle: 'Dota Studio',
        errorCode: 'DESTINATION_UNAVAILABLE'
      },
      {
        ...base,
        id: '5',
        at: at(40),
        action: 'publication.create',
        category: 'publications',
        entityType: 'publication',
        entityId: ids.publication,
        title: 'Итоги недели',
        postId: ids.post,
        publicationId: ids.publication,
        channelTitle: 'Dota Studio',
        scheduledAt: at(-120)
      },
      {
        ...base,
        id: '4',
        at: at(45),
        action: 'post.approve',
        category: 'posts',
        entityType: 'post',
        entityId: ids.post,
        title: 'Итоги недели',
        postId: ids.post
      },
      {
        ...base,
        id: '3',
        at: at(48),
        action: 'media.upload',
        category: 'media',
        entityType: 'media',
        entityId: 'm1',
        title: 'cover.jpg'
      },
      {
        ...base,
        id: '2',
        at: at(52),
        action: 'post.create',
        category: 'posts',
        entityType: 'post',
        entityId: ids.post,
        title: 'Итоги недели',
        postId: ids.post
      },
      {
        ...base,
        id: '1',
        at: at(26 * 60),
        action: 'destination.create',
        category: 'system',
        entityType: 'destination',
        entityId: ids.destination,
        title: 'Dota Studio'
      }
    ];
    const category = new URL(route.request().url()).searchParams.get('category');
    return json(route, {
      items: category ? items.filter((item) => item.category === category) : items,
      nextCursor: null
    });
  });
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
    const query = new URL(route.request().url()).searchParams;
    const view = query.get('view');
    if (query.get('status') === 'draft' && query.get('limit') === '3') {
      return json(route, { ...page_(demoDrafts()), archivedCount: archivedPosts.length, totalCount: 3 });
    }
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
    const rangeFrom = params.get('from');
    const rangeTo = params.get('to');
    if (rangeFrom && rangeTo) {
      // A date range (the week bars, a day opened from them): one demo week laid on the requested days.
      const start = Date.parse(rangeFrom);
      const days = Math.max(1, Math.round((Date.parse(rangeTo) - start) / (24 * HOUR_MS)));
      const items = Array.from({ length: days }, (_, day) => demoDay(start, day, Date.now())).flat();
      const rows = items.map((item) => ({
        ...publication(item.publicationId, posts[0]!.id, ids.destination, item.status, item.scheduledAt),
        ...(item.status === 'failed' ? { lastErrorCode: 'TELEGRAM_REJECTED' } : {})
      }));
      const statusCounts = { ...NO_COUNTS };
      for (const row of rows) statusCounts[row.status as keyof typeof NO_COUNTS] += 1;
      return json(route, { ...page_(rows), totalCount: rows.length, statusCounts });
    }
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
    route.request().method() === 'POST'
      ? json(
          route,
          {
            id: '55555555-5555-4555-8555-0000000000ff',
            kind: 'photo',
            fileName: new URL(route.request().url()).searchParams.get('fileName') ?? 'Загрузка.jpg',
            contentType: 'image/jpeg',
            sizeBytes: 240_000,
            width: 1280,
            height: 720,
            durationMs: null,
            createdAt: T,
            duplicateCount: 1,
            usageCount: 0,
            deletable: true,
            usages: []
          },
          201
        )
      : json(
          route,
          page_(
            [
              'Character_gesturing_middle_finger_20261012083017.mp4',
              'Патч 7.37.png',
              'Хайлайты.mp4',
              'Обложка.jpg'
            ].map((fileName, index) => ({
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
              deletable: index % 2 === 0,
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
  await page.route('**/api/v1/dota/watchlists', (route) =>
    json(route, {
      watches: [
        ['Pudge', 'hero'],
        ['Black King Bar', 'item']
      ].map(([entityName, entityType], index) => ({
        id: `00000000-0000-4000-8000-00000000000${index + 1}`,
        entityType,
        entityName,
        createdAt: T,
        lastMatchedUpdate: null
      })),
      matches: []
    })
  );
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
  const sourceEvents = Array.from({ length: 23 }, (_, index) => {
    const type = (['patch', 'news', 'treasure'] as const)[index % 3]!;
    const status = (['new', 'new', 'drafted', 'published', 'hidden'] as const)[index % 5]!;
    return {
      id: type === 'patch' ? `patch_notes:7.${41 - index}` : `steam_news:${1000 + index}`,
      type,
      title:
        type === 'patch'
          ? `Обновление 7.${41 - index}: баланс героев и предметов в Dota 2`
          : type === 'treasure'
            ? 'Сокровищница Международного 2026 уже доступна'
            : 'Очень длинный заголовок новости про турнир и расписание групповой стадии на всю неделю',
      sourceName: type === 'patch' ? 'Dota 2 · Patch notes' : 'Dota 2 · Steam News',
      sourceUrl: 'https://www.dota2.com/news',
      publishedAt: hoursAgo(2 + index * 9),
      detectedAt: hoursAgo(1 + index * 9),
      summary:
        type === 'patch'
          ? ''
          : 'Valve рассказала о новых наградах, сроках и условиях участия. Подробности и список изменений доступны по ссылке на источник.',
      facts:
        type === 'patch'
          ? ['Pudge', 'Axe', 'Lina', 'Phoenix', 'Mars']
              .map((name) => ({ kind: 'hero', name }))
              .concat([{ kind: 'item', name: 'Black King Bar' }])
          : [],
      watchHits: type === 'patch' ? [{ kind: 'hero', name: 'Pudge' }] : [],
      status,
      draft:
        status === 'drafted' || status === 'published'
          ? { postId: '11111111-1111-4111-8111-111111111111', title: 'Черновик' }
          : null,
      publication: status === 'published' ? { status: 'sent' } : null
    };
  });
  await page.route(/\/api\/v1\/sources\/events(\?.*)?$/, (route) => {
    const params = new URL(route.request().url()).searchParams;
    const items = sourceEvents.filter(
      (event) =>
        (!params.get('status') || event.status === params.get('status')) &&
        (!params.get('type') || event.type === params.get('type'))
    );
    const number = Number(params.get('page') ?? 1);
    const limit = Number(params.get('limit') ?? 10);
    return json(route, {
      items: items.slice((number - 1) * limit, number * limit),
      nextCursor: null,
      page: number,
      totalCount: items.length
    });
  });
  await page.route(/\/api\/v1\/sources\/events\/[^/]+\/(draft|hide|unhide)$/, (route) =>
    json(route, { error: { code: 'CONFLICT', message: 'Event is hidden' } }, 409)
  );
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
    const range = new URL(route.request().url()).searchParams;
    const from = Date.parse(range.get('from') ?? new Date().toISOString());
    const to = Date.parse(range.get('to') ?? new Date(from + 24 * HOUR_MS).toISOString());
    const today = demoDay(from - 3 * 24 * HOUR_MS, 3, Date.now()).slice(0, 8);
    const tomorrow = (hour: number, id: number, title: string, channel: string) => ({
      publicationId: uuid('9999', id),
      scheduledAt: new Date(to + hour * HOUR_MS).toISOString(),
      status: 'scheduled',
      postTitle: title,
      destinationName: channel
    });
    const sentRow = (hoursBefore: number, id: number, title: string, channel: string, url?: string) => ({
      publicationId: uuid('8888', id),
      scheduledAt: new Date(from - hoursBefore * HOUR_MS).toISOString(),
      status: 'sent',
      postTitle: title,
      destinationName: channel,
      sentAt: new Date(from - hoursBefore * HOUR_MS + 5000).toISOString(),
      ...(url ? { messageUrl: url } : {})
    });
    return json(route, {
      attention: attention.slice(0, 5),
      attentionTotal: Math.min(attention.length, 99),
      today,
      todayTotal: today.length,
      upcoming: [tomorrow(10, 1, LONG_POST_TITLE, 'Dota Studio'), tomorrow(36.5, 2, 'Разбор патча', UNBROKEN)],
      recentSent: [
        ...today
          .filter((item) => item.status === 'sent')
          .slice(-2)
          .reverse()
          .map((item, index) => ({
            ...item,
            sentAt: new Date(Date.parse(item.scheduledAt) + 6000).toISOString(),
            ...(index === 0 ? { messageUrl: 'https://t.me/dota_studio/4821' } : {})
          })),
        sentRow(3, 1, 'Итоги недели', LONG_CHANNEL_TITLE, 'https://t.me/dota_cis/310'),
        sentRow(14, 2, 'Утренние новости', 'Dota Studio')
      ].slice(0, 5),
      generatedAt: new Date().toISOString()
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
