import { gameFilesWorthPost } from '../../modules/ai';
import { GitHubApiError } from '../../integrations/github/github-api';
import { condenseBuild, mayMatter, parseBuildMessage, splitDiff } from '../../modules/game-files';
import { getOwnerOperationsSettings } from '../../modules/settings';
import type { AiJob } from '../bot/ai-job';
import type { Container } from '../container';

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
    const appOrigin = await container.systemState.readAppOrigin();
    for (const commit of fresh.filter((each) => !quiet.includes(each)).slice(0, READS_PER_RUN)) {
      const build = commit.header?.build ?? '0';
      try {
        const diff = condenseBuild(splitDiff(await github.getCommitDiff(commit.sha)));
        if (diff === null) {
          await builds.skip([{ sha: commit.sha, build, committedAt: commit.committedAt, reason: 'no_changes' }], now);
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
      'Перескажи по-русски, что поменялось и что это значит для игрока: числа «было → стало», новые предметы, события, герои, косметика, функции. Строки файлов не цитируй, названия файлов и ключей не пиши. Строка, которая просто переехала, — не изменение.',
      'Не упоминай SteamDB, GitHub, трекеры и сборки, не ставь ссылок. Обычно 400–900 знаков.',
      // The same naming rules as every source post (app/bot/rich-post.ts SOURCE_POST_STRUCTURE), without its heading:
      // a find has none (owner, 23.10.2026).
      'Героя называй, как его зовут игроки (Котл, БХ, Трент); нет такого имени — английское название. Не упоминай другие посты.'
    ].join('\n'),
    facts: `Изменённые строки файлов игры, сборка ${job.build}:\n${job.diff}`
  };
}
