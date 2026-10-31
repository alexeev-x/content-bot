import type { RubricSchedulerStatusDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ApiError } from '../../../shared/api/http-client';
import { ErrorState, Panel, Skeleton, StatusPill } from '../../../shared/ui';
import { rubricStatusQueryOptions } from '../api/rubrics-queries';
import { startBlockers } from '../model/scheduler-model';
import styles from './Autopublish.module.css';
import { rubricsCopy as copy } from './copy';
import panel from './RubricsPage.module.css';

function pillOf(status: RubricSchedulerStatusDto, blockers: number) {
  const text = copy.scheduler.bar;
  if (status.mode === 'unavailable' || status.mode === 'forecast_only')
    return { label: text.forecastOnly, group: 'muted', icon: 'clock' } as const;
  if (status.effective === 'running') return { label: text.ready, group: 'done', icon: 'check-circle' } as const;
  if (blockers > 0) return { label: text.notReady(blockers), group: 'retry', icon: 'alert' } as const;
  return { label: text.stopped, group: 'muted', icon: 'pause' } as const;
}

function Bar({ status }: { status: RubricSchedulerStatusDto }) {
  const blockers = startBlockers(status);
  const pill = pillOf(status, blockers.length);
  const text = copy.scheduler.bar;
  const forecastOnly = status.mode === 'unavailable' || status.mode === 'forecast_only';
  const first = forecastOnly
    ? copy.scheduler.locks.NOT_HERE
    : blockers[0]
      ? copy.scheduler.locks[blockers[0].code]
      : null;
  return (
    <Panel>
      <div className={styles.bar}>
        <h2 className={styles.barTitle}>{text.label}</h2>
        <StatusPill label={pill.label} group={pill.group} icon={pill.icon} />
        <div className={styles.barActions}>
          <Link to="/settings/general" search={{ tab: 'rubrics' }} className={styles.configure}>
            {text.configure}
          </Link>
        </div>
        {first === null ? null : <p className={styles.barNote}>{first}</p>}
      </div>
    </Panel>
  );
}

/** «Рубрики» header: one line, the state and «Настроить»; switching on and off lives only in Settings (owner, 31.10.2026). */
export function SchedulerBar() {
  const status = useQuery(rubricStatusQueryOptions());
  if (status.isPending)
    return (
      <Panel>
        <output className={panel.panelBody} aria-busy="true" aria-label={copy.loading}>
          <Skeleton width="100%" height={44} />
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
  return <Bar status={status.data} />;
}
