import { aiLessonAnswerSchema, aiLessonsSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../helpers/db';
import { expectError } from '../helpers/expect-error';
import { createApi, fakeClock, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function seedLesson(id: string, status: string, text: string, at: number): Promise<void> {
  await testDb()
    .prepare(
      `INSERT INTO ai_style_lessons (id, text, scope, status, from_remark, created_at, updated_at)
       VALUES (?, ?, 'telegram', ?, 0, ?, ?)`
    )
    .bind(id, text, status, at, at)
    .run();
}

const answer = (api: ReturnType<typeof createApi>, id: string, value: 'accept' | 'reject') =>
  api.request(`/api/v1/ai/lessons/${id}`, { method: 'PUT', json: { answer: value } });

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 86_400_000 });
});

describe('/api/v1/ai/lessons', () => {
  it('lists open lessons asked first and answers one once, whatever repeats', async () => {
    const api = createApi({ clock: fakeClock() });
    await seedLesson(uuid(1), 'seen', 'Концовка без вопроса к зрителю', START + 3);
    await seedLesson(uuid(2), 'asked', 'Хук — первым предложением', START + 1);
    await seedLesson(uuid(3), 'asked', 'Без смайлов в конце', START + 2);
    await seedLesson(uuid(4), 'rejected', 'Отклонённый урок', START + 4);

    const list = aiLessonsSchema.parse(await (await api.request('/api/v1/ai/lessons')).json());
    expect(list.items.map((item) => `${item.status}:${item.id}`)).toEqual([
      `asked:${uuid(3)}`,
      `asked:${uuid(2)}`,
      `seen:${uuid(1)}`
    ]);

    for (let n = 0; n < 2; n += 1) {
      const response = await answer(api, uuid(2), 'accept');
      expect(aiLessonAnswerSchema.parse(await response.json())).toEqual({ id: uuid(2), status: 'accepted' });
    }
    const rules = await testDb()
      .prepare(`SELECT count(*) AS n FROM ai_rules WHERE text = 'Хук — первым предложением' AND status = 'active'`)
      .first<{ n: number }>();
    expect(rules?.n).toBe(1);

    await expectError(await answer(api, uuid(2), 'reject'), 409, 'CONFLICT');
    expect((await answer(api, uuid(3), 'reject')).status).toBe(200);
    // A seen lesson was never asked; an unknown id is not a lesson.
    await expectError(await answer(api, uuid(1), 'accept'), 404, 'NOT_FOUND');
    await expectError(await answer(api, uuid(9), 'accept'), 404, 'NOT_FOUND');
    await expectError(
      await api.request(`/api/v1/ai/lessons/${uuid(1)}`, { method: 'PUT', json: { answer: 'maybe' } }),
      400,
      'VALIDATION_ERROR'
    );
  });

  it('refuses «Учитывать» when the rules in use are full and keeps the lesson asked', async () => {
    const api = createApi({ clock: fakeClock() });
    const statements = Array.from({ length: 15 }, (_, n) =>
      testDb()
        .prepare(
          `INSERT INTO ai_rules (id, text, scope, source, status, created_at, updated_at)
           VALUES (?, ?, 'all', 'owner', 'active', ?, ?)`
        )
        .bind(uuid(100 + n), `Правило ${n}`, START, START)
    );
    await testDb().batch(statements);
    await seedLesson(uuid(2), 'asked', 'Хук — первым предложением', START);
    const response = await answer(api, uuid(2), 'accept');
    await expectError(response, 409, 'CONFLICT');
    const list = aiLessonsSchema.parse(await (await api.request('/api/v1/ai/lessons')).json());
    expect(list.items[0]?.status).toBe('asked');
  });
});
