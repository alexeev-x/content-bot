import { createContainer } from '../../src/app/container';
import { createMediaImportRunner } from '../../src/app/bot/media-import-runner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBotAdminApi } from '../helpers/fake-bot-admin-api';
import { fakeOwnerMessenger } from '../helpers/fake-owner-messenger';
import { testDb } from '../helpers/db';
import {
  type Api,
  createApi,
  fakeClock,
  OWNER_ID,
  OWNER_TOKEN,
  resetDb,
  seedSession,
  TEST_BOT_TOKEN,
  openPostMode
} from '../helpers/harness';
import { testMediaBucket } from '../helpers/media-bucket';
import { count, seedDraftPost } from '../helpers/publishing';

const SECRET = 'hook-secret-PLACEHOLDER';
const BOT_INFO = JSON.stringify({ id: 123456, is_bot: true, first_name: 'Bot', username: 'content_bot' });
const ORIGIN = 'https://studio.example.com';

let api: Api;
let replies: { text: string }[];
// file_id -> declared size and bytes the fake Telegram serves
let files: Map<string, { size: number; bytes: Uint8Array }>;
let downloads: number;
let inFlight: number;
let maxInFlight: number;
// When set, Telegram refuses sendMessage.
let refuseSend: boolean;
// When set, downloads wait for it: a slow Telegram.
let gate: Promise<void> | null;

// A minimal JPEG: signature, one APP0 segment and a SOF0 header that carries 640x480.
function jpeg(): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03, 0x01,
    0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9
  ]);
}

beforeEach(async () => {
  await resetDb();
  await openPostMode();
  api = createApi({ clock: fakeClock(), botInfo: BOT_INFO, webhookSecret: SECRET, botAdminApi: fakeBotAdminApi() });
  replies = [];
  files = new Map();
  downloads = 0;
  inFlight = 0;
  maxInFlight = 0;
  refuseSend = false;
  gate = null;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith('/getFile')) {
      const { file_id: fileId } = JSON.parse(String(init?.body ?? '{}')) as { file_id: string };
      const file = files.get(fileId);
      return Promise.resolve(
        Response.json({
          ok: true,
          result: { file_id: fileId, file_path: `photos/${fileId}.jpg`, file_size: file?.size }
        })
      );
    }
    if (url.startsWith(`https://api.telegram.org/file/bot${TEST_BOT_TOKEN}/photos/`)) {
      downloads += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const file = files.get(url.split('/').pop()?.replace('.jpg', '') ?? '');
      const respond = () => new Response(file?.bytes, { headers: { 'content-length': String(file?.bytes.length) } });
      const finish = () => {
        inFlight -= 1;
        return respond();
      };
      return gate === null ? Promise.resolve(finish()) : gate.then(finish);
    }
    if (refuseSend && url.endsWith('/sendMessage')) {
      return Promise.resolve(Response.json({ ok: false, error_code: 500, description: 'x' }, { status: 500 }));
    }
    replies.push(JSON.parse(String(init?.body ?? '{}')) as { text: string });
    return Promise.resolve(Response.json({ ok: true, result: { message_id: 1 } }));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

let updateId = 5000;
function message(extra: Record<string, unknown>, messageId = 10, id = ++updateId) {
  return {
    update_id: id,
    message: {
      message_id: messageId,
      date: 1,
      chat: { id: Number(OWNER_ID), type: 'private', first_name: 'X' },
      from: { id: Number(OWNER_ID), is_bot: false, first_name: 'X' },
      ...extra
    }
  };
}

const photo = (fileId: string, size: number) => [
  { file_id: fileId, file_unique_id: `u-${fileId}`, width: 640, height: 480, file_size: size }
];

const deliver = (update: unknown) =>
  api.request(`${ORIGIN}/webhooks/telegram`, {
    method: 'POST',
    token: null,
    json: update,
    headers: { 'x-telegram-bot-api-secret-token': SECRET }
  });

const posts = () =>
  testDb()
    .prepare('SELECT id, title, body, entities FROM posts')
    .all<{ id: string; title: string; body: string; entities: string }>();

describe('forwarded text keeps its formatting', () => {
  it('keeps the whole text and every entity: nothing is cut into a title (owner, 16.10.2026)', async () => {
    const text = 'Заголовок\nЖирный 😀 и ссылка';
    await deliver(
      message({
        text,
        entities: [
          { type: 'bold', offset: 0, length: 9 },
          { type: 'bold', offset: 10, length: 6 },
          { type: 'text_link', offset: 22, length: 6, url: 'https://example.com/a' }
        ]
      })
    );
    const [row] = (await posts()).results;
    expect(row?.body).toBe(text);
    expect(JSON.parse(row?.entities ?? '[]')).toEqual([
      { type: 'bold', offset: 0, length: 9 },
      { type: 'bold', offset: 10, length: 6 },
      { type: 'text_link', offset: 22, length: 6, url: 'https://example.com/a' }
    ]);
  });
});

// A webhook invocation has little allowance left once its file is in, so the report comes with the next Cron tick.
async function settleWithCron(): Promise<void> {
  await api.settle();
  const clock = fakeClock();
  const messenger = fakeOwnerMessenger();
  for (let tick = 0; tick < 5; tick += 1) {
    clock.advance(60_000);
    const container = createContainer(
      {
        DB: testDb(),
        MEDIA_BUCKET: testMediaBucket(),
        OWNER_TELEGRAM_ID: OWNER_ID,
        TELEGRAM_BOT_TOKEN: TEST_BOT_TOKEN
      },
      { clock, ownerMessenger: messenger }
    );
    const runner = createMediaImportRunner(container, {
      token: TEST_BOT_TOKEN,
      requestId: 'cron',
      readAppOrigin: () => Promise.resolve(ORIGIN)
    });
    const due = await runner.runDue(25_000, 2, 0);
    api.ownerMessages.push(...messenger.sent.splice(0));
    if (due === 0) return;
  }
}

const replyTexts = () => replies.map((reply) => reply.text);
const mediaOf = (postId: string | undefined) =>
  testDb()
    .prepare(
      `SELECT a.file_name AS fileName FROM post_media m JOIN media_assets a ON a.id = m.media_id
       WHERE m.post_id = ?1 ORDER BY m.position`
    )
    .bind(postId)
    .all<{ fileName: string }>();

describe('media from the owner becomes a draft', () => {
  it('answers at once, then attaches the photo and tells the owner', async () => {
    files.set('p1', { size: 29, bytes: jpeg() });
    const response = await deliver(
      message({
        photo: photo('p1', 29),
        caption: 'Подпись\nТекст',
        caption_entities: [{ type: 'italic', offset: 8, length: 5 }]
      })
    );
    expect(response.status).toBe(200);
    expect(replyTexts()).toEqual(['Черновик создан, файлы загружаются…']);
    // Only the Studio button: a publish tap now would approve the post before the photo is attached.
    expect(
      (replies[0] as { reply_markup?: { inline_keyboard: { text: string }[][] } }).reply_markup?.inline_keyboard
        .flat()
        .map((button) => button.text)
    ).toEqual(['Открыть в Студии']);
    await settleWithCron();
    const [row] = (await posts()).results;
    expect(row).toMatchObject({ title: 'Подпись', body: 'Подпись\nТекст' });
    expect(JSON.parse(row?.entities ?? '[]')).toEqual([{ type: 'italic', offset: 8, length: 5 }]);
    expect(await mediaOf(row?.id)).toHaveProperty('results.length', 1);
    expect(api.ownerMessages.map((m) => m.html)).toEqual(['Файлы загружены в черновик: 1.']);
    expect(api.ownerMessages[0]?.button).toEqual({
      text: 'Открыть в Студии',
      url: `${ORIGIN}/posts/${row?.id}`
    });
  });

  it('keeps the webhook fast when Telegram is slow and finishes the import in the background', async () => {
    files.set('s1', { size: 29, bytes: jpeg() });
    let release = () => {};
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const response = await deliver(message({ photo: photo('s1', 29), caption: 'Медленно' }));
    expect(response.status).toBe(200);
    expect(await count('post_media')).toBe(0);
    release();
    await settleWithCron();
    expect(await count('post_media')).toBe(1);
    expect(downloads).toBe(1);
    expect(api.ownerMessages).toHaveLength(1);
  });

  it('puts ten concurrent album updates into one draft with ten files in order and one download each', async () => {
    const ids = Array.from({ length: 10 }, (_, index) => `g${index}`);
    for (const id of ids) files.set(id, { size: 29, bytes: jpeg() });
    // Telegram order is the message id; arrival order is shuffled.
    const arrival = [7, 2, 9, 0, 5, 3, 8, 1, 6, 4];
    await Promise.all(
      arrival.map((index) =>
        deliver(
          message(
            {
              photo: photo(`g${index}`, 29),
              media_group_id: 'grp',
              ...(index === 4 ? { caption: 'Альбом' } : {})
            },
            100 + index
          )
        )
      )
    );
    await settleWithCron();
    const rows = (await posts()).results;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: 'Альбом', body: 'Альбом' });
    expect((await mediaOf(rows[0]?.id)).results.map((media) => media.fileName)).toEqual(
      ids.map((id) => `telegram-u-${id}.jpg`)
    );
    expect(downloads).toBe(10);
    expect(replyTexts()).toEqual(['Черновик создан, файлы загружаются…']);
    expect(api.ownerMessages.map((m) => m.html)).toEqual(['Файлы загружены в черновик: 10.']);
  }, 20_000);

  it('creates nothing twice when the same update is delivered again', async () => {
    files.set('r1', { size: 29, bytes: jpeg() });
    const update = message({ photo: photo('r1', 29), caption: 'Раз' });
    await deliver(update);
    await deliver(update);
    await api.settle();
    expect(await count('posts')).toBe(1);
    expect(await count('post_media')).toBe(1);
    expect(downloads).toBe(1);
    expect(replyTexts()).toEqual(['Черновик создан, файлы загружаются…']);
  });

  it('keeps the draft without the file and reports it when the file is over the limit', async () => {
    const response = await deliver(
      message({
        video: { file_id: 'big', file_unique_id: 'u-big', width: 1, height: 1, duration: 1, file_size: 30_000_000 },
        caption: 'Видео'
      })
    );
    expect(response.status).toBe(200);
    await api.settle();
    expect((await posts()).results[0]?.title).toBe('Видео');
    expect(await count('post_media')).toBe(0);
    expect(downloads).toBe(0);
    expect(api.ownerMessages[0]?.html).toContain('слишком большой');
  });

  it('ignores a photo from anyone but the owner', async () => {
    files.set('x1', { size: 29, bytes: jpeg() });
    const stranger = message({ photo: photo('x1', 29) });
    stranger.message.from.id = 999;
    stranger.message.chat.id = 999;
    await deliver(stranger);
    await api.settle();
    expect(await count('posts')).toBe(0);
    expect(replies).toEqual([]);
    expect(downloads).toBe(0);
  });

  it('answers a sticker with the unsupported text and stores no draft', async () => {
    await deliver(message({ sticker: { file_id: 's', file_unique_id: 'us', type: 'regular', width: 1, height: 1 } }));
    expect(await count('posts')).toBe(0);
    expect(replyTexts()).toEqual(['Этот тип сообщения пока не превращается в черновик']);
  });

  it('stays silent on a service message', async () => {
    await deliver(message({ write_access_allowed: { from_request: true } }));
    expect(replies).toEqual([]);
    expect(await count('posts')).toBe(0);
  });
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('review fixes', () => {
  it('keeps the caption of an album item that arrives while the first file is still downloading', async () => {
    files.set('c0', { size: 29, bytes: jpeg() });
    files.set('c1', { size: 29, bytes: jpeg() });
    let release = () => {};
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await deliver(message({ photo: photo('c0', 29), media_group_id: 'late' }, 200));
    while (downloads === 0) await sleep(20);
    await deliver(message({ photo: photo('c1', 29), media_group_id: 'late', caption: 'Альбом' }, 201));
    release();
    await settleWithCron();
    const [row] = (await posts()).results;
    expect(row?.title).toBe('Альбом');
    expect(await count('post_media')).toBe(2);
    expect(api.ownerMessages.map((m) => m.html)).toEqual(['Файлы загружены в черновик: 2.']);
  }, 20_000);

  it('keeps every file of an album whose item has a too long caption and says so once', async () => {
    files.set('l0', { size: 29, bytes: jpeg() });
    files.set('l1', { size: 29, bytes: jpeg() });
    await deliver(message({ photo: photo('l0', 29), media_group_id: 'long' }, 300));
    await deliver(
      message({ photo: photo('l1', 29), media_group_id: 'long', caption: `Заголовок\n${'я'.repeat(4100)}` }, 301)
    );
    await settleWithCron();
    expect(replyTexts()).toEqual(['Черновик создан, файлы загружаются…']);
    expect(await count('post_media')).toBe(2);
    expect((await posts()).results[0]?.title).toBe('Без текста');
    expect(api.ownerMessages.map((m) => m.html)).toEqual([
      'Файлы загружены в черновик: 2.\nПодпись длиннее 4096 символов, она не сохранена.'
    ]);
  }, 20_000);

  it('keeps the file of a single photo whose caption is too long', async () => {
    files.set('l2', { size: 29, bytes: jpeg() });
    await deliver(message({ photo: photo('l2', 29), caption: `Заголовок\n${'я'.repeat(4100)}` }));
    await settleWithCron();
    expect(replyTexts()).toEqual(['Черновик создан, файлы загружаются…']);
    expect(await count('post_media')).toBe(1);
    expect(api.ownerMessages[0]?.html).toContain('Подпись длиннее 4096');
  });

  it('never downloads two files at once for two separate drafts; Cron finishes the other', async () => {
    files.set('d1', { size: 29, bytes: jpeg() });
    files.set('d2', { size: 29, bytes: jpeg() });
    let release = () => {};
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await Promise.all([
      deliver(message({ photo: photo('d1', 29), caption: 'Один' }, 400)),
      deliver(message({ photo: photo('d2', 29), caption: 'Два' }, 401))
    ]);
    while (downloads === 0) await sleep(20);
    release();
    await api.settle();
    expect(maxInFlight).toBe(1);
    expect(await count('post_media')).toBe(1);
    expect(await count('bot_media_import_files', "status = 'pending'")).toBe(1);

    const clock = fakeClock();
    clock.advance(60_000);
    const container = createContainer(
      {
        DB: testDb(),
        MEDIA_BUCKET: testMediaBucket(),
        OWNER_TELEGRAM_ID: OWNER_ID,
        TELEGRAM_BOT_TOKEN: TEST_BOT_TOKEN
      },
      { clock }
    );
    const runner = createMediaImportRunner(container, {
      token: TEST_BOT_TOKEN,
      requestId: 'cron',
      readAppOrigin: () => Promise.resolve(ORIGIN)
    });
    // Both: the first draft's report did not fit the webhook invocation's allowance.
    expect(await runner.runDue(25_000, 2, 0)).toBe(2);
    expect(maxInFlight).toBe(1);
    expect(downloads).toBe(2);
    expect(await count('post_media')).toBe(2);
  }, 20_000);

  describe('the report of an import that Cron finishes', () => {
    async function finishWithoutOrigin() {
      files.set('n1', { size: 29, bytes: jpeg() });
      await seedSession({ token: OWNER_TOKEN });
      const post = await seedDraftPost(api);
      const container = createContainer(
        {
          DB: testDb(),
          MEDIA_BUCKET: testMediaBucket(),
          OWNER_TELEGRAM_ID: OWNER_ID,
          TELEGRAM_BOT_TOKEN: TEST_BOT_TOKEN
        },
        { clock: fakeClock() }
      );
      await container.mediaImports.enqueue({
        postId: post.id,
        file: { fileId: 'n1', uniqueId: 'u-n1', kind: 'photo', fileName: null, mimeType: 'image/jpeg', size: 29 },
        messageId: 1,
        caption: null,
        oversized: false,
        captionTooLong: false,
        now: container.clock.now()
      });
      const runner = createMediaImportRunner(container, {
        token: TEST_BOT_TOKEN,
        requestId: 'cron',
        readAppOrigin: () => Promise.resolve(null)
      });
      await runner.run(post.id, 25_000);
    }
    const reportedAt = () =>
      testDb().prepare('SELECT reported_at AS at FROM bot_media_imports').first<{ at: number | null }>();

    it('delivers the text without the Studio button when the origin is unknown', async () => {
      await finishWithoutOrigin();
      expect(replies).toHaveLength(1);
      expect(replies[0]).toMatchObject({ text: 'Файлы загружены в черновик: 1.' });
      expect(replies[0]).not.toHaveProperty('reply_markup');
      expect((await reportedAt())?.at).not.toBeNull();
    });

    it('does not mark the report sent when Telegram refused it', async () => {
      refuseSend = true;
      await finishWithoutOrigin();
      expect((await reportedAt())?.at).toBeNull();
    });
  });
});
