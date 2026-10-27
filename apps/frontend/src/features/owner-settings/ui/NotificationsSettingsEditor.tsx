import { ApiError } from '../../../shared/api/http-client';
import { ru } from '../../../shared/lib/ru';
import { Banner, Button, ErrorState, Icon, type IconName, Panel, Select, Switch } from '../../../shared/ui';
import { type NotificationKey, NOTIFICATION_KEYS, useGeneralSettings } from '../model/use-general-settings';
import styles from './GeneralSettingsEditor.module.css';

// Settings → «Уведомления» (owner, 25.10.2026: «почти на каждое действие уведомление в бот, чтобы мог выключить,
// кроме критических ошибок», «если что-то по группам идёт — разбей»). Every change saves by itself.
const GROUPS: { title: string; icon: IconName; keys: NotificationKey[] }[] = [
  {
    title: ru.notifications.groups.publications,
    icon: 'send',
    keys: ['scheduleNotices', 'sentNotices', 'publicationAlerts', 'recoveryAlerts']
  },
  {
    title: ru.notifications.groups.sources,
    icon: 'link',
    keys: ['draftOffers', 'sourceAlerts', 'dotaWatchlistAlerts', 'automationAlerts']
  },
  {
    title: ru.notifications.groups.analytics,
    icon: 'chart',
    keys: ['dailyReport', 'weeklyReport', 'contentAlerts', 'aiReviews']
  },
  { title: ru.notifications.groups.ai, icon: 'sparkle', keys: ['scriptPrompts', 'aiLearning'] },
  { title: ru.notifications.groups.other, icon: 'bell', keys: ['warningsEnabled'] }
];

const HOURS = Array.from({ length: 24 }, (_, hour) => ({
  id: String(hour),
  label: ru.general.dailyReportHourOption(hour)
}));

const STATUS_TEXT = { idle: '', saving: ru.general.saving, saved: ru.general.saved } as const;

export function NotificationsSettingsEditor() {
  const { query, view, problem, status, isFetching, change, keepMine, loadCurrent } = useGeneralSettings();
  if (query.isPending || (!view && !query.isError)) {
    return <output className={styles.status}>{ru.ui.loading}</output>;
  }
  if (query.isError || !view) {
    const error = query.error;
    return (
      <ErrorState
        title={ru.general.loadFailedTitle}
        message={ru.general.loadFailedBody}
        {...(error instanceof ApiError && error.requestId ? { requestId: error.requestId } : {})}
        onRetry={() => void query.refetch()}
      />
    );
  }
  const all = (value: boolean) => change(Object.fromEntries(NOTIFICATION_KEYS.map((key) => [key, value])));
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
          <div className={styles.bannerActions}>
            <Button variant="secondary" size="sm" onPress={() => void keepMine()}>
              {ru.general.retry}
            </Button>
          </div>
        </Banner>
      ) : null}
      <div className={styles.bannerActions}>
        <Button
          variant="secondary"
          size="sm"
          isDisabled={NOTIFICATION_KEYS.every((key) => view[key])}
          onPress={() => all(true)}
        >
          {ru.notifications.enableAll}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          isDisabled={NOTIFICATION_KEYS.every((key) => !view[key])}
          onPress={() => all(false)}
        >
          {ru.notifications.disableAll}
        </Button>
      </div>
      {GROUPS.map((group) => (
        <Panel key={group.title} title={group.title} icon={<Icon name={group.icon} />}>
          <ul className={styles.switches}>
            {group.keys.map((key) => {
              const [label, description] = ru.notifications.items[key];
              return (
                <li key={key} className={styles.plain}>
                  <Switch
                    variant="row"
                    isSelected={view[key]}
                    onChange={(value) => change({ [key]: value })}
                    description={description}
                  >
                    {label}
                  </Switch>
                  {key === 'dailyReport' && view.dailyReport ? (
                    <Select
                      label={ru.notifications.reportHour}
                      options={HOURS}
                      value={String(view.dailyReportHour)}
                      onChange={(id) => change({ dailyReportHour: Number(id) })}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Panel>
      ))}
      <Banner tone="warning" title={ru.notifications.criticalTitle}>
        {ru.notifications.criticalBody}
      </Banner>
      <output className={styles.status}>{STATUS_TEXT[status]}</output>
    </div>
  );
}
