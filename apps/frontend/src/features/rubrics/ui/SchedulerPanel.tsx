import { RUBRIC_TITLES, type RubricSchedulerStatusDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import {
  Banner,
  ErrorState,
  Panel,
  Select,
  Skeleton,
  StatusPill,
  Switch,
  type StatusGroup,
  useToast
} from '../../../shared/ui';
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
  // Live and the DEV rehearsal both post where the owner picks (owner, 31.10.2026).
  const picks = status.data?.mode === 'live' || status.data?.mode === 'rehearsal';
  const channels = useQuery({ ...rubricChannelsQueryOptions(), enabled: picks });
  const update = useUpdateRubricScheduler();
  const [channel, setChannel] = useState<string | null>(null);
  const toast = useToast();

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
          message={copy.loadError}
          requestId={status.error instanceof ApiError ? status.error.requestId : undefined}
          onRetry={() => void status.refetch()}
        />
      </Panel>
    );

  const data = status.data;
  const chosen = channel ?? data.destination?.id ?? null;
  const effective = EFFECTIVE[data.effective];
  const listed = (channels.data?.items ?? [])
    .filter((item) => item.kind === 'channel')
    .map((item) => ({ id: item.id, label: item.title }));
  // The channel in use stays shown while the list loads, fails, or no longer offers it (switched off).
  const current = data.destination;
  const channelOptions =
    current === null || listed.some((item) => item.id === current.id)
      ? listed
      : [{ id: current.id, label: current.title }, ...listed];
  const save = (input: { enabled: boolean; destinationId: string | null }) =>
    update.mutate(
      { ...input, revision: data.revision },
      {
        onError: (error) => {
          // The server keeps what it had: the picker shows that again.
          setChannel(null);
          toast.show({
            tone: 'error',
            title: error instanceof ApiError && error.status === 409 ? copy.scheduler.stale : copy.scheduler.saveError
          });
        }
      }
    );

  return (
    <Panel>
      <div className={styles.panelBody}>
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>{copy.scheduler.title}</h2>
          <StatusPill label={copy.scheduler.effective[data.effective]} group={effective.group} icon={effective.icon} />
        </div>
        {picks ? (
          <div className={styles.controls}>
            <Switch
              isSelected={data.enabled}
              isDisabled={update.isPending || (chosen === null && !data.enabled)}
              onChange={(enabled) => save({ enabled, destinationId: chosen })}
            >
              {copy.scheduler.switch}
            </Switch>
            <Select
              label={copy.scheduler.channel}
              placeholder={copy.scheduler.channelPlaceholder}
              options={channelOptions}
              value={chosen}
              isDisabled={update.isPending}
              onChange={(id) => {
                setChannel(id);
                if (data.enabled) save({ enabled: true, destinationId: id });
              }}
            />
            {channels.isError ? <p className={styles.meta}>{copy.scheduler.channelsError}</p> : null}
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
        {data.browserBudget === undefined ? null : (
          <p className={styles.meta}>
            {copy.scheduler.browser(
              Math.round(data.browserBudget.usedMs / 60_000),
              Math.round(data.browserBudget.capMs / 60_000)
            )}
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
