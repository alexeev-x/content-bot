import { beforeEach, describe, expect, it } from 'vitest';
import type { AiJob } from '../../src/app/bot/ai-job';
import { createContainer, type Container } from '../../src/app/container';
import {
  activityPageSchema,
  ownerOperationsSettingsSchema,
  postPageSchema,
  publicationPageSchema
} from '@alexeev/contracts';
import {
  prepareGameFilesPost,
  quietBuildPost,
  runGameFilesWatch,
  runQuietBuild
} from '../../src/app/workflows/game-files';
import { GitHubApiError, type GitHubCommitSummary, type GitHubRepoApi } from '../../src/integrations/github/github-api';
import { type AiTextProvider, createD1AiRepository, updateAiSettings } from '../../src/modules/ai';
import { testDb } from '../helpers/db';
import { createApi, fakeClock, OWNER_ID, OWNER_TOKEN, resetDb, seedSession } from '../helpers/harness';
import { count, seedDestination } from '../helpers/publishing';
import { testMediaBucket } from '../helpers/media-bucket';

// Changes in the game's files (owner, 24.10.2026; migration 0107): the builds found first are only the baseline, a
// build touching nothing a player sees is never read, each build gives at most one post job however runs overlap,
// and one the cheap check finds dull costs the owner no message.

const sha = (n: number) => n.toString(16).padStart(40, '0');
const HERO = 'game/dota/pak01_dir/scripts/npc/heroes/npc_dota_hero_marci.txt';
const commit = (n: number, paths: string[], total = paths.length): GitHubCommitSummary => ({
  sha: sha(n),
  message: `${6960 + n} | ${total} files | ${paths.map((path) => `M\t${path}`).join(', ')}`,
  committedAt: 1_760_000_000_000 + n
});
/** A one-file unified diff, as GitHub sends it. */
const diffOf = (path: string, lines: string) =>
  `diff --git a/${path} b/${path}\nindex 1..2 100644\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n${lines}`;

let commits: GitHubCommitSummary[];
let diffs: Record<string, string | GitHubApiError>;
let reads: string[];
let queued: AiJob[];
let container: Container;

const github: GitHubRepoApi = {
  listCommits: async () => [...commits].reverse(),
  getCommitDiff: async (id) => {
    reads.push(id);
    const diff = diffs[id] ?? '';
    if (diff instanceof GitHubApiError) throw diff;
    return diff;
  }
};

const make = (aiProvider?: AiTextProvider) =>
  createContainer(
    {
      DB: testDb(),
      MEDIA_BUCKET: testMediaBucket(),
      OWNER_TELEGRAM_ID: OWNER_ID,
      AI_JOBS: { send: async (job: AiJob) => void queued.push(job) } as unknown as Queue
    },
    { clock: fakeClock(), gameFilesRepo: github, ...(aiProvider === undefined ? {} : { aiProvider }) }
  );

const watch = () =>
  runGameFilesWatch(
    container,
    { id: crypto.randomUUID(), kind: 'game_files_watch', chatId: Number(OWNER_ID) },
    't',
    () => {}
  );

const status = async (n: number) =>
  (await testDb()
    .prepare('SELECT status, reason FROM game_file_builds WHERE sha = ?1')
    .bind(sha(n))
    .first<{ status: string; reason: string | null }>()) ?? null;

beforeEach(async () => {
  await resetDb();
  commits = [commit(1, [HERO])];
  diffs = {};
  reads = [];
  queued = [];
  container = make();
});

describe('the game-files watch', () => {
  it('takes the builds found first as the baseline and never posts them', async () => {
    await watch();
    expect(await status(1)).toEqual({ status: 'skipped', reason: 'baseline' });
    expect(reads).toEqual([]);
    expect(queued).toEqual([]);
  });

  it('reads only builds touching what a player sees, one a run, and queues one post per build', async () => {
    await watch();
    commits.push(commit(2, ['manifests/manifest_373301.txt']), commit(3, [HERO]), commit(4, [HERO]));
    diffs[sha(3)] = diffOf(HERO, '-\t"AbilityCooldown"\t"20"\n+\t"AbilityCooldown"\t"18"');
    diffs[sha(4)] = diffOf(HERO, '-\t"Model"\t"a"\n+  "Model"   "a"');
    await watch();
    expect(await status(2)).toEqual({ status: 'skipped', reason: 'no_relevant_files' });
    expect(reads).toEqual([sha(3)]);
    expect(await status(3)).toEqual({ status: 'queued', reason: null });
    expect(queued).toMatchObject([{ kind: 'game_files_post', sha: sha(3), build: '6963' }]);
    expect((queued[0] as Extract<AiJob, { kind: 'game_files_post' }>).diff).toContain('+ "AbilityCooldown" "18"');
    await watch();
    expect(await status(4)).toEqual({ status: 'skipped', reason: 'no_changes' });
    // Another run, as an overlapping or repeated tick: nothing is read or queued again.
    await watch();
    expect(reads).toEqual([sha(3), sha(4)]);
    // One post job; the build without changes gets its quiet post job instead, once.
    expect(queued.map((job) => job.kind)).toEqual(['game_files_post', 'game_files_quiet']);
  });

  it('passes over the build of an official patch: the patch notes source tells it (owner, 24.10.2026)', async () => {
    await watch();
    const STRINGS = 'game/dota/pak01_dir/resource/localization/dota_english.txt';
    commits.push(commit(2, [HERO, STRINGS]));
    diffs[sha(2)] =
      `${diffOf(HERO, '-\t"AbilityCooldown"\t"20"\n+\t"AbilityCooldown"\t"18"')}\n${diffOf(STRINGS, '+\t\t"DOTA_Patch_7_41g_General_1"\t"Some change"')}`;
    await watch();
    expect(await status(2)).toEqual({ status: 'skipped', reason: 'official_patch' });
    expect(queued).toEqual([]);
  });

  it('reads a build whose message was cut short, and ends one too big to read (QA 24.10.2026)', async () => {
    await watch();
    commits.push(commit(2, ['DumpSource2/convars.txt', 'game/bin/win'], 334), commit(3, [HERO]));
    diffs[sha(2)] = new GitHubApiError('GITHUB_TOO_BIG');
    diffs[sha(3)] = new GitHubApiError('GITHUB_RATE', 403);
    await watch();
    expect(reads).toEqual([sha(2)]);
    expect(await status(2)).toEqual({ status: 'skipped', reason: 'too_big' });
    await watch();
    // A rate limit is not final: the build stays unseen and is read again.
    expect(await status(3)).toBeNull();
    await watch();
    expect(reads).toEqual([sha(2), sha(3), sha(3)]);
  });
});

describe('the check of a build', () => {
  const ai = (worth: boolean): AiTextProvider => ({
    provider: 'openai',
    complete: async () => ({
      text: JSON.stringify({ worth, reason: worth ? 'Марси стала сильнее' : 'служебные правки' }),
      model: 'gpt-6-luna',
      usage: { inputTokens: 100, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 10 }
    })
  });
  const job = {
    id: crypto.randomUUID(),
    kind: 'game_files_post' as const,
    chatId: Number(OWNER_ID),
    appOrigin: 'https://dev.example',
    sha: sha(3),
    build: '6963',
    committedAt: 1_760_000_000_000,
    diff: '# npc_dota_hero_marci\n- "AbilityCooldown" "20"\n+ "AbilityCooldown" "18"'
  };

  beforeEach(async () => {
    await updateAiSettings(
      { repo: createD1AiRepository(testDb()), clock: fakeClock() },
      {
        revision: 0,
        provider: 'openai',
        enabled: true,
        draftModel: 'gpt-6.1-sol',
        cheapModel: 'gpt-6-luna',
        videoReviews: false,
        prices: [],
        monthlyBudgetUsd: 5,
        dailyCapUsd: 1,
        warnAtPercent: 80
      }
    );
    await createContainer(
      { DB: testDb(), MEDIA_BUCKET: testMediaBucket() },
      { clock: fakeClock() }
    ).gameFileBuilds.claim({ sha: sha(3), build: '6963', committedAt: 0 }, 0);
  });

  it('leaves a dull build skipped, with nothing for the owner', async () => {
    expect(await prepareGameFilesPost(make(ai(false)), job, 't', () => {})).toBeNull();
    expect(await status(3)).toEqual({ status: 'skipped', reason: 'not_worth' });
  });

  it('gives a worthy build its writer task: «В файлах игры нашли», no link, the changes as the facts', async () => {
    const prepared = await prepareGameFilesPost(make(ai(true)), job, 't', () => {});
    expect(prepared?.reason).toBe('Марси стала сильнее');
    expect(prepared?.own.task).toContain('«В файлах игры нашли»');
    expect(prepared?.own.task).toContain('не ставь ссылок');
    expect(prepared?.own.facts).toContain('+ "AbilityCooldown" "18"');
    expect(await status(3)).toEqual({ status: 'queued', reason: null });
  });

  it('gives the week its finds with the check reason and the post, and only the queued ones', async () => {
    await prepareGameFilesPost(make(ai(true)), job, 't', () => {});
    const builds = container.gameFileBuilds;
    const postId = '11111111-1111-4111-8111-111111111111';
    await testDb()
      .prepare(
        `INSERT INTO posts (id, title, body, created_at, updated_at) VALUES (?1, 'Находка', 'Новый предмет', 0, 0)`
      )
      .bind(postId)
      .run();
    await builds.attachPost(sha(3), postId);
    await builds.skip([{ sha: sha(4), build: '6964', committedAt: 5, reason: 'baseline' }], 0);
    expect(await builds.recentFinds(0)).toEqual([
      { sha: sha(3), build: '6963', committedAt: 0, note: 'Марси стала сильнее', text: 'Новый предмет' }
    ]);
    expect(await builds.recentFinds(1)).toEqual([]);
  });
});

describe('a build with nothing in it (owner, 24.10.2026: «смешную добавить текст и сам diff»)', () => {
  const autopublishOn = async () => {
    await seedSession({ token: OWNER_TOKEN, expiresAt: Date.now() + 400 * 24 * 60 * 60_000 });
    const api = createApi({ clock: fakeClock() });
    const destination = await seedDestination(api);
    const current = ownerOperationsSettingsSchema.parse(
      await (await api.request('/api/v1/settings/operations')).json()
    );
    const response = await api.request('/api/v1/settings/operations', {
      method: 'PUT',
      json: {
        revision: current.revision,
        timezone: current.timezone,
        notifications: current.notifications,
        autopublish: { enabled: true, destinationId: destination.id, dailyLimit: 10 }
      }
    });
    expect(response.status).toBe(200);
  };
  /** A watch run, then the quiet jobs it queued (the queue's ten minutes of delay are not waited for). */
  let ran = 0;
  const step = async () => {
    await watch();
    for (const job of queued.slice(ran)) {
      if (job.kind === 'game_files_quiet') await runQuietBuild(container, job, 't', () => {});
    }
    ran = queued.length;
  };
  beforeEach(() => {
    ran = 0;
  });

  it('gets one short post with the version lines, once, and none when the build had a find', async () => {
    await autopublishOn();
    await step();
    commits.push(commit(2, ['manifests/manifest_373301.txt']));
    await step();
    await step();
    const posts = await testDb().prepare('SELECT body, entities FROM posts').all<{ body: string; entities: string }>();
    expect(posts.results).toHaveLength(1);
    expect(posts.results[0]?.body).toContain('6962');
    expect(posts.results[0]?.body).toContain('- ClientVersion=6961\n+ ClientVersion=6962');
    expect(posts.results[0]?.entities).toContain('"language":"diff"');
    expect(await count('publications')).toBe(1);

    // A build whose find went to the writer gets no joke for its other commit.
    commits.push(commit(3, [HERO]));
    diffs[sha(3)] = diffOf(HERO, '-\t"AbilityCooldown"\t"20"\n+\t"AbilityCooldown"\t"18"');
    await step();
    commits.push({ ...commit(3, ['manifests/manifest_373301.txt']), sha: sha(33) });
    await step();
    expect(await count('posts')).toBe(1);
  });

  it('has the cheap model offer three jokes and the draft model keep one; a kept joke teaches the next, a turned-down build gets the stand-in (owner, 27.10.2026)', async () => {
    await autopublishOn();
    await updateAiSettings(
      { repo: createD1AiRepository(testDb()), clock: fakeClock() },
      {
        revision: 0,
        provider: 'openai',
        enabled: true,
        draftModel: 'gpt-6.1-sol',
        cheapModel: 'gpt-6-luna',
        videoReviews: false,
        prices: [],
        monthlyBudgetUsd: 5,
        dailyCapUsd: 1,
        warnAtPercent: 80
      }
    );
    const verdicts = ['Версия +1, а у Рошана всё ещё перерыв на обед.', ''];
    const writerInputs: string[] = [];
    const criticInputs: string[] = [];
    container = make({
      provider: 'openai',
      complete: async (request) => {
        const critic = request.model === 'gpt-6.1-sol';
        (critic ? criticInputs : writerInputs).push(request.input);
        return {
          text: JSON.stringify(
            critic
              ? { joke: verdicts.shift() ?? '' }
              : {
                  jokes: [
                    'Молчание Valve на уровне Immortal, смешно же.',
                    'Номер +1, MMR −25.',
                    'https://x.y шутка тут'
                  ]
                }
          ),
          model: request.model,
          usage: { inputTokens: 50, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 20 }
        };
      }
    });
    await step();
    commits.push(commit(2, ['manifests/manifest_373301.txt']));
    await step();
    commits.push(commit(3, ['manifests/manifest_373301.txt']));
    await step();
    const bodies = (await testDb().prepare('SELECT body FROM posts ORDER BY created_at').all<{ body: string }>())
      .results;
    expect(bodies[0]?.body).toContain('перерыв на обед');
    // The critic never sees a joke with an address.
    expect(criticInputs[0]).not.toContain('https://');
    expect(criticInputs[0]).toContain('MMR −25');
    // The critic turned the second build's jokes down: the stand-in goes out, not the writer's variant.
    expect(bodies[1]?.body).toContain('6963');
    expect(bodies[1]?.body).not.toContain('Immortal');
    // The kept joke is in the bank and the writer reads it as an example for the next build.
    expect(writerInputs[1]).toContain('перерыв на обед');
    const bank = await testDb().prepare('SELECT count(*) AS n FROM quiet_build_jokes').first<{ n: number }>();
    expect(bank?.n).toBe(1);
    // No one approved these posts: the studio marks them «ИИ» as the automatic publishing's (owner, 27.10.2026).
    const api = createApi({ clock: fakeClock() });
    const posts = postPageSchema.parse(await (await api.request('/api/v1/posts')).json());
    expect(posts.items.map((post) => post.origin?.source)).toEqual(['auto', 'auto']);
    const publications = publicationPageSchema.parse(await (await api.request('/api/v1/publications')).json());
    expect(publications.items.every((item) => item.postOrigin?.source === 'auto')).toBe(true);
    const activity = activityPageSchema.parse(await (await api.request('/api/v1/activity')).json());
    expect(activity.items.filter((item) => item.action === 'post.create').map((item) => item.actor)).toEqual([
      'autopublish',
      'autopublish'
    ]);
  });

  it('gets no joke when another commit of the same build has a find, and one joke however often it is queued (QA 24.10.2026)', async () => {
    await autopublishOn();
    await step();
    // One run: the build's find (older) and its quiet commit (newer).
    commits.push(commit(2, [HERO]), { ...commit(2, ['manifests/manifest_373301.txt']), sha: sha(22) });
    diffs[sha(2)] = diffOf(HERO, '-\t"AbilityCooldown"\t"20"\n+\t"AbilityCooldown"\t"18"');
    await step();
    expect(queued.filter((job) => job.kind === 'game_files_quiet')).toHaveLength(0);
    // The same quiet build queued twice posts once.
    const quietJob = {
      id: crypto.randomUUID(),
      kind: 'game_files_quiet' as const,
      chatId: Number(OWNER_ID),
      build: '6970'
    };
    await runQuietBuild(container, quietJob, 't', () => {});
    await runQuietBuild(container, { ...quietJob, id: crypto.randomUUID() }, 't', () => {});
    expect(await count('posts')).toBe(1);
  });

  it('posts nothing while the automatic publishing is off', async () => {
    await step();
    commits.push(commit(2, ['manifests/manifest_373301.txt']));
    await step();
    expect(await count('posts')).toBe(0);
  });

  it('reads like the owner asked, the joke picked by the build number', () => {
    expect(quietBuildPost('6967', '6966')).toBe(
      [
        'Новая сборка 6967: перекопали файлы — героев не трогали, предметы на месте. Можно дальше спокойно фидить.',
        '',
        '```diff',
        '- ClientVersion=6966',
        '+ ClientVersion=6967',
        '```'
      ].join('\n')
    );
  });
});
