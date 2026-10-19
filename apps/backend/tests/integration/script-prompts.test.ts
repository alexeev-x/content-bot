import { beforeEach, describe, expect, it } from 'vitest';
import { handleScriptPromptTap, raiseScriptPrompts } from '../../src/app/workflows/script-prompts';
import { createD1ScriptLinksRepository } from '../../src/modules/ai';
import {
  createD1ContentAlertRepository,
  createD1ContentAnalyticsRepository
} from '../../src/modules/content-analytics';
import { testDb } from '../helpers/db';
import { fakeClock, resetDb, START } from '../helpers/harness';

// A new video gets its approved script (owner, 19.10.2026): linked when the match is clear, asked once
// otherwise, the same title on both platforms being one video. A wrong link would teach the analysis the wrong
// hook, and a repeated question would nag, so both are pinned here.

const DAY = 86_400_000;
const ZONE = 'Europe/Moscow';

async function seedItem(id: string, platform: string, title: string, publishedAt: number) {
  await testDb()
    .prepare(
      `INSERT INTO content_items (id, platform, title, url, published_at, views, observed_at)
       VALUES (?, ?, ?, 'https://example.com/v', ?, 100, ?)`
    )
    .bind(id, platform, title, publishedAt, publishedAt)
    .run();
}

let generation = 0;
async function seedApproved(revisionId: string, format: string, text: string, at: number) {
  generation += 1;
  const generationId = `00000000-0000-4000-8000-${String(generation).padStart(12, '0')}`;
  await testDb().batch([
    testDb()
      .prepare(
        `INSERT INTO ai_generations (id, kind, format, mode, source, task, status, pack_revision, created_at, updated_at)
         VALUES (?, 'draft', ?, 'direct', 'bot', 'задание', 'ready', 'pack', ?, ?)`
      )
      .bind(generationId, format, at, at),
    testDb()
      .prepare(
        `INSERT INTO ai_text_revisions (id, generation_id, provenance, text, edit_ratio, created_at)
         VALUES (?, ?, 'OWNER_APPROVED', ?, 0.3, ?)`
      )
      .bind(revisionId, generationId, text, at)
  ]);
}

const ORACLE = '00000000-0000-4000-8000-0000000000a1';
const LION = '00000000-0000-4000-8000-0000000000a2';
const BKB = '00000000-0000-4000-8000-0000000000a3';

const deps = () => ({
  analytics: createD1ContentAnalyticsRepository(testDb()),
  alerts: createD1ContentAlertRepository(testDb()),
  links: createD1ScriptLinksRepository(testDb()),
  clock: fakeClock(),
  newId: () => crypto.randomUUID(),
  timezone: ZONE
});

const links = () =>
  testDb()
    .prepare('SELECT content_item_id AS item, revision_id AS revision FROM content_ai_links ORDER BY item')
    .all<{ item: string; revision: string }>()
    .then((rows) => rows.results);

const alerts = () =>
  testDb()
    .prepare("SELECT id, html, buttons FROM content_alerts WHERE id LIKE 'script:%'")
    .all<{ id: string; html: string; buttons: string }>()
    .then((rows) => rows.results);

beforeEach(async () => {
  await resetDb();
  generation = 0;
});

describe('script prompts', () => {
  it('links a clear match on both platforms and reports it with an undo button, once', async () => {
    await seedApproved(
      ORACLE,
      'igrat',
      'Как я на Оракле играл: лечил врагов, кидал фортуну мимо, Оракл бедный.',
      START - 2 * DAY
    );
    await seedApproved(BKB, 'fidit', 'БКБ покупают только нубы.', START - 3 * DAY);
    await seedItem(
      'youtube:o',
      'youtube',
      'Как я на оракле играл. Лечил врагов, фортуна мимо. Учусь играть в доту',
      START - DAY
    );
    await seedItem(
      'tiktok:o',
      'tiktok',
      'Как я на оракле играл. Лечил врагов, фортуна мимо. Учусь играть в доту',
      START - DAY
    );

    const both = await Promise.all([raiseScriptPrompts(deps()), raiseScriptPrompts(deps())]);
    expect(both.reduce((sum, raised) => sum + raised, 0)).toBe(1);
    expect(await links()).toEqual([
      { item: 'tiktok:o', revision: ORACLE },
      { item: 'youtube:o', revision: ORACLE }
    ]);
    const [alert] = await alerts();
    expect(alert?.html).toContain('🔗 <b>Привязал сценарий</b>');
    expect(alert?.buttons).toContain('Не тот сценарий');
    expect(await raiseScriptPrompts(deps())).toBe(0);

    // «Не тот сценарий» removes both links, once.
    const promptId = alert!.id.slice('script:'.length);
    const tap = await handleScriptPromptTap(deps(), `sl:${promptId}:u:0`);
    expect(tap.notice).toBe('Отвязал. Ролик теперь без сценария.');
    expect(await links()).toEqual([]);
    expect((await handleScriptPromptTap(deps(), `sl:${promptId}:u:0`)).notice).toBe('Эта кнопка устарела.');
  });

  it('asks when unsure, shows the next candidate on «Другой», and links on «Да»', async () => {
    await seedApproved(LION, 'igrat', 'Лион: ульта в крипа.', START - 2 * DAY);
    await seedApproved(ORACLE, 'igrat', 'Оракл: фортуна мимо.', START - 4 * DAY);
    await seedItem('youtube:x', 'youtube', 'Новый герой. Учусь играть в доту. Часть 70', START - DAY);

    expect(await raiseScriptPrompts(deps())).toBe(1);
    const [alert] = await alerts();
    expect(alert?.html).toContain('Снят по этому сценарию?');
    expect(await links()).toEqual([]);
    const promptId = alert!.id.slice('script:'.length);

    const other = await handleScriptPromptTap(deps(), `sl:${promptId}:o:0`);
    expect(other.edit?.html).toContain('Оракл: фортуна мимо.');
    // The first candidate's buttons are stale now: they cannot link the script no longer on screen.
    expect((await handleScriptPromptTap(deps(), `sl:${promptId}:y:0`)).notice).toBe('Эта кнопка устарела.');
    const yes = await handleScriptPromptTap(deps(), `sl:${promptId}:y:1`);
    expect(yes.notice).toContain('Привязал');
    expect(await links()).toEqual([{ item: 'youtube:x', revision: ORACLE }]);
  });

  it('does not auto-link by the rubric words alone (review 19.10.2026)', async () => {
    await seedApproved(BKB, 'fidit', 'Почему новички начинают фидить в доту на Инвокере.', START - 2 * DAY);
    await seedItem('youtube:f', 'youtube', 'Почему я фидю на Пудже | Учу фидить в доту', START - DAY);
    expect(await raiseScriptPrompts(deps())).toBe(1);
    expect(await links()).toEqual([]);
    expect((await alerts())[0]?.html).toContain('Снят по этому сценарию?');
  });

  it('adds the copy collected later on the other platform and links it to the same script', async () => {
    await seedApproved(
      ORACLE,
      'igrat',
      'Как я на Оракле играл: лечил врагов, кидал фортуну мимо, Оракл бедный.',
      START - 2 * DAY
    );
    await seedItem(
      'youtube:o',
      'youtube',
      'Как я на оракле играл. Лечил врагов, фортуна мимо. Учусь играть в доту',
      START - DAY
    );
    await raiseScriptPrompts(deps());
    expect(await links()).toEqual([{ item: 'youtube:o', revision: ORACLE }]);
    await seedItem(
      'tiktok:o',
      'tiktok',
      'Как я на оракле играл. Лечил врагов, фортуна мимо. Учусь играть в доту',
      START - DAY
    );
    expect(await raiseScriptPrompts(deps())).toBe(0);
    expect(await links()).toEqual([
      { item: 'tiktok:o', revision: ORACLE },
      { item: 'youtube:o', revision: ORACLE }
    ]);
  });

  it('raises the message again for a prompt stored without it', async () => {
    await seedApproved(LION, 'igrat', 'Лион: ульта в крипа.', START - 2 * DAY);
    await seedItem('youtube:x', 'youtube', 'Новый герой. Учусь играть в доту. Часть 70', START - DAY);
    await raiseScriptPrompts(deps());
    await testDb().prepare("DELETE FROM content_alerts WHERE id LIKE 'script:%'").run();
    expect(await raiseScriptPrompts(deps())).toBe(1);
    expect((await alerts())[0]?.html).toContain('Лион: ульта в крипа.');
  });

  it('closes a video with no script approved before it, and leaves a video linked by hand alone', async () => {
    await seedItem('youtube:n', 'youtube', 'Ролик без сценария', START - DAY);
    expect(await raiseScriptPrompts(deps())).toBe(0);
    const closed = await testDb()
      .prepare("SELECT status FROM ai_script_prompts WHERE title = 'Ролик без сценария'")
      .first<{ status: string }>();
    expect(closed?.status).toBe('none');

    await seedApproved(LION, 'igrat', 'Лион: ульта в крипа.', START - 2 * DAY);
    await seedItem('tiktok:h', 'tiktok', 'Лион ульта в крипа', START - DAY);
    await createD1ScriptLinksRepository(testDb()).link({ itemId: 'tiktok:h', revisionId: LION, now: START });
    expect(await raiseScriptPrompts(deps())).toBe(0);
    expect(await alerts()).toEqual([]);
  });
});
