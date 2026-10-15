import { messagePreviewsResultSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../helpers/db';
import { expectError } from '../helpers/expect-error';
import { fakeOwnerMessenger } from '../helpers/fake-owner-messenger';
import { createApi, fakeClock, OWNER_ID, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';

const DAY = 24 * 60 * 60_000;
const PATH = '/api/v1/content-analytics/message-previews';

async function insertItem(id: string, title: string, publishedAt: number, views: number): Promise<void> {
  await testDb()
    .prepare(
      `INSERT INTO content_items (id, platform, title, url, published_at, views, observed_at)
       VALUES (?, 'telegram', ?, 'https://example.test', ?, ?, ?)`
    )
    .bind(`telegram:${id}`, title, publishedAt, views, START)
    .run();
}

/** Telegram rejects the whole message on one unclosed tag or a bare `<`/`&`: every tag must nest. */
function expectWellFormed(html: string): void {
  const stack: string[] = [];
  for (const match of html.matchAll(/<(\/?)([a-z]+)(?: expandable)?>|<|&(?!(?:amp|lt|gt);)/g)) {
    expect(match[2], `bare markup character in: ${html}`).toBeDefined();
    if (match[1] === '/') expect(stack.pop()).toBe(match[2]);
    else stack.push(match[2]!);
  }
  expect(stack).toEqual([]);
}

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN });
});

describe('bot message catalog', () => {
  it('sends every message the bot sends the owner, with markup Telegram accepts', async () => {
    // Two weeks of posts, one title with markup characters that must arrive escaped.
    for (let index = 0; index < 10; index += 1)
      await insertItem(
        `p${index}`,
        index === 0 ? 'Пудж <b> & Инвокер' : `Пост ${index}`,
        START - (5 + index) * DAY,
        300 + index * 120
      );
    const messenger = fakeOwnerMessenger();
    const api = createApi({ clock: fakeClock(), ownerMessenger: messenger });

    const response = await api.request(PATH, { method: 'POST' });
    expect(response.status).toBe(200);
    const { sent } = messagePreviewsResultSchema.parse(await response.json());
    expect(sent).toBe(messenger.sent.length);
    // Intro, 4 section headings, 8 publication, 6 bot, 5 Dota and 21 analytics messages.
    expect(sent).toBe(45);
    for (const message of messenger.sent) {
      expect(message.chatId).toBe(OWNER_ID);
      expectWellFormed(message.html);
    }
    expect(messenger.sent.some((message) => message.html.includes('Пудж &lt;b&gt; &amp; Инвокер'))).toBe(true);
  });

  it('answers UNAVAILABLE when Telegram rejects a message', async () => {
    const api = createApi({
      clock: fakeClock(),
      ownerMessenger: fakeOwnerMessenger({ fail: () => new Error('chat not found') })
    });
    await expectError(await api.request(PATH, { method: 'POST' }), 503, 'UNAVAILABLE');
  });
});
