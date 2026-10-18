import { beforeEach, describe, expect, it } from 'vitest';
import { createD1AiRepository, createD1WriterRepository, readAiOverview } from '../../src/modules/ai';
import { testDb } from '../helpers/db';
import { fakeClock, resetDb } from '../helpers/harness';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
let seq = 0;
const id = () => `00000000-0000-4000-8000-${String((seq += 1)).padStart(12, '0')}`;

async function generation(input: {
  format: string;
  source?: string;
  result?: string | null;
  createdAt: number;
}): Promise<string> {
  const genId = id();
  await testDb()
    .prepare(
      `INSERT INTO ai_generations (id, kind, format, mode, source, task, status, result, pack_revision, created_at, updated_at)
       VALUES (?, 'draft', ?, 'direct', ?, 'задание', 'ready', ?, 'pack', ?, ?)`
    )
    .bind(
      genId,
      input.format,
      input.source ?? 'bot',
      input.result === undefined ? 'draft' : input.result,
      input.createdAt,
      input.createdAt
    )
    .run();
  return genId;
}

async function approve(genId: string, at: number, ratio: number, changedParts: string[] | null = null) {
  await testDb()
    .prepare(
      `INSERT INTO ai_text_revisions (id, generation_id, provenance, text, edit_ratio, changed_parts, created_at)
       VALUES (?, ?, 'OWNER_APPROVED', 'текст', ?, ?, ?)`
    )
    .bind(id(), genId, ratio, changedParts === null ? null : JSON.stringify(changedParts), at)
    .run();
}

beforeEach(async () => {
  await resetDb();
});

describe('AI quality by format and the previous period', () => {
  it('keeps every format apart, leaves studio drafts and questions out, and reports the median in minutes', async () => {
    const writer = createD1WriterRepository(testDb());
    // fidit: odd count of approvals (3, 5, 10 minutes) -> median 5.
    for (const [minutes, parts] of [
      [3, ['hook']],
      [5, ['hook', 'ending']],
      [10, []]
    ] as const) {
      await approve(await generation({ format: 'fidit', createdAt: 1000 }), 1000 + minutes * MIN, 0.5, [...parts]);
    }
    // igrat: even count (2 and 4 minutes) -> median 3; one untagged approval, one unchanged.
    await approve(await generation({ format: 'igrat', createdAt: 1000 }), 1000 + 2 * MIN, 0.02);
    await approve(await generation({ format: 'igrat', createdAt: 1000 }), 1000 + 4 * MIN, 0.4, ['ending']);
    // A studio draft and a question count nowhere in the format's drafts.
    await generation({ format: 'igrat', source: 'studio', createdAt: 1000 });
    await generation({ format: 'telegram', result: 'needs_facts', createdAt: 1000 });
    const joke = await generation({ format: 'telegram', createdAt: 1000 });
    await testDb()
      .prepare("INSERT INTO ai_feedback (id, generation_id, kind, created_at) VALUES (?, ?, 'joke_missed', 2000)")
      .bind(id(), joke)
      .run();

    const { byFormat } = await writer.quality(0);
    const of = (format: string) => byFormat.find((row) => row.format === format);
    expect(byFormat.map((row) => row.format)).toEqual(['fidit', 'igrat', 'standalone', 'telegram']);
    expect(of('fidit')).toMatchObject({
      drafts: 3,
      questions: 0,
      approved: 3,
      approvedUnchanged: 0,
      medianMinutesToApproval: 5,
      jokeMissed: 0
    });
    expect(of('fidit')?.hookChangedShare).toBeCloseTo(2 / 3);
    expect(of('fidit')?.endingChangedShare).toBeCloseTo(1 / 3);
    expect(of('igrat')).toMatchObject({
      drafts: 2,
      approved: 2,
      approvedUnchanged: 1,
      medianMinutesToApproval: 3,
      hookChangedShare: 0,
      jokeMissed: 0
    });
    expect(of('igrat')?.averageEditRatio).toBeCloseTo(0.21);
    expect(of('telegram')).toMatchObject({
      drafts: 1,
      questions: 1,
      approved: 0,
      averageEditRatio: null,
      hookChangedShare: null,
      medianMinutesToApproval: null,
      jokeMissed: 1
    });
    expect(of('standalone')).toMatchObject({ drafts: 0, questions: 0, approved: 0, jokeMissed: 0 });
  });

  it('counts the previous period as [from, to) and compares only when both have enough approvals', async () => {
    const writer = createD1WriterRepository(testDb());
    const clock = fakeClock();
    const now = clock.now();
    const since = now - 30 * DAY;
    const fromPrevious = since - 30 * DAY;
    const approvals = async (count: number, at: number) => {
      for (let n = 0; n < count; n += 1)
        await approve(await generation({ format: 'igrat', createdAt: at - 1 }), at, 0.2);
    };
    await approvals(1, fromPrevious - 1); // before the window
    await approvals(2, fromPrevious); // first instant of the window
    await approvals(1, since - 1); // last instant of the window
    await approvals(1, since); // belongs to the current period
    const window = await writer.periodApprovals(fromPrevious, since);
    expect(window.approved).toBe(3);
    expect(window.averageEditRatio).toBeCloseTo(0.2);

    const overview = async () =>
      (
        await readAiOverview({
          repo: createD1AiRepository(testDb()),
          writer,
          clock,
          timezone: 'UTC',
          keyConfigured: false
        })
      ).quality;
    await approvals(9, now - DAY);
    expect((await overview()).previous).toMatchObject({ approved: 3, comparable: false });
    await approvals(7, since - DAY);
    // Previous: 10, current: 10 -> comparable; one fewer on either side is not.
    expect((await overview()).previous).toMatchObject({ approved: 10, comparable: true });
    await testDb()
      .prepare('DELETE FROM ai_text_revisions WHERE created_at = ?')
      .bind(now - DAY)
      .run();
    await approvals(8, now - DAY);
    expect((await overview()).previous?.comparable).toBe(false);
  });
});
