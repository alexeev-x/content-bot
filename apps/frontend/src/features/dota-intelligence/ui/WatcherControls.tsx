import { useEffect, useRef } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { Button } from '../../../shared/ui';
import { useDotaWatcher, useRunWatcherNow, useSetWatcherPaused } from '../api/dota-automation-queries';
import styles from './DotaIntelligence.module.css';

type Props = { onFinished: () => void };

/** «Проверить сейчас» and «Пауза» for the Dota watcher; the server confirms every state, nothing is assumed. */
export function WatcherControls({ onFinished }: Props) {
  const watcher = useDotaWatcher();
  const run = useRunWatcherNow();
  const toggle = useSetWatcherPaused();
  const automation = watcher.data ?? undefined;
  const running = run.isPending || (automation !== undefined && automation.executionState !== 'idle');
  const wasRunning = useRef(false);

  useEffect(() => {
    if (wasRunning.current && !running) onFinished();
    wasRunning.current = running;
  }, [running, onFinished]);

  if (!automation) return null;
  const paused = !automation.enabled;
  const error = run.error ?? toggle.error;
  const conflict = error instanceof ApiError && error.status === 409;

  return (
    <div className={styles.watcher}>
      <Button
        size="sm"
        variant="secondary"
        icon="retry"
        isLoading={running}
        isDisabled={paused || !automation.runNowAllowed || toggle.isPending}
        onPress={() => run.mutate()}
      >
        Проверить сейчас
      </Button>
      <Button
        size="sm"
        variant="ghost"
        isDisabled={running || toggle.isPending}
        onPress={() => toggle.mutate({ paused: !paused, revision: automation.revision })}
      >
        {paused ? 'Возобновить' : 'Пауза'}
      </Button>
      <output className={styles.refreshing} aria-live="polite">
        {running
          ? automation.executionState === 'queued' || run.isPending
            ? 'Проверка в очереди…'
            : 'Идёт проверка…'
          : paused
            ? 'Автопроверка на паузе'
            : ''}
      </output>
      {error ? (
        <span role="alert" className={styles.refreshing}>
          {conflict ? 'Состояние изменилось, обновлено.' : 'Не удалось выполнить действие.'}
        </span>
      ) : null}
    </div>
  );
}
