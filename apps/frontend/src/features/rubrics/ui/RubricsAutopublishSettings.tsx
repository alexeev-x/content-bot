import { RUBRIC_TITLES, type RubricSchedulerStatusDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { ErrorState, Select, Skeleton, StatusPill, Switch, type StatusGroup } from '../../../shared/ui';
import { rubricStatusQueryOptions } from '../api/rubrics-queries';
import { mskTime, mskWhen } from '../model/msk';
import { picksChannel, useChannelOptions, useSchedulerSave } from '../model/scheduler-model';
import { rubricsCopy as copy } from './copy';
import { RubricBlockers } from './RubricBlockers';
import page from './RubricsPage.module.css';
import { StopRubricsDialog } from './StopRubricsDialog';

const EFFECTIVE: Record<
  RubricSchedulerStatusDto['effective'],
  { group: StatusGroup; icon: 'check-circle' | 'pause' | 'alert' | 'clock' }
> = {
  running: { group: 'done', icon: 'check-circle' },
  switched_off: { group: 'muted', icon: 'pause' },
  locked: { group: 'retry', icon: 'alert' },
  unavailable: { group: 'muted', icon: 'clock' }
};

function Settings({ status }: { status: RubricSchedulerStatusDto }) {
  const { options, isError } = useChannelOptions(status);
  const { save, isPending } = useSchedulerSave(status);
  const [channel, setChannel] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const chosen = channel ?? status.destination?.id ?? null;
  const effective = EFFECTIVE[status.effective];
  return (
    <div className={page.panelBody}>
      <div className={page.panelHead}>
        <h3 className={page.panelTitle}>{copy.scheduler.title}</h3>
        <StatusPill label={copy.scheduler.effective[status.effective]} group={effective.group} icon={effective.icon} />
      </div>
      {picksChannel(status) ? (
        <div className={page.controls}>
          <Switch
            isSelected={status.enabled}
            isDisabled={isPending || (chosen === null && !status.enabled)}
            onChange={(enabled) => {
              // Switching off cancels the unreleased slots: asked once more, and shown only once the server confirmed.
              if (enabled) save({ enabled, destinationId: chosen });
              else setStopping(true);
            }}
          >
            {copy.scheduler.switch}
          </Switch>
          <Select
            label={copy.scheduler.channel}
            placeholder={copy.scheduler.channelPlaceholder}
            options={options}
            value={chosen}
            isDisabled={isPending}
            onChange={(id) => {
              setChannel(id);
              // The server keeps what it had when the save fails: the picker shows that again.
              if (status.enabled) save({ enabled: true, destinationId: id }, { onError: () => setChannel(null) });
            }}
          />
          {isError ? <p className={page.meta}>{copy.scheduler.channelsError}</p> : null}
        </div>
      ) : null}
      {status.mode === 'rehearsal' && status.destination !== null ? (
        <p className={page.meta}>{copy.scheduler.rehearsal(status.destination.title)}</p>
      ) : null}
      {status.next === null ? null : (
        <p className={page.meta}>
          {copy.scheduler.next(RUBRIC_TITLES[status.next.rubricKey], mskWhen(status.next.at))}
        </p>
      )}
      {status.browserBudget === undefined ? null : (
        <p className={page.meta}>
          {copy.scheduler.browser(
            Math.round(status.browserBudget.usedMs / 60_000),
            Math.round(status.browserBudget.capMs / 60_000)
          )}
        </p>
      )}
      {status.lastPlanAt === null ? null : (
        <p className={page.meta}>{copy.scheduler.lastPlan(mskTime(status.lastPlanAt))}</p>
      )}
      <RubricBlockers status={status} />
      <StopRubricsDialog status={status} isOpen={stopping} onOpenChange={setStopping} />
    </div>
  );
}

/** Настройки → Автопубликация → «Рубрики»: the switch, the channel and every blocker with its fix, in one place. */
export function RubricsAutopublishSettings() {
  const status = useQuery(rubricStatusQueryOptions());
  if (status.isPending)
    return (
      <output className={page.panelBody} aria-busy="true" aria-label={copy.loading}>
        <Skeleton width="100%" height={72} />
      </output>
    );
  if (status.isError)
    return (
      <ErrorState
        message={copy.loadError}
        requestId={status.error instanceof ApiError ? status.error.requestId : undefined}
        onRetry={() => void status.refetch()}
      />
    );
  return <Settings status={status.data} />;
}
