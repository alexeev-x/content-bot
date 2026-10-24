import { Api } from 'grammy';
import { type SteamAppInfo, readSteamAppInfo } from '../../integrations/steam-cm/steam-cm-client';
import { approvePost, createPost } from '../../modules/content';
import { createPublication } from '../../modules/publishing';
import { getOwnerOperationsSettings } from '../../modules/settings';
import type { AiJob } from '../bot/ai-job';
import { aiPostText, draftFromMessageText } from '../bot/draft-from-message';
import type { Container } from '../container';
import { AUTOPUBLISH_ACTOR } from './autopublish-source-event';
import { recordWatchFailure } from './watch-error-code';
import { kickDispatch } from './dispatch-now';

// The early signal of a Dota update (owner, 24.10.2026: «как люди делают»; «они должны сразу постом идти без меня»):
// Steam's own product info, read anonymously every Dota run. Dota 2 Staging (Valve's test app) changing means an update
// is being prepared; Dota 2's public build changing means it is out. Each goes to the channel by itself, like every
// source, under the automatic publishing's switch and daily limit; off or over it, the owner gets the text instead.
// The text is fixed, with the build numbers as a red and green diff: no model call stands between Steam and the post.

export const DOTA_APP_ID = 570;
export const DOTA_STAGING_APP_ID = 2305270;
const TELEGRAM_TIMEOUT_SECONDS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Valve may touch the test app several times an evening: one post of it in 12 hours. */
const STAGING_POST_GAP_MS = 12 * 60 * 60 * 1000;

export type ReadSteamApps = (appIds: readonly number[]) => Promise<SteamAppInfo[]>;

/** The post of a change, or null when nothing a player would notice changed. */
export function steamChangePost(
  before: { changeNumber: number; buildId: string | null },
  now: SteamAppInfo
): string | null {
  if (now.appId === DOTA_STAGING_APP_ID)
    return [
      '🧪 Valve что-то готовит: тестовая версия Dota 2 в Steam только что обновилась. Обычно так бывает за несколько часов или дней до патча.',
      '',
      '```diff',
      `- "Dota 2 Staging" "${before.changeNumber}"`,
      `+ "Dota 2 Staging" "${now.changeNumber}"`,
      '```'
    ].join('\n');
  // Both builds known: a build missing from one read is no new build (QA 24.10.2026).
  if (
    now.appId === DOTA_APP_ID &&
    before.buildId !== null &&
    now.publicBuildId !== null &&
    now.publicBuildId !== before.buildId
  )
    return [
      '🆕 Steam уже раздаёт обновление Dota 2 — перезапустите клиент, чтобы скачать. Valve пока ничего не объявляла.',
      '',
      '```diff',
      `- "buildid" "${before.buildId}"`,
      `+ "buildid" "${now.publicBuildId}"`,
      '```'
    ].join('\n');
  return null;
}

type Outcome = 'published' | 'off' | 'limit' | 'failed';

/** Publishes the fixed post now under `key` (one publication per change), as the automatic publishing does. */
async function publishNow(container: Container, key: string, text: string, requestId: string): Promise<Outcome> {
  const settings = await getOwnerOperationsSettings({ repo: container.settings, logger: container.logger, requestId });
  const { enabled, destinationId, dailyLimit } = settings.autopublish;
  if (!enabled || destinationId === null) return 'off';
  const channel = await container.destinations.findById(destinationId);
  if (channel === null || !channel.enabled) return 'off';
  const now = container.clock.now();
  if ((await container.publications.countCreatedBy(AUTOPUBLISH_ACTOR, now - DAY_MS)) >= dailyLimit) return 'limit';
  const linked = aiPostText(text);
  const draft = draftFromMessageText(linked.text, linked.entities);
  if (!draft.ok) return 'failed';
  const created = await createPost(
    { repo: container.posts, idempotency: container.idempotency, now, newId: container.newId },
    { actor: AUTOPUBLISH_ACTOR, idempotencyKey: `steam:${key}`, input: draft.input }
  );
  const post =
    created.status === 'approved'
      ? created
      : await approvePost(
          { repo: container.posts, now: container.clock.now() },
          { actor: AUTOPUBLISH_ACTOR, id: created.id, input: { revision: created.revision } }
        );
  try {
    await createPublication(
      {
        publications: container.publications,
        destinations: container.destinations,
        posts: container.postSource,
        idempotency: container.idempotency,
        notifier: { scheduled: () => undefined, rescheduled: () => undefined, cancelled: () => undefined },
        now: container.clock.now(),
        newId: container.newId
      },
      {
        actor: AUTOPUBLISH_ACTOR,
        idempotencyKey: `autopublish:steam:${key}`,
        input: {
          postId: post.id,
          revision: post.revision,
          destinationId,
          scheduledAt: new Date(container.clock.now()).toISOString(),
          timezone: settings.timezone
        }
      }
    );
  } catch (error) {
    // The write may have committed and lost its answer: never tell the owner «not published» about a post that goes
    // out anyway (review 24.10.2026, as autopublish-source-event does).
    if (!(await container.publications.hasLivePublication(post.id, destinationId).catch(() => false))) throw error;
  }
  await kickDispatch(container);
  return 'published';
}

const HELD: Record<Exclude<Outcome, 'published'>, string> = {
  off: 'автопубликация выключена или канал не выбран',
  limit: 'дневной лимит автопубликаций исчерпан',
  failed: 'не получилось опубликовать'
};

/** One run; never throws (a failure is logged and the next run reads again). */
export async function runSteamWatch(
  container: Container,
  job: Extract<AiJob, { kind: 'steam_watch' }>,
  token: string,
  requestId: string,
  onError: (error: unknown) => void,
  readApps: ReadSteamApps = (appIds) => readSteamAppInfo(appIds)
): Promise<void> {
  if (!(await container.aiWriter.claimJob(job.id, container.clock.now()).catch(() => false))) return;
  /** What the owner hears: a change that did not go out by itself. */
  const notes: string[] = [];
  try {
    const apps = await readApps([DOTA_APP_ID, DOTA_STAGING_APP_ID]);
    const now = container.clock.now();
    await container.watchChecks.record('steam_apps', now, null).catch(onError);
    for (const app of apps) {
      if (app.changeNumber <= 0) continue;
      const row = {
        appId: app.appId,
        changeNumber: app.changeNumber,
        buildId: app.publicBuildId,
        timeUpdated: app.publicTimeUpdated
      };
      const known = await container.steamApps.find(app.appId);
      if (known === null) {
        await container.steamApps.start(row, now);
        continue;
      }
      if (app.changeNumber <= known.changeNumber) continue;
      // The one claim of this change: an overlapping run that read it too stops here.
      if (!(await container.steamApps.advance(known, row, now))) continue;
      const text = steamChangePost(known, app);
      if (text === null) continue;
      // Claimed before publishing, so two overlapping runs never both post Staging within the gap.
      if (
        !(await container.steamApps.claimPost(
          app.appId,
          now,
          app.appId === DOTA_STAGING_APP_ID ? STAGING_POST_GAP_MS : 0
        ))
      )
        continue;
      const outcome = await publishNow(container, `${app.appId}:${app.changeNumber}`, text, requestId).catch(
        (error: unknown): Outcome => {
          onError(error);
          return 'failed';
        }
      );
      if (outcome !== 'published') notes.push(`Не опубликовано без вас (${HELD[outcome]}):\n\n${text}`);
      container.logger.info({ component: 'steam_watch', operation: 'post', requestId, status: outcome });
    }
  } catch (error) {
    onError(error);
    await recordWatchFailure(
      { checks: container.watchChecks, alerts: container.contentAlerts, now: container.clock.now() },
      'steam_apps',
      error
    ).catch(onError);
  } finally {
    await container.aiWriter.finishJob(job.id, container.clock.now()).catch(onError);
  }
  if (notes.length === 0 || token === '') return;
  const api = new Api(token, { timeoutSeconds: TELEGRAM_TIMEOUT_SECONDS });
  for (const note of notes) {
    // The diff block as code, as in the channel.
    const linked = aiPostText(note);
    await api.sendMessage(job.chatId, linked.text, { entities: linked.entities }).catch(onError);
  }
}
