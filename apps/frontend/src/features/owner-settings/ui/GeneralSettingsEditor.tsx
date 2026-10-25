import { ApiError } from '../../../shared/api/http-client';
import { useNow } from '../../../shared/lib/use-now';
import { ru } from '../../../shared/lib/ru';
import { Banner, Button, ErrorState, Icon, Panel, Skeleton, VisuallyHidden } from '../../../shared/ui';
import { useGeneralSettings } from '../model/use-general-settings';
import { AutopublishActivity } from './AutopublishActivity';
import { AutopublishPanel } from './AutopublishPanel';
import { BackgroundJobsPanel } from './BackgroundJobsPanel';
import styles from './GeneralSettingsEditor.module.css';
import { TimezoneField, TimezoneFieldSkeleton } from './TimezoneField';

/** «15:32» and «UTC+3» in the chosen zone; an unknown zone shows nothing rather than the browser's time. */
function zoneClock(now: Date, timezone: string): { time: string; offset: string } | null {
  try {
    const time = new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }).format(
      now
    );
    const offset =
      new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'shortOffset' })
        .formatToParts(now)
        .find((part) => part.type === 'timeZoneName')
        ?.value.replace('GMT', 'UTC') ?? '';
    return { time, offset: offset === 'UTC' ? 'UTC+0' : offset };
  } catch {
    return null;
  }
}

/** The time zone panel with its real title and height, no request: also the route skeleton. */
export function GeneralSettingsSkeleton() {
  return (
    <div className={styles.page} aria-busy="true">
      <VisuallyHidden>
        <output>{ru.ui.loading}</output>
      </VisuallyHidden>
      <Panel title={ru.general.timezoneTitle} icon={<Icon name="clock" />}>
        <div className={styles.timezone}>
          <TimezoneFieldSkeleton />
          <div className={styles.clock} aria-hidden="true">
            <span className={styles.clockLabel}>{ru.general.localTime}</span>
            <span className={styles.clockTime}>
              <Skeleton width={64} height="1lh" />
            </span>
            <span className={styles.clockLabel}>
              <Skeleton width={40} height="1lh" />
            </span>
          </div>
        </div>
      </Panel>
    </div>
  );
}

const STATUS_TEXT = { idle: '', saving: ru.general.saving, saved: ru.general.saved } as const;

type Props = {
  /** DEV only: the background jobs' switches (the page knows the environment). */
  showBackground?: boolean;
  /** Enabled channels for the automatic publishing, composed by the page (features never import each other). */
  channels?: readonly { id: string; title: string }[];
};

/** The time zone, the automatic publishing and, on DEV, the background jobs; every change saves by itself. */
export function GeneralSettingsEditor({ channels = [], showBackground = false }: Props) {
  const { query, view, problem, status, isFetching, change, keepMine, loadCurrent } = useGeneralSettings();
  const now = useNow();
  const clock = view ? zoneClock(now, view.timezone) : null;

  if (query.isPending) return <GeneralSettingsSkeleton />;
  if (query.isError || !view) {
    const error = query.error;
    const forbidden = error instanceof ApiError && error.status === 403;
    return (
      <ErrorState
        title={forbidden ? ru.general.forbiddenTitle : ru.general.loadFailedTitle}
        message={forbidden ? ru.general.forbiddenBody : ru.general.loadFailedBody}
        {...(error instanceof ApiError && error.requestId ? { requestId: error.requestId } : {})}
        {...(forbidden ? {} : { onRetry: () => void query.refetch() })}
      />
    );
  }

  return (
    <div className={styles.page}>
      {problem?.kind === 'conflict' ? (
        <Banner tone="warning" title={ru.general.conflictTitle}>
          {ru.general.conflictBody}
          <div className={styles.bannerActions}>
            <Button variant="secondary" size="sm" isLoading={isFetching} onPress={() => void keepMine()}>
              {ru.general.conflictKeep}
            </Button>
            <Button variant="ghost" size="sm" isDisabled={isFetching} onPress={() => void loadCurrent()}>
              {ru.general.conflictReload}
            </Button>
          </div>
        </Banner>
      ) : null}
      {problem?.kind === 'failed' ? (
        <Banner tone="error" title={ru.general.saveFailedTitle}>
          {ru.general.saveFailedBody}
          {problem.requestId ? <span> {ru.general.requestId(problem.requestId)}</span> : null}
          <div className={styles.bannerActions}>
            <Button variant="secondary" size="sm" onPress={() => void keepMine()}>
              {ru.general.retry}
            </Button>
          </div>
        </Banner>
      ) : null}
      <Panel title={ru.general.timezoneTitle} icon={<Icon name="clock" />}>
        <div className={styles.timezone}>
          <TimezoneField value={view.timezone} now={now} onChange={(timezone) => change({ timezone })} />
          {clock ? (
            <div className={styles.clock}>
              <span className={styles.clockLabel}>{ru.general.localTime}</span>
              <time className={styles.clockTime} dateTime={now.toISOString()}>
                {clock.time}
              </time>
              <span className={styles.clockLabel}>{clock.offset}</span>
            </div>
          ) : null}
        </div>
      </Panel>
      <AutopublishPanel
        enabled={view.autopublishEnabled}
        destinationId={view.autopublishDestinationId}
        dailyLimit={view.autopublishDailyLimit}
        channels={channels}
        change={change}
      />
      <AutopublishActivity />
      {showBackground ? (
        <BackgroundJobsPanel enabled={view.backgroundEnabled} jobs={view.backgroundJobs} change={change} />
      ) : null}
      <output className={styles.status}>{STATUS_TEXT[status]}</output>
    </div>
  );
}
