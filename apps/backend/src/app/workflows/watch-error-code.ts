import type { ContentAlertRepository } from '../../modules/content-analytics';
import type { WatchCheckRepository, WatchKey } from '../../modules/game-files';

/** The stable code of a watch's failure for «Состояние лент»: the error's own `code` when it has one, else its name. */
export function watchErrorCode(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown';
  return 'code' in error && typeof error.code === 'string' ? error.code : error.name;
}

/** Failures in a row after which the owner hears of it once (a single timeout is ordinary, the next run reads again). */
export const WATCH_ALERT_AFTER = 3;

const WATCH_NAME: Record<WatchKey, string> = {
  game_files: 'Файлы игры',
  steam_apps: 'Сигнал обновления в Steam'
};

/**
 * Records a failed run and, on the third in a row, raises one content alert (review 24.10.2026: the early signals
 * failed only into the logs, so a revoked GitHub token meant silence for good). The alert's id is per outage.
 */
export async function recordWatchFailure(
  deps: { checks: WatchCheckRepository; alerts: Pick<ContentAlertRepository, 'insert'>; now: number },
  key: WatchKey,
  error: unknown
): Promise<void> {
  const code = watchErrorCode(error);
  const failures = await deps.checks.record(key, deps.now, code);
  if (failures !== WATCH_ALERT_AFTER) return;
  const title = `Источник «${WATCH_NAME[key]}» не работает`;
  const body = `${WATCH_ALERT_AFTER} проверки подряд с ошибкой ${code}. Пока он не починится, посты из него не выйдут.`;
  await deps.alerts.insert(
    [
      {
        id: `watch-down:${key}:${deps.now}`,
        kind: 'item',
        title,
        body,
        html: `⚠️ <b>${title}</b>\n${body}`,
        buttons: [],
        linkPath: '/sources'
      }
    ],
    deps.now
  );
}
