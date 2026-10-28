import { type SteamAppInfo, readSteamAppInfo } from '../../integrations/steam-cm/steam-cm-client';
import type { AiJob } from '../bot/ai-job';
import type { Container } from '../container';
import { recordWatchFailure } from './watch-error-code';

// The early signal of a Dota build (owner, 24.10.2026): Steam's own product info of Dota 2, read anonymously every Dota
// run. A new public build is no news by itself (owner, 24.10.2026: «мне нет смысла от сборки» — build 6967 changed two
// binaries and nothing a player sees, and Valve ships such builds twice a week), so nothing is posted and the owner is
// not told. It only starts the digging: for the next hour the game-files watch runs every minute instead of every
// five, and it posts a find when the build brings something worth one (GameTracking-Dota2 commits a build about a
// quarter of an hour after Steam ships it).

export const DOTA_APP_ID = 570;
/** How long after a new build the game files are read every minute. */
export const FILES_DUE_MS = 60 * 60 * 1000;

export type ReadSteamApps = (appIds: readonly number[]) => Promise<SteamAppInfo[]>;

/** One run; never throws (a failure is logged and the next run reads again). */
export async function runSteamWatch(
  container: Container,
  job: Extract<AiJob, { kind: 'steam_watch' }>,
  requestId: string,
  onError: (error: unknown) => void,
  readApps: ReadSteamApps = (appIds) => readSteamAppInfo(appIds)
): Promise<void> {
  // No job bookkeeping in ai_queue_jobs (28.10.2026: about 3 300 D1 rows written a day for the watches alone): a
  // redelivered copy is harmless, every claim inside is conditional.
  try {
    const [app] = (await readApps([DOTA_APP_ID])).filter((each) => each.appId === DOTA_APP_ID);
    const now = container.clock.now();
    await container.watchChecks.record('steam_apps', now, null).catch(onError);
    if (app === undefined || app.changeNumber <= 0) return;
    const row = {
      appId: app.appId,
      changeNumber: app.changeNumber,
      buildId: app.publicBuildId,
      timeUpdated: app.publicTimeUpdated
    };
    const known = await container.steamApps.find(DOTA_APP_ID);
    if (known === null) {
      await container.steamApps.start(row, now);
      return;
    }
    if (app.changeNumber <= known.changeNumber) return;
    // The one claim of this change: an overlapping run that read it too stops here.
    if (!(await container.steamApps.advance(known, row, now))) return;
    // Both builds known: a build missing from one read is no new build (QA 24.10.2026).
    const newBuild = known.buildId !== null && app.publicBuildId !== null && app.publicBuildId !== known.buildId;
    if (newBuild) await container.steamApps.markFilesDue(DOTA_APP_ID, now + FILES_DUE_MS);
    container.logger.info({
      component: 'steam_watch',
      operation: 'change',
      requestId,
      status: newBuild ? 'new_build' : 'other_change'
    });
  } catch (error) {
    onError(error);
    await recordWatchFailure(
      { checks: container.watchChecks, alerts: container.contentAlerts, now: container.clock.now() },
      'steam_apps',
      error
    ).catch(onError);
  }
}
