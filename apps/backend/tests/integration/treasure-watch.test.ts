import { beforeEach, describe, expect, it } from 'vitest';
import { createContainer, type Container } from '../../src/app/container';
import type { AiJob } from '../../src/app/bot/ai-job';
import { aiJobSchema } from '../../src/app/bot/ai-job';
import { followUpTask, runTreasureWatch } from '../../src/app/workflows/treasure-watch';
import { parseTreasureWikitext } from '../../src/modules/dota';
import trove from '../fixtures/trove-of-terror.json';
import { testDb } from '../helpers/db';
import {
  createApi,
  fakeClock,
  type FakeClock,
  OWNER_ID,
  OWNER_TOKEN,
  resetDb,
  seedSession,
  START
} from '../helpers/harness';
import { testMediaBucket } from '../helpers/media-bucket';
import { jobOf, seedApprovedPost, seedDestination, seedPublication } from '../helpers/publishing';

// The Liquipedia watch of a treasure without its own page (owner, 22.10.2026; migration 0101), on the real
// Trove of Terror page (fixture of 22.10.2026).

const MINUTE = 60_000;
const NEW_SET = '{{Cosmetic|Grin of the Ghoul King}}';
let clock: FakeClock;
let container: Container;
let queued: AiJob[];
let requests: string[];
/** The page as Liquipedia has it now; a test edits it. */
let wiki: { revision: number; text: string };
/** Pages the announcement's phrases name, besides the treasure's own. */
let otherPages: Record<string, string>;

/** Liquipedia's API and Valve's price endpoint as they answer for Trove of Terror. */
const fakeFetch = (async (input: string | URL) => {
  const url = new URL(String(input));
  requests.push(url.hostname === 'www.dota2.com' ? 'valve-price' : (url.searchParams.get('prop') ?? 'titles'));
  if (url.hostname === 'www.dota2.com') return Response.json({ 34454: '$4.99' });
  const params = url.searchParams;
  if (params.get('prop') === 'imageinfo') {
    const titles = (params.get('titles') ?? '').split('|');
    return Response.json({
      query: {
        pages: titles.map((title) => ({
          title,
          imageinfo: [
            { url: `https://liquipedia.net/commons/images/${title.slice('File:'.length).replaceAll(' ', '_')}` }
          ]
        }))
      }
    });
  }
  if (params.get('prop') === 'revisions') {
    const title = params.get('titles') ?? '';
    const text = otherPages[title] ?? wiki.text;
    const withText = params.get('rvprop')?.includes('content') === true;
    return Response.json({
      query: {
        pages: [
          { title, revisions: [{ revid: wiki.revision, ...(withText ? { slots: { main: { content: text } } } : {}) }] }
        ]
      }
    });
  }
  const titles = (params.get('titles') ?? '').split('|');
  const exists = (title: string) => title === 'Trove of Terror' || title in otherPages;
  return Response.json({
    query: { pages: titles.map((title) => (exists(title) ? { title } : { title, missing: true })) }
  });
}) as unknown as typeof fetch;

beforeEach(async () => {
  await resetDb();
  clock = fakeClock();
  queued = [];
  requests = [];
  wiki = { revision: trove.revision, text: trove.text };
  otherPages = {};
  container = createContainer(
    {
      DB: testDb(),
      MEDIA_BUCKET: testMediaBucket(),
      OWNER_TELEGRAM_ID: OWNER_ID,
      AI_JOBS: { send: async (job: AiJob) => void queued.push(job) } as unknown as Queue
    },
    { clock }
  );
  await testDb()
    .prepare(
      `INSERT INTO dota_update_items (source_key, external_id, title, source_url, published_at, detected_at, is_baseline, event_type)
       VALUES ('steam_news', '4001', 'Inside the Trove of Terror', 'https://store.steampowered.com/news/x/4001', ?1, ?1, 0, 'treasure')`
    )
    .bind(START)
    .run();
});

/** The event's own post went out to a channel. */
async function tellMainPost(): Promise<void> {
  await seedSession({ token: OWNER_TOKEN, expiresAt: clock.now() + 86_400_000 });
  const api = createApi({ clock });
  const post = await seedApprovedPost(api, 'Trove of Terror');
  const destination = await seedDestination(api);
  const publication = await seedPublication(api, {
    postId: post.id,
    revision: post.revision,
    destinationId: destination.id,
    scheduledAt: new Date(clock.now() + MINUTE).toISOString()
  });
  const job = await jobOf(publication.id);
  await testDb().batch([
    testDb()
      .prepare("UPDATE jobs SET status = 'succeeded', attempts = 1, send_started_at = ?2 WHERE id = ?1")
      .bind(job.id, START),
    testDb().prepare("UPDATE dota_update_items SET draft_post_id = ?1 WHERE external_id = '4001'").bind(post.id)
  ]);
}

const job = (): Extract<AiJob, { kind: 'treasure_watch' }> => ({
  id: crypto.randomUUID(),
  kind: 'treasure_watch',
  chatId: Number(OWNER_ID)
});
const run = () => runTreasureWatch(container, job(), 'test', () => {}, fakeFetch, 0);
const posts = () =>
  queued.filter((item): item is Extract<AiJob, { kind: 'treasure_post' }> => item.kind === 'treasure_post');
const at = (minutes: number) => clock.set(START + minutes * MINUTE);

describe('the Liquipedia watch of a treasure', () => {
  it('waits for the event post and 30 quiet minutes, then tells only what is new, fact by fact, never twice', async () => {
    at(40);
    await run();
    // Found and read: everything is new, but the page just changed.
    expect(posts()).toEqual([]);

    // Quiet, but the event's own post has not gone out: a follow-up would say the treasure was already told.
    at(75);
    await run();
    expect(posts()).toEqual([]);

    await tellMainPost();
    at(80);
    await run();
    expect(posts()).toHaveLength(1);
    const task = posts()[0]?.task ?? '';
    expect(task).toContain('Maw of the Megalodon');
    expect(task).toContain('$4.99');
    expect(task).toContain('https://liquipedia.net/dota2/Trove_of_Terror');
    expect(task).not.toMatch(/серия|следующ/i);
    // The told sets' icons for the post's slider, the rarest first (owner, 23.10.2026).
    const urls = posts()[0]?.urls ?? [];
    expect(urls[0]).toBe('https://liquipedia.net/commons/images/Cosmetic_icon_Maw_of_the_Megalodon.png');
    expect(urls.length).toBeLessThanOrEqual(10);

    // The page did not change: nothing more to tell, only one light request.
    requests = [];
    at(90);
    await run();
    expect(posts()).toHaveLength(1);
    expect(requests).toEqual(['revisions']);

    // One new set and a changed rate: the next follow-up has the set alone, the rates went out already.
    wiki = {
      revision: trove.revision + 1,
      text: trove.text.replace('===Regular===', `===Regular===\n${NEW_SET}`).replace(/\(\d+(?:\.\d+)?%\)/, '(99%)')
    };
    at(100);
    await run();
    at(135);
    await run();
    expect(posts()).toHaveLength(2);
    const second = posts()[1]?.task ?? '';
    expect(second).toContain('Regular: Grin of the Ghoul King');
    expect(second).not.toContain('Maw of the Megalodon');
    expect(second).not.toContain('99%');
    expect(second).not.toContain('$4.99');
  });

  it('a name corrected on the page before the follow-up is told only as corrected', async () => {
    await tellMainPost();
    wiki = { revision: trove.revision, text: trove.text.replace('Maw of the Megalodon', 'Maw of the Megalodonn') };
    at(40);
    await run();
    wiki = { revision: trove.revision + 1, text: trove.text };
    at(45);
    await run();
    at(80);
    await run();
    expect(posts()).toHaveLength(1);
    expect(posts()[0]?.task).toContain('Maw of the Megalodon');
    expect(posts()[0]?.task).not.toContain('Megalodonn');
  });

  it('two runs at once queue one follow-up', async () => {
    await tellMainPost();
    at(40);
    await run();
    at(75);
    await Promise.all([run(), run()]);
    expect(posts()).toHaveLength(1);
  });

  it('a hidden event is not watched; the window ends 6 hours after the announcement', async () => {
    await testDb().prepare("UPDATE dota_update_items SET hidden_at = ?1 WHERE external_id = '4001'").bind(START).run();
    at(40);
    await run();
    expect(requests).toEqual([]);

    await testDb().prepare("UPDATE dota_update_items SET hidden_at = NULL WHERE external_id = '4001'").run();
    at(7 * 60);
    await run();
    expect(requests).toEqual([]);
  });

  it('skips a longer page that is not a treasure for the treasure the title also names', async () => {
    otherPages = { 'Inside the Trove': '{{Infobox hero}} not a treasure' };
    at(40);
    await run();
    expect(requests).toEqual(['titles', 'revisions', 'revisions', 'valve-price']);
    expect(await testDb().prepare('SELECT page_title FROM treasure_watches').first('page_title')).toBe(
      'Trove of Terror'
    );
  });

  it('reads sets by rarity, bonuses, drop rates and the item id; a half-filled page gives no empty facts', () => {
    const facts = parseTreasureWikitext(trove.text);
    expect(facts.defindex).toBe(34454);
    expect(facts.sets.map((group) => [group.rarity, group.names.length])).toEqual([
      ['Regular', 12],
      ['Rare', 2],
      ['Very Rare', 1],
      ['Ultra Rare', 2]
    ]);
    expect(facts.bonuses).toHaveLength(2);
    expect(facts.dropRates).toContain('50');

    const half = parseTreasureWikitext(
      '===Drop Rates===\nRates will be added soon.\n{|\n| 1st || TBA\n|}\n==See also==\n{{Cosmetic|Some Old Set}}'
    );
    expect(half).toEqual({ defindex: null, sets: [], bonuses: [], dropRates: null });
  });

  it('writes only the pending facts, grouped by kind, and names Liquipedia', () => {
    const task = followUpTask({
      externalId: '4001',
      title: 'Inside the Trove of Terror',
      startedAt: START,
      endsAt: START + 6 * 60 * MINUTE,
      pageTitle: 'Trove of Terror',
      lastRevision: 1,
      lastChangeAt: START,
      checkedAt: START,
      published: { 'sets:A': 'Regular: A' },
      pending: { 'price:': '$4.99', 'sets:B': 'Rare: B' },
      posts: 1,
      hasSeries: false,
      hidden: false,
      mainTold: true
    });
    expect(task).toContain('$4.99');
    expect(task).toContain('Rare: B');
    expect(task).not.toContain('Regular: A');
    expect(task.indexOf('Rare: B')).toBeLessThan(task.indexOf('$4.99'));
  });

  it('fits the queue job however many facts there are (review 24.10.2026: a long task was dropped by the consumer)', () => {
    const many = Object.fromEntries(
      Array.from({ length: 200 }, (_, index) => [`sets:Set ${index}`, `Rare: a long set name number ${index}`])
    );
    const task = followUpTask({
      externalId: '4001',
      title: 'Inside the Trove of Terror',
      startedAt: START,
      endsAt: START + 6 * 60 * MINUTE,
      pageTitle: 'Trove of Terror',
      lastRevision: 1,
      lastChangeAt: START,
      checkedAt: START,
      published: {},
      pending: many,
      posts: 0,
      hasSeries: false,
      hidden: false,
      mainTold: true
    });
    const job = {
      id: crypto.randomUUID(),
      kind: 'treasure_post',
      chatId: 1,
      appOrigin: '',
      externalId: '4001',
      number: 1,
      task
    };
    expect(aiJobSchema.safeParse(job).success).toBe(true);
  });
});
