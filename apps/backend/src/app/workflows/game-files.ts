import { gameFilesWorthPost, QUIET_BUILD_THEMES, quietBuildJoke } from '../../modules/ai';
import { GitHubApiError } from '../../integrations/github/github-api';
import { condenseBuild, mayMatter, parseBuildMessage, splitDiff } from '../../modules/game-files';
import { getOwnerOperationsSettings } from '../../modules/settings';
import type { AiJob } from '../bot/ai-job';
import type { Container } from '../container';
import { recordAutopublish } from './autopublish-log';
import { publishFixedPost } from './publish-fixed-post';
import { recordWatchFailure } from './watch-error-code';

// Changes in the game's files (owner, 23.10.2026: «это очень интересное»; 24.10.2026: required before the release and
// published like every source). The SteamTracking GameTracking-Dota2 repository commits one build at a time; a run
// reads its newest commits, passes over the builds that touch nothing a player sees by their message alone, and reads
// the diff of the rest. A build's changes go to a cheap check and, when worth it, to the writer and the automatic
// publishing. Never steamdb.info itself (its FAQ forbids scraping), and the post names no SteamDB and links no commit.

/** Commits read per run: builds come a few a day, so ten cover any pause of the Cron. */
const LIST_SIZE = 10;
/**
 * Builds whose diff is read per run. One: a build's diff is scanned within the Free plan's 10 ms of CPU, and builds come
 * a few a day against a run every 5 minutes (QA 24.10.2026).
 */
const READS_PER_RUN = 1;
/**
 * GitHub's refusals that reading again would not change: the diff is too big (a big patch's build is 30 MB; its changes
 * come through Valve's patch notes source), or it is not what was asked for. They end the build; anything else (the
 * network, a rate limit, a revoked token) leaves it for the next run.
 */
const FINAL_FAILURES: Partial<Record<string, string>> = { GITHUB_TOO_BIG: 'too_big', GITHUB_SHAPE: 'unreadable' };
const CHECK_TIMEOUT_MS = 60_000;
/** A new patch-notes string of Valve's (`"DOTA_Patch_7_41f_…"`) added by the build. */
const OFFICIAL_PATCH = /^\+\s*"DOTA_Patch_\d/mu;

/**
 * A build with nothing worth a post (owner, 24.10.2026: «если ничего не нашлось можно смешную добавить текст и сам
 * diff»; «шуточные посты всегда разные»): a joke the cheap model writes on a random theme, and the version lines as
 * they are in the game's files. These lines stand in when the model cannot write one.
 */
const QUIET_JOKES = [
  (build: string) => `Valve подняла сборку ${build} — ничего такого нет, просто ИИ мутит воду, чтобы ты больше фидил.`,
  (build: string) =>
    `Новая сборка ${build}: перекопали файлы — героев не трогали, предметы на месте. Можно дальше спокойно фидить.`,
  (build: string) => `Сборка ${build} прилетела тихо: в файлах ничего интересного, Valve просто протёрла пыль.`
];

const JOKE_TIMEOUT_MS = 30_000;

/** The post: the joke (or a stand-in picked by the build number) and the version lines. */
export function quietBuildPost(build: string, previous: string | null, joke: string | null = null): string {
  const standIn = QUIET_JOKES[Number(build) % QUIET_JOKES.length] ?? QUIET_JOKES[0];
  return [
    joke ?? standIn?.(build) ?? '',
    '',
    '```diff',
    ...(previous === null ? [] : [`- ClientVersion=${previous}`]),
    `+ ClientVersion=${build}`,
    '```'
  ].join('\n');
}

/**
 * The quiet post waits this long in the queue (QA 24.10.2026): the other commits of the same build are read first, so
 * a build with a find never gets a joke as well.
 */
const QUIET_DELAY_SECONDS = 10 * 60;

/** Queues a quiet build's post; never throws (a refused send only loses the joke). */
async function queueQuietBuild(
  container: Container,
  chatId: number,
  build: string,
  onError: (error: unknown) => void
): Promise<void> {
  if (!/^\d{1,9}$/.test(build)) return;
  await container.aiJobs
    .send({ id: container.newId(), kind: 'game_files_quiet', chatId, build }, { delaySeconds: QUIET_DELAY_SECONDS })
    .catch(onError);
}

/** The claim of a build's quiet post: one id per build, so a repeat or a second commit never pays the joke again. */
const quietClaimId = (build: string) => `00000000-0000-4000-8000-${build.padStart(12, '0')}`;

/** Posts a quiet build once (its own queue job, so its D1 statements have their own budget); never throws. */
export async function runQuietBuild(
  container: Container,
  job: Extract<AiJob, { kind: 'game_files_quiet' }>,
  requestId: string,
  onError: (error: unknown) => void
): Promise<void> {
  const build = job.build;
  try {
    if (await container.gameFileBuilds.hadFind(build)) return;
    if (!(await container.aiWriter.claimJob(quietClaimId(build), container.clock.now()))) return;
    const previous = await container.gameFileBuilds.previousBuild(build);
    const outcome = await publishFixedPost(
      container,
      `files-quiet:${build}`,
      async () => {
        const { timezone } = await getOwnerOperationsSettings({
          repo: container.settings,
          logger: container.logger,
          requestId
        });
        const theme = QUIET_BUILD_THEMES[Math.floor(container.random() * QUIET_BUILD_THEMES.length)] ?? 'фид';
        const joke = await quietBuildJoke(
          {
            repo: container.aiRepository,
            clock: container.clock,
            timezone,
            newId: container.newId,
            provider: container.aiProvider
          },
          { build, theme, signal: AbortSignal.timeout(JOKE_TIMEOUT_MS) }
        ).catch((error: unknown) => {
          onError(error);
          return null;
        });
        return quietBuildPost(build, previous, joke);
      },
      requestId
    );
    container.logger.info({ component: 'game_files', operation: 'quiet_build', requestId, status: outcome });
    // Switched off is the owner's choice: nothing to record (QA 24.10.2026).
    if (outcome !== 'off')
      await recordAutopublish(container, {
        source: 'game_files',
        title: `Сборка ${build}: ничего интересного`,
        outcome: outcome === 'published' ? 'published' : 'held',
        ...(outcome === 'published' ? {} : { reason: outcome })
      });
  } catch (error) {
    onError(error);
  }
}

/** The automatic publishing's key of a build's post: one publication per build. */
export const gameFilesExternalId = (sha: string) => `files:${sha}`;

/** One run of the watch; never throws (a failure is logged and the next run tries again). */
export async function runGameFilesWatch(
  container: Container,
  job: Extract<AiJob, { kind: 'game_files_watch' }>,
  requestId: string,
  onError: (error: unknown) => void
): Promise<void> {
  const github = container.gameFilesRepo;
  if (github === null) return;
  if (!(await container.aiWriter.claimJob(job.id, container.clock.now()).catch(() => false))) return;
  try {
    const builds = container.gameFileBuilds;
    const commits = await github.listCommits(LIST_SIZE);
    const now = container.clock.now();
    await container.watchChecks.record('game_files', now, null).catch(onError);
    const parsed = commits.map((commit) => ({ ...commit, header: parseBuildMessage(commit.message) }));
    // The first run only marks where the source starts: the builds already there never become posts.
    if (await builds.isEmpty()) {
      await builds.skip(
        parsed.map((commit) => ({
          sha: commit.sha,
          build: commit.header?.build ?? '0',
          committedAt: commit.committedAt,
          reason: 'baseline'
        })),
        now
      );
      return;
    }
    const known = await builds.known(parsed.map((commit) => commit.sha));
    // Oldest first, so a build is told before the one after it.
    const fresh = parsed.filter((commit) => !known.has(commit.sha)).reverse();
    const quiet = fresh.filter((commit) => commit.header === null || !mayMatter(commit.header));
    await builds.skip(
      quiet.map((commit) => ({
        sha: commit.sha,
        build: commit.header?.build ?? '0',
        committedAt: commit.committedAt,
        reason: commit.header === null ? 'not_a_build' : 'no_relevant_files'
      })),
      now
    );
    // The newest build touching nothing a player sees still gets its one short post (owner, 24.10.2026), unless another
    // fresh commit of the same build may hold a find; at most one quiet post a run (QA 24.10.2026).
    let quietQueued = false;
    const newest = fresh.at(-1);
    const newestBuild = newest?.header?.build;
    if (
      newest !== undefined &&
      newestBuild !== undefined &&
      quiet.includes(newest) &&
      !fresh.some((each) => !quiet.includes(each) && each.header?.build === newestBuild)
    ) {
      await queueQuietBuild(container, job.chatId, newestBuild, onError);
      quietQueued = true;
    }
    const appOrigin = await container.systemState.readAppOrigin();
    for (const commit of fresh.filter((each) => !quiet.includes(each)).slice(0, READS_PER_RUN)) {
      const build = commit.header?.build ?? '0';
      try {
        const whole = await github.getCommitDiff(commit.sha);
        // A build that brings Valve's patch notes is the patch itself, told by the patch notes source: no second post
        // of the same news (history of 2024–2026: the numbers and the notes always land in the same build).
        if (OFFICIAL_PATCH.test(whole)) {
          await builds.skip(
            [{ sha: commit.sha, build, committedAt: commit.committedAt, reason: 'official_patch' }],
            now
          );
          continue;
        }
        const diff = condenseBuild(splitDiff(whole));
        if (diff === null) {
          await builds.skip([{ sha: commit.sha, build, committedAt: commit.committedAt, reason: 'no_changes' }], now);
          if (!quietQueued) await queueQuietBuild(container, job.chatId, build, onError);
          quietQueued = true;
          continue;
        }
        // The one claim of the build's post: an overlapping run that found it too stops here.
        if (!(await builds.claim({ sha: commit.sha, build, committedAt: commit.committedAt }, now))) continue;
        try {
          await container.aiJobs.send({
            id: container.newId(),
            kind: 'game_files_post',
            chatId: job.chatId,
            appOrigin: appOrigin ?? '',
            sha: commit.sha,
            build,
            committedAt: commit.committedAt,
            diff
          });
        } catch (error) {
          onError(error);
          await builds.release(commit.sha, 'failed', 'queue');
        }
      } catch (error) {
        onError(error);
        const final = error instanceof GitHubApiError ? FINAL_FAILURES[error.code] : undefined;
        // A transient failure leaves the build unseen for the next run; a final one ends it.
        if (final !== undefined)
          await builds.skip([{ sha: commit.sha, build, committedAt: commit.committedAt, reason: final }], now);
      }
    }
    container.logger.info({
      component: 'game_files',
      operation: 'watch',
      requestId,
      status: fresh.length === 0 ? 'nothing_new' : 'read'
    });
  } catch (error) {
    onError(error);
    await recordWatchFailure(
      { checks: container.watchChecks, alerts: container.contentAlerts, now: container.clock.now() },
      'game_files',
      error
    ).catch(onError);
  } finally {
    await container.aiWriter.finishJob(job.id, container.clock.now()).catch(onError);
  }
}

/**
 * The writer's task of a build, and the cheap check's reason, or null when the build is not worth a post (it is then
 * left as skipped, and the owner hears nothing of it). A check that cannot answer lets the writer go on.
 */
export async function prepareGameFilesPost(
  container: Container,
  job: Extract<AiJob, { kind: 'game_files_post' }>,
  requestId: string,
  onError: (error: unknown) => void
): Promise<{ reason: string; own: { task: string; facts: string } } | null> {
  let reason = 'нашлись изменения';
  try {
    const { timezone } = await getOwnerOperationsSettings({
      repo: container.settings,
      logger: container.logger,
      requestId
    });
    const verdict = await gameFilesWorthPost(
      {
        repo: container.aiRepository,
        clock: container.clock,
        timezone,
        newId: container.newId,
        provider: container.aiProvider
      },
      { diff: job.diff, signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) }
    );
    if (verdict !== null && !verdict.worth) {
      container.logger.info({ component: 'game_files', operation: 'check', requestId, status: 'skipped' });
      await container.gameFileBuilds.release(job.sha, 'skipped', 'not_worth');
      await queueQuietBuild(container, job.chatId, job.build, onError);
      return null;
    }
    if (verdict !== null) reason = verdict.reason.slice(0, 200);
  } catch (error) {
    onError(error);
  }
  return { reason, own: gameFilesTask(job) };
}

/**
 * The writer's task of a find in the game's files (owner, 23.10.2026): it opens with «В файлах игры нашли», says Valve
 * has not confirmed it and it may change, retells the changes in Russian, never quotes a file or names its source.
 */
export function gameFilesTask(job: { build: string; committedAt: number; diff: string }): {
  task: string;
  facts: string;
} {
  const date = new Date(job.committedAt).toISOString().slice(0, 10).split('-').reverse().join('.');
  return {
    task: [
      'Повод: в новой сборке Dota 2 изменились файлы игры (изменённые строки — в фактах источника; «-» убрано, «+» добавлено).',
      `Дата: ${date}`,
      'Напиши короткий пост о самом интересном для игрока. Первая строка начинается со слов «В файлах игры нашли» — отдельного заголовка нет.',
      'Скажи, что Valve это не подтверждала и до выхода всё может измениться.',
      'В тексте перескажи по-русски, что поменялось и что это значит для игрока: числа, новые предметы, события, герои, косметика, функции. В самом тексте строки файлов не цитируй, названия файлов и ключей не пиши. Строка, которая просто переехала, — не изменение.',
      // Owner, 24.10.2026: the removed and added lines in red and green, «как в программировании» — a piece of the code
      // itself, as it is (the text above tells it in Russian).
      // Owner, 24.10.2026: numbers go into a «was / now» table (app contracts findRichHtml), the rest shows the code.
      'Если поменялись числа или даты — после текста по строке на каждое изменение (2–6 строк): «Название по-русски: было → стало», числа через «/» без пробелов (например «Вампиризм Grappling Claw: 40/80/120/160 → 30/60/90/120»). Блока кода тогда нет.',
      'Если чисел и дат нет — после текста покажи кусочек самого кода: строка «```diff», затем 2–8 самых показательных строк из фактов ровно как они там есть, со своими «- » и «+ », без названий файлов, — и строка «```». Строки не переводи и не меняй. Блок один, другого markdown нет.',
      'Не упоминай SteamDB, GitHub, трекеры и сборки, не ставь ссылок. Текст до блока — обычно 300–700 знаков.',
      // The same naming rules as every source post (app/bot/rich-post.ts SOURCE_POST_STRUCTURE), without its heading:
      // a find has none (owner, 23.10.2026).
      'Героя называй, как его зовут игроки (Котл, БХ, Трент); нет такого имени — английское название. Не упоминай другие посты.'
    ].join('\n'),
    facts: `Изменённые строки файлов игры, сборка ${job.build}:\n${job.diff}`
  };
}
