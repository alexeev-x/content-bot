import { beforeEach, describe, expect, it } from 'vitest';
import type { AiJob } from '../../src/app/bot/ai-job';
import { createContainer, type Container } from '../../src/app/container';
import { prepareGameFilesPost, runGameFilesWatch } from '../../src/app/workflows/game-files';
import { GitHubApiError, type GitHubCommitSummary, type GitHubRepoApi } from '../../src/integrations/github/github-api';
import { type AiTextProvider, createD1AiRepository, updateAiSettings } from '../../src/modules/ai';
import { testDb } from '../helpers/db';
import { fakeClock, OWNER_ID, resetDb } from '../helpers/harness';
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
    expect(queued).toHaveLength(1);
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
});
