import { apiErrorSchema, sendRichSamplesResponseSchema } from '@alexeev/contracts';
import { GrammyError } from 'grammy';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TelegramRichMessageApi } from '../../src/integrations/telegram/telegram-api';
import { createApi, fakeClock, OWNER_ID, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';
import { seedDestination } from '../helpers/publishing';

const DAY = 24 * 60 * 60_000;
const DEV = { RICH_SAMPLES: 'true' };
const noNetwork: typeof fetch = () => Promise.reject(new Error('offline'));

// Records every send; `refuse` makes the rich sends with that text fail as Telegram's 400 would.
function recordingApi(refuse?: string) {
  const sent: { chatId: string; kind: 'rich' | 'classic'; html: string }[] = [];
  const api: TelegramRichMessageApi = {
    sendRichMessage(chatId, { html }) {
      sent.push({ chatId, kind: 'rich', html });
      if (refuse !== undefined && html.includes(refuse))
        return Promise.reject(
          new GrammyError(
            'Call to sendRichMessage failed!',
            { ok: false, error_code: 400, description: 'Bad Request: unsupported tag' },
            'sendRichMessage',
            {}
          )
        );
      return Promise.resolve({ message_id: sent.length });
    },
    sendClassicHtml(chatId, html) {
      sent.push({ chatId, kind: 'classic', html });
      return Promise.resolve({ message_id: sent.length });
    }
  };
  return { api, sent };
}

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * DAY });
});

describe('POST /api/v1/sources/rich-samples', () => {
  it('is refused where the Worker does not allow it, and nothing is sent', async () => {
    const { api: rich, sent } = recordingApi();
    const api = createApi({ clock: fakeClock(), richMessages: rich, contentFetch: noNetwork });
    await seedDestination(api, { title: 'Тест канал', chatId: '-1001' });
    const response = await api.request('/api/v1/sources/rich-samples', { method: 'POST' });
    expect(response.status).toBe(403);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe('FORBIDDEN');
    expect(sent).toEqual([]);
  });

  it('sends only to the channel named «Тест…» and the owner, never to another channel', async () => {
    const { api: rich, sent } = recordingApi();
    const api = createApi({ clock: fakeClock(), richMessages: rich, contentFetch: noNetwork, env: DEV });
    await seedDestination(api, { title: 'Основной канал', chatId: '-1002' });
    await seedDestination(api, { title: 'Тест канал', chatId: '-1001' });
    const response = await api.request('/api/v1/sources/rich-samples', { method: 'POST' });
    expect(response.status).toBe(200);
    const { results } = sendRichSamplesResponseSchema.parse(await response.json());
    expect(results.every((each) => each.status === 'sent')).toBe(true);
    expect(new Set(sent.map((each) => each.chatId))).toEqual(new Set(['-1001', OWNER_ID]));
    // Without Valve's CDN the uploaded picture falls back to its URL.
    expect(sent.some((each) => each.html.includes('tg://photo'))).toBe(false);
  });

  it('reports a refused sample with Telegram’s text and goes on with the rest', async () => {
    const { api: rich } = recordingApi('<blockquote expandable>');
    const api = createApi({ clock: fakeClock(), richMessages: rich, contentFetch: noNetwork, env: DEV });
    await seedDestination(api, { title: 'Тест канал', chatId: '-1001' });
    const { results } = sendRichSamplesResponseSchema.parse(
      await (await api.request('/api/v1/sources/rich-samples', { method: 'POST' })).json()
    );
    const failed = results.filter((each) => each.status === 'failed');
    expect(failed.map((each) => each.error)).toEqual(['Bad Request: unsupported tag', 'Bad Request: unsupported tag']);
    expect(results.filter((each) => each.status === 'sent').length).toBeGreaterThan(0);
  });

  it('is a conflict without an enabled test channel', async () => {
    const { api: rich, sent } = recordingApi();
    const api = createApi({ clock: fakeClock(), richMessages: rich, contentFetch: noNetwork, env: DEV });
    await seedDestination(api, { title: 'Основной канал', chatId: '-1002' });
    const response = await api.request('/api/v1/sources/rich-samples', { method: 'POST' });
    expect(response.status).toBe(409);
    const body = apiErrorSchema.parse(await response.json());
    expect(body.error.details?.reason).toBe('NO_TEST_CHANNEL');
    expect(sent).toEqual([]);
  });
});
