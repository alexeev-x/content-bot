import { ApiError } from '../../../shared/api/http-client';
import { useNow } from '../../../shared/lib/use-now';
import { ru } from '../../../shared/lib/ru';
import {
  Banner,
  Button,
  ErrorState,
  Icon,
  IconBadge,
  type IconName,
  Panel,
  Select,
  Skeleton,
  type StatusGroup,
  Switch,
  VisuallyHidden
} from '../../../shared/ui';
import { useGeneralSettings, type SettingsPatch } from '../model/use-general-settings';
import styles from './GeneralSettingsEditor.module.css';
import { TimezoneField, TimezoneFieldSkeleton } from './TimezoneField';

const SWITCHES = [
  {
    key: 'scheduleNotices',
    label: ru.general.scheduleNotices,
    description: ru.general.scheduleNoticesHint,
    icon: 'calendar',
    tone: 'done'
  },
  {
    key: 'sentNotices',
    label: ru.general.sentNotices,
    description: ru.general.sentNoticesHint,
    icon: 'send',
    tone: 'accent'
  },
  {
    key: 'publicationAlerts',
    label: ru.general.publications,
    description: ru.general.publicationsHint,
    icon: 'alert',
    tone: 'unknown'
  },
  { key: 'sourceAlerts', label: ru.general.sources, description: ru.general.sourcesHint, icon: 'link', tone: 'retry' },
  {
    key: 'recoveryAlerts',
    label: ru.general.recovery,
    description: ru.general.recoveryHint,
    icon: 'retry',
    tone: 'failed'
  }
] as const satisfies readonly {
  key: keyof SettingsPatch;
  label: string;
  description: string;
  icon: IconName;
  tone: StatusGroup | 'accent';
}[];

const HOURS = Array.from({ length: 24 }, (_, hour) => ({
  id: String(hour),
  label: ru.general.dailyReportHourOption(hour)
}));

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

/** The two panels with their real titles and the height their fields fill, no request: also the route skeleton. */
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
      <Panel
        title={ru.general.notificationsTitle}
        icon={<Icon name="bell" />}
        note={ru.general.notificationsNote}
        action={
          <Button variant="secondary" size="sm" isDisabled>
            {ru.general.enableAll}
          </Button>
        }
      >
        {/* The rows are static: only the switch positions wait for the settings, so they show disabled until then. */}
        <ul className={styles.switches} aria-hidden="true">
          {SWITCHES.map(({ key, label, description, icon }) => (
            <li key={key} className={styles.notice}>
              <IconBadge name={icon} tone="muted" />
              <Switch variant="row" isDisabled isSelected={false} description={description}>
                {label}
              </Switch>
            </li>
          ))}
        </ul>
        <div className={styles.critical}>
          <Banner tone="warning" title={ru.general.criticalTitle}>
            {ru.general.criticalBody}
          </Banner>
        </div>
      </Panel>
    </div>
  );
}

const STATUS_TEXT = { idle: '', saving: ru.general.saving, saved: ru.general.saved } as const;

/** One page for the time zone and the notification switches; every change saves by itself, there is no Save button. */
export function GeneralSettingsEditor() {
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
      <Panel
        title={ru.general.notificationsTitle}
        icon={<Icon name="bell" />}
        note={ru.general.notificationsNote}
        action={
          <Button
            variant="secondary"
            size="sm"
            isDisabled={SWITCHES.every(({ key }) => view[key])}
            onPress={() => change(Object.fromEntries(SWITCHES.map(({ key }) => [key, true])) as SettingsPatch)}
          >
            {ru.general.enableAll}
          </Button>
        }
      >
        <ul className={styles.switches}>
          {SWITCHES.map(({ key, label, description, icon, tone }) => (
            <li key={key} className={styles.notice}>
              <IconBadge name={icon} tone={tone} />
              <Switch
                variant="row"
                isSelected={view[key]}
                onChange={(value) => change({ [key]: value })}
                description={description}
              >
                {label}
              </Switch>
            </li>
          ))}
        </ul>
        <div className={styles.critical}>
          <Banner tone="warning" title={ru.general.criticalTitle}>
            {ru.general.criticalBody}
          </Banner>
        </div>
      </Panel>
      {/* Its own panel: «Включить все» never starts a daily message the owner did not choose (plan §4.3). */}
      <Panel title={ru.general.dailyReportTitle} icon={<Icon name="chart" />}>
        <div className={styles.report}>
          <Switch
            variant="row"
            isSelected={view.dailyReport}
            onChange={(value) => change({ dailyReport: value })}
            description={ru.general.dailyReportHint}
          >
            {ru.general.dailyReport}
          </Switch>
          {view.dailyReport ? (
            <Select
              label={ru.general.dailyReportHour}
              options={HOURS}
              value={String(view.dailyReportHour)}
              onChange={(id) => change({ dailyReportHour: Number(id) })}
            />
          ) : null}
        </div>
      </Panel>
      <output className={styles.status}>{STATUS_TEXT[status]}</output>
    </div>
  );
}
