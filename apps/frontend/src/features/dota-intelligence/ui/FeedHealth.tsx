import type { AutomationId, DotaFeedErrorDto, DotaSourceDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { ApiError } from '../../../shared/api/http-client';
import { useNow } from '../../../shared/lib/use-now';
import { Button, Disclosure, DisclosureGroup, VisuallyHidden } from '../../../shared/ui';
import { useDotaAutomation, useRunAutomationNow, useSetAutomationPaused } from '../api/dota-automation-queries';
import { dotaHeroStatisticsQueryOptions } from '../api/dota-hero-statistics-queries';
import { dotaIntelligenceQueryOptions } from '../api/dota-queries';
import { DotaTime } from './DotaTime';
import { FeedErrorDialog } from './FeedErrorDialog';
import styles from './FeedHealth.module.css';

type Health = DotaSourceDto['health'];
const HEALTH_LABELS: Record<Health, string> = {
  healthy: 'Работает',
  stale: 'Давно не обновлялась',
  unverified: 'Ещё не проверялась',
  degraded: 'Последняя проверка с ошибкой'
};
const TONE: Record<
  Health,
  { group: 'done' | 'unknown' | 'muted' | 'failed'; icon: 'check-circle' | 'alert' | 'help' | 'x-circle' }
> = {
  healthy: { group: 'done', icon: 'check-circle' },
  stale: { group: 'unknown', icon: 'alert' },
  unverified: { group: 'muted', icon: 'help' },
  degraded: { group: 'failed', icon: 'x-circle' }
};
const PROVIDERS: Record<DotaSourceDto['key'], string> = {
  patch_notes: 'сайта Dota 2',
  steam_news: 'Steam'
};
const FEED_NAMES: Record<DotaSourceDto['key'], string> = {
  patch_notes: 'Патчи Dota 2',
  steam_news: 'Новости Steam'
};

type Feed = {
  id: string;
  name: string;
  provider: string;
  error: DotaFeedErrorDto | null;
  health: Health;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
};

/** «Проверить сейчас» and «Пауза» for the event watcher; the server confirms every state, nothing is assumed. */
function WatcherControls({ onFinished }: { onFinished: () => void }) {
  const id: AutomationId = 'dota-intelligence';
  const watcher = useDotaAutomation(id);
  const run = useRunAutomationNow(id);
  const toggle = useSetAutomationPaused(id);
  // Hero statistics have their own job (Cron every 6 h, at most every 5 min on demand); the same button re-checks them.
  const heroes = useDotaAutomation('dota-hero-statistics');
  const heroesRun = useRunAutomationNow('dota-hero-statistics');
  const automation = watcher.data ?? undefined;
  const heroesBusy = heroesRun.isPending || (heroes.data != null && heroes.data.executionState !== 'idle');
  const running = run.isPending || heroesBusy || (automation !== undefined && automation.executionState !== 'idle');
  const checkNow = () => {
    run.mutate();
    if (heroes.data?.enabled && heroes.data.runNowAllowed) heroesRun.mutate();
  };
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
    <div className={styles.controls}>
      <Button
        size="sm"
        variant="secondary"
        icon="retry"
        isLoading={running}
        isDisabled={paused || !automation.runNowAllowed || toggle.isPending}
        onPress={checkNow}
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
      <output className={styles.note} aria-live="polite">
        {running ? 'Идёт проверка…' : paused ? 'Автопроверка на паузе' : ''}
      </output>
      {error ? (
        <span role="alert" className={styles.note}>
          {conflict ? 'Состояние изменилось, обновлено.' : 'Не удалось выполнить действие.'}
        </span>
      ) : null}
    </div>
  );
}

type Props = { timezone: string; onChecked?: () => void };

/** One row under the page header: a dot per feed; the details (last check, pause) open on demand. */
export function FeedHealth({ timezone, onChecked }: Props) {
  const now = useNow().getTime();
  const sources = useQuery(dotaIntelligenceQueryOptions());
  const heroes = useQuery(dotaHeroStatisticsQueryOptions());
  const [openFeed, setOpenFeed] = useState<string | null>(null);
  const feeds: Feed[] = [
    ...(sources.data?.sources ?? []).map((source) => ({
      id: source.key,
      name: FEED_NAMES[source.key],
      provider: PROVIDERS[source.key],
      error: source.lastError,
      health: source.health,
      lastAttemptAt: source.lastAttemptAt,
      lastSuccessAt: source.lastSuccessAt
    })),
    ...(heroes.data
      ? [
          {
            id: 'opendota',
            name: 'Статистика героев',
            provider: 'OpenDota',
            error: heroes.data.lastError,
            health: heroes.data.health,
            lastAttemptAt: heroes.data.lastAttemptAt,
            lastSuccessAt: heroes.data.lastSuccessAt
          }
        ]
      : [])
  ];
  if (feeds.length === 0) return null;
  const dots = (
    <span className={styles.dots}>
      {feeds.map((feed) => (
        <span
          key={feed.id}
          className={styles.dot}
          data-group={TONE[feed.health].group}
          title={`${feed.name}: ${HEALTH_LABELS[feed.health]}`}
        >
          <VisuallyHidden>{`${feed.name}: ${HEALTH_LABELS[feed.health]}`}</VisuallyHidden>
        </span>
      ))}
    </span>
  );
  return (
    <DisclosureGroup>
      <Disclosure id="feeds" title="Состояние лент" aside={dots}>
        <ul className={styles.list}>
          {feeds.map((feed) => {
            const failed = feed.health === 'degraded';
            return (
              <li key={feed.id} className={styles.row}>
                <span className={styles.dot} data-group={TONE[feed.health].group} aria-hidden="true" />
                <div className={styles.main}>
                  <strong className={styles.name}>{feed.name}</strong>
                  <span className={styles.note} data-tone={failed ? 'failed' : undefined}>
                    {!failed && feed.lastSuccessAt ? (
                      <>
                        Обновлено <DotaTime iso={feed.lastSuccessAt} now={now} timezone={timezone} />
                      </>
                    ) : (
                      HEALTH_LABELS[feed.health]
                    )}
                  </span>
                  {feed.error ? (
                    <>
                      <AriaButton className={styles.more} onPress={() => setOpenFeed(feed.id)}>
                        Подробнее
                      </AriaButton>
                      <FeedErrorDialog
                        feedName={feed.name}
                        provider={feed.provider}
                        error={feed.error}
                        now={now}
                        timezone={timezone}
                        isOpen={openFeed === feed.id}
                        onOpenChange={(open) => setOpenFeed(open ? feed.id : null)}
                      />
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        <WatcherControls
          onFinished={() => {
            void sources.refetch();
            void heroes.refetch();
            onChecked?.();
          }}
        />
      </Disclosure>
    </DisclosureGroup>
  );
}
