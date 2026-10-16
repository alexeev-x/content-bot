import { ApiError } from '../../../shared/api/http-client';
import { useNow } from '../../../shared/lib/use-now';
import { ru } from '../../../shared/lib/ru';
import { Banner, Button, ErrorState, Panel, Skeleton, Switch, VisuallyHidden } from '../../../shared/ui';
import { useGeneralSettings, type SettingsPatch } from '../model/use-general-settings';
import styles from './GeneralSettingsEditor.module.css';
import { TimezoneField } from './TimezoneField';

const SWITCHES = [
  { key: 'scheduleNotices', label: ru.general.scheduleNotices, description: ru.general.scheduleNoticesHint },
  { key: 'sentNotices', label: ru.general.sentNotices, description: ru.general.sentNoticesHint },
  { key: 'publicationAlerts', label: ru.general.publications, description: ru.general.publicationsHint },
  { key: 'sourceAlerts', label: ru.general.sources, description: ru.general.sourcesHint },
  { key: 'recoveryAlerts', label: ru.general.recovery, description: ru.general.recoveryHint }
] as const satisfies readonly { key: keyof SettingsPatch; label: string; description: string }[];

/** The two panels with their real titles and the height their fields fill, no request: also the route skeleton. */
export function GeneralSettingsSkeleton() {
  return (
    <div className={styles.page} aria-busy="true">
      <VisuallyHidden>
        <output>{ru.ui.loading}</output>
      </VisuallyHidden>
      <Panel title={ru.general.timezoneTitle} reserveRows={3} reservePhoneRows={3.6}>
        <div className={styles.body}>
          <Skeleton height="var(--size-control)" />
        </div>
      </Panel>
      <Panel
        title={ru.general.notificationsTitle}
        note={ru.general.notificationsNote}
        reserveRows={6.6}
        reservePhoneRows={9.4}
      >
        <div className={styles.body}>
          <Skeleton lines={3} height={20} />
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
      <Panel title={ru.general.timezoneTitle}>
        <div className={styles.body}>
          <TimezoneField value={view.timezone} now={now} onChange={(timezone) => change({ timezone })} />
        </div>
      </Panel>
      <Panel title={ru.general.notificationsTitle} note={ru.general.notificationsNote}>
        <div className={styles.switches}>
          {SWITCHES.map(({ key, label, description }) => (
            <Switch
              key={key}
              variant="row"
              isSelected={view[key]}
              onChange={(value) => change({ [key]: value })}
              description={description}
            >
              {label}
            </Switch>
          ))}
        </div>
        <p className={styles.critical}>{ru.general.critical}</p>
      </Panel>
      <output className={styles.status}>{STATUS_TEXT[status]}</output>
    </div>
  );
}
