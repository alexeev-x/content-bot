import { createContainer } from '../../src/app/container';
import { createMediaImportRunner } from '../../src/app/bot/media-import-runner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBotAdminApi } from '../helpers/fake-bot-admin-api';
import { testDb } from '../helpers/db';
import {
  createApi,
  fakeClock,
  OWNER_ID,
  OWNER_TOKEN,
  resetDb,
  seedSession,
  TEST_BOT_TOKEN,
  openPostMode
} from '../helpers/harness';
import { meteredDb } from '../helpers/metered-db';
import { testMediaBucket } from '../helpers/media-bucket';
import { count, seedDestination, seedDraftPost } from '../helpers/publishing';

const SECRET = 'hook-secret-PLACEHOLDER';
const BOT_INFO = JSON.stringify({ id: 123456, is_bot: true, first_name: 'Bot', username: 'content_bot' });
const ORIGIN = 'https://studio.example.com';
// What one Worker invocation may spend on the Free plan.
const LIMIT = 50;

const JPEG = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03, 0x01,
  0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9
]);

let sent: string[];

beforeEach(async () => {
  await resetDb();
  await openPostMode();
  sent = [];
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith('/getFile')) {
      const { file_id: fileId } = JSON.parse(String(init?.body ?? '{}')) as { file_id: string };
      return Promise.resolve(
        Response.json({ ok: true, result: { file_id: fileId, file_path: `photos/${fileId}.jpg`, file_size: 29 } })
      );
    }
    if (url.includes('/file/bot')) {
      return Promise.resolve(new Response(JPEG, { headers: { 'content-length': String(JPEG.length) } }));
    }
    sent.push(String(init?.body ?? ''));
    return Promise.resolve(Response.json({ ok: true, result: { message_id: 1 } }));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const update = (index: number, album: boolean) => ({
  update_id: 9000 + index,
  message: {
    message_id: 100 + index,
    date: 1,
    chat: { id: Number(OWNER_ID), type: 'private', first_name: 'X' },
    from: { id: Number(OWNER_ID), is_bot: false, first_name: 'X' },
    photo: [{ file_id: `f${index}`, file_unique_id: `u-f${index}`, width: 640, height: 480, file_size: 29 }],
    ...(album ? { media_group_id: 'grp' } : {})
  }
});

const mediaNames = async () =>
  (
    await testDb()
      .prepare(
        `SELECT a.file_name AS fileName FROM post_media m JOIN media_assets a ON a.id = m.media_id ORDER BY m.position`
      )
      .all<{ fileName: string }>()
  ).results.map((row) => row.fileName);

const cronEnv = (db: D1Database) => ({
  DB: db,
  MEDIA_BUCKET: testMediaBucket(),
  OWNER_TELEGRAM_ID: OWNER_ID,
  TELEGRAM_BOT_TOKEN: TEST_BOT_TOKEN
});

// One Cron invocation of the import share, metered at the D1 binding and by the container's own budget.
async function cronTick(clock: ReturnType<typeof fakeClock>): Promise<number> {
  clock.advance(60_000);
  const metered = meteredDb(testDb());
  const container = createContainer(cronEnv(metered.db), { clock });
  await createMediaImportRunner(container, {
    token: TEST_BOT_TOKEN,
    requestId: 'cron',
    readAppOrigin: () => Promise.resolve(ORIGIN)
  }).runDue(20_000, 2, 0);
  expect(metered.meter.statements).toBeLessThanOrEqual(LIMIT);
  expect(metered.meter.roundTrips).toBeLessThanOrEqual(LIMIT);
  expect(container.queryBudget.used()).toBeLessThanOrEqual(LIMIT);
  return metered.meter.statements;
}

const expectAllAttachedOnce = async (size: number) => {
  expect(await mediaNames()).toEqual(Array.from({ length: size }, (_, index) => `telegram-u-f${index}.jpg`));
  expect(await count('bot_media_import_files', "status = 'done'")).toBe(size);
  expect(sent.filter((body) => body.includes('Файлы загружены'))).toHaveLength(1);
};

describe('the file import stays inside one invocation allowance of 50 subrequests', () => {
  it.each([1, 3, 10])(
    'album of %i files through the webhook: every invocation fits, files attach in order',
    async (size) => {
      const clock = fakeClock();
      await seedSession({ token: OWNER_TOKEN });
      const setup = createApi({ clock, botInfo: BOT_INFO, webhookSecret: SECRET, botAdminApi: fakeBotAdminApi() });
      // Three channels: the report carries the most buttons it ever does.
      for (const title of ['A', 'B', 'C']) await seedDestination(setup, { title });

      // One invocation per album update, each with its own meter (as on the platform).
      const apis: { api: ReturnType<typeof createApi>; meter: ReturnType<typeof meteredDb>['meter'] }[] = [];
      for (let index = 0; index < size; index += 1) {
        const metered = meteredDb(testDb());
        const api = createApi({
          clock,
          botInfo: BOT_INFO,
          webhookSecret: SECRET,
          botAdminApi: fakeBotAdminApi(),
          db: metered.db
        });
        apis.push({ api, meter: metered.meter });
        await api.request(`${ORIGIN}/webhooks/telegram`, {
          method: 'POST',
          token: null,
          json: update(index, size > 1),
          headers: { 'x-telegram-bot-api-secret-token': SECRET }
        });
      }
      for (const { api, meter } of apis) {
        await api.settle();
        expect(meter.statements).toBeLessThanOrEqual(LIMIT);
        expect(meter.roundTrips).toBeLessThanOrEqual(LIMIT);
      }
      for (let tick = 0; tick < 30 && (await count('bot_media_imports', 'reported_at IS NULL')) > 0; tick += 1)
        await cronTick(clock);
      await expectAllAttachedOnce(size);
    },
    60_000
  );

  it.each([3, 10])(
    'album of %i files left to Cron: ticks fit, files attach in order, one report',
    async (size) => {
      const clock = fakeClock();
      await seedSession({ token: OWNER_TOKEN });
      const api = createApi({ clock, botInfo: BOT_INFO, webhookSecret: SECRET, botAdminApi: fakeBotAdminApi() });
      for (const title of ['A', 'B', 'C']) await seedDestination(api, { title });
      const post = await seedDraftPost(api);
      const container = createContainer(cronEnv(testDb()), { clock });
      for (let index = 0; index < size; index += 1) {
        await container.mediaImports.enqueue({
          postId: post.id,
          file: {
            fileId: `f${index}`,
            uniqueId: `u-f${index}`,
            kind: 'photo',
            fileName: null,
            mimeType: null,
            size: 29
          },
          messageId: 100 + index,
          caption: null,
          oversized: false,
          captionTooLong: false,
          now: clock.now()
        });
      }
      const spent: number[] = [];
      for (let tick = 0; tick < 40; tick += 1) {
        spent.push(await cronTick(clock));
        if (sent.some((body) => body.includes('Файлы загружены'))) break;
      }
      expect(Math.max(...spent)).toBeLessThanOrEqual(LIMIT);
      await expectAllAttachedOnce(size);
    },
    60_000
  );
});
