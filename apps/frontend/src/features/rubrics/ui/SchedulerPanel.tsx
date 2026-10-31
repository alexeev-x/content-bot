import { RUBRIC_TITLES, type RubricSchedulerStatusDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { Banner, ErrorState, Panel, Select, Skeleton, StatusPill, Switch, type StatusGroup } from '../../../shared/ui';
import { rubricChannelsQueryOptions, rubricStatusQueryOptions, useUpdateRubricScheduler } from '../api/rubrics-queries';
import { mskTime, mskWhen } from '../model/msk';
import { rubricsCopy as copy } from './copy';
import styles from './RubricsPage.module.css';

const EFFECTIVE: Record<
  RubricSchedulerStatusDto['effective'],
  { group: StatusGroup; icon: 'check-circle' | 'pause' | 'alert' | 'clock' }
> = {
  running: { group: 'done', icon: 'check-circle' },
  switched_off: { group: 'muted', icon: 'pause' },
  locked: { group: 'retry', icon: 'alert' },
  unavailable: { group: 'muted', icon: 'clock' }
};

/** «Автопубликация рубрик»: the state, the switch, the channel and whatever stops the scheduler now. */
export function SchedulerPanel() {
  const status = useQuery(rubricStatusQueryOptions());
  const live = status.data?.mode === 'live';
  const channels = useQuery({ ...rubricChannelsQueryOptions(), enabled: live });
  const update = useUpdateRubricScheduler();
  const [channel, setChannel] = useState<string | null>(null);

  if (status.isPending)
    return (
      <Panel>
        <output className={styles.panelBody} aria-busy="true" aria-label={copy.loading}>
          <Skeleton width="100%" height={72} />
        </output>
      </Panel>
    );
  if (status.isError)
    return (
      <Panel>
        <ErrorState
          message={copy.scheduler.saveError}
          requestId={status.error instanceof ApiError ? status.error.requestId : undefined}
          onRetry={() => void status.refetch()}
        />
      </Panel>
    );

  const data = status.data;
  const runs = data.mode === 'live' || data.mode === 'rehearsal';
  const chosen = channel ?? data.destination?.id ?? null;
  const effective = EFFECTIVE[data.effective];
  const channelOptions = (channels.data?.items ?? [])
    .filter((item) => item.kind === 'channel')
    .map((item) => ({ id: item.id, label: item.title }));

  return (
    <Panel>
      <div className={styles.panelBody}>
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>{copy.scheduler.title}</h2>
          <StatusPill label={copy.scheduler.effective[data.effective]} group={effective.group} icon={effective.icon} />
        </div>
        {runs ? (
          <div className={styles.controls}>
            <Switch
              isSelected={data.enabled}
              isDisabled={update.isPending || (live && chosen === null && !data.enabled)}
              onChange={(enabled) =>
                update.mutate({ enabled, revision: data.revision, ...(live ? { destinationId: chosen } : {}) })
              }
            >
              {copy.scheduler.switch}
            </Switch>
            {live ? (
              <Select
                label={copy.scheduler.channel}
                placeholder={copy.scheduler.channelPlaceholder}
                options={channelOptions}
                value={chosen}
                onChange={(id) => {
                  setChannel(id);
                  if (data.enabled) update.mutate({ enabled: true, destinationId: id, revision: data.revision });
                }}
              />
            ) : null}
          </div>
        ) : null}
        {data.mode === 'rehearsal' && data.destination !== null ? (
          <p className={styles.meta}>{copy.scheduler.rehearsal(data.destination.title)}</p>
        ) : null}
        {data.next === null ? null : (
          <p className={styles.meta}>
            {copy.scheduler.next(RUBRIC_TITLES[data.next.rubricKey], mskWhen(data.next.at))}
          </p>
        )}
        {data.lastPlanAt === null ? null : (
          <p className={styles.meta}>{copy.scheduler.lastPlan(mskTime(data.lastPlanAt))}</p>
        )}
        {data.locks.length === 0 ? null : (
          <ul className={styles.locks}>
            {data.locks.map((lock) => (
              <li key={lock.code}>{copy.scheduler.locks[lock.code]}</li>
            ))}
          </ul>
        )}
        {update.isError ? <Banner tone="error" title={copy.scheduler.saveError} /> : null}
      </div>
    </Panel>
  );
}
