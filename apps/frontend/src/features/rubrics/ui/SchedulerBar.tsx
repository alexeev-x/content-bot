import { RUBRIC_TITLES, type RubricSchedulerStatusDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useId, useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { Button, ConfirmDialog, ErrorState, Panel, Skeleton, StatusPill, useToast } from '../../../shared/ui';
import { rubricStatusQueryOptions } from '../api/rubrics-queries';
import { mskWhen } from '../model/msk';
import { startBlockers, useSchedulerSave } from '../model/scheduler-model';
import styles from './Autopublish.module.css';
import { rubricsCopy as copy } from './copy';
import panel from './RubricsPage.module.css';
import { StartChecklistDialog } from './StartChecklistDialog';
import { StopRubricsDialog } from './StopRubricsDialog';

type Open = 'start' | 'why' | 'stop' | null;

function pillOf(status: RubricSchedulerStatusDto, blockers: number) {
  const text = copy.scheduler.bar;
  if (status.mode === 'unavailable' || status.mode === 'forecast_only')
    return { label: text.forecastOnly, group: 'muted', icon: 'clock' } as const;
  if (status.effective === 'running') return { label: text.ready, group: 'done', icon: 'check-circle' } as const;
  if (blockers > 0) return { label: text.notReady(blockers), group: 'retry', icon: 'alert' } as const;
  return { label: text.stopped, group: 'muted', icon: 'pause' } as const;
}

function Bar({ status }: { status: RubricSchedulerStatusDto }) {
  const [open, setOpen] = useState<Open>(null);
  const noteId = useId();
  const toast = useToast();
  const { save, isPending } = useSchedulerSave(status);
  const blockers = startBlockers(status);
  const pill = pillOf(status, blockers.length);
  const text = copy.scheduler.bar;
  const forecastOnly = status.mode === 'unavailable' || status.mode === 'forecast_only';
  // The first reason, also when the control is disabled: the muted line is its accessible description.
  const first = forecastOnly
    ? copy.scheduler.locks.NOT_HERE
    : blockers[0]
      ? copy.scheduler.locks[blockers[0].code]
      : null;
  const close = (isOpen: boolean) => {
    if (!isOpen) setOpen(null);
  };
  const firstSlot = status.firstSlot;
  return (
    <Panel>
      <div className={styles.bar}>
        <h2 className={styles.barTitle}>{text.label}</h2>
        <StatusPill label={pill.label} group={pill.group} icon={pill.icon} />
        <div className={styles.barActions}>
          <Link to="/settings/general" search={{ tab: 'rubrics' }} className={styles.configure}>
            {text.configure}
          </Link>
          {status.enabled ? (
            <>
              {blockers.length > 0 ? (
                <Button variant="secondary" onPress={() => setOpen('why')}>
                  {text.why}
                </Button>
              ) : null}
              <Button variant="secondary" isDisabled={forecastOnly} onPress={() => setOpen('stop')}>
                {text.stop}
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              isDisabled={forecastOnly}
              {...(first === null ? {} : { 'aria-describedby': noteId })}
              onPress={() => setOpen('start')}
            >
              {text.start}
            </Button>
          )}
        </div>
        {first === null ? null : (
          <p id={noteId} className={styles.barNote}>
            {first}
          </p>
        )}
      </div>
      <ConfirmDialog
        isOpen={open === 'start' && blockers.length === 0}
        onOpenChange={close}
        tone="default"
        title={copy.scheduler.start.title}
        description={
          firstSlot === null
            ? copy.scheduler.start.noSlot
            : copy.scheduler.start.firstSlot(RUBRIC_TITLES[firstSlot.rubricKey], mskWhen(firstSlot.at))
        }
        confirmLabel={copy.scheduler.start.confirm}
        cancelLabel={copy.scheduler.blockersDialog.close}
        isPending={isPending}
        onConfirm={() =>
          save(
            { enabled: true, destinationId: status.destination?.id ?? null },
            {
              onSuccess: () => {
                setOpen(null);
                toast.show({ tone: 'success', title: copy.scheduler.start.started });
              }
            }
          )
        }
      />
      <StartChecklistDialog
        status={status}
        isOpen={(open === 'start' || open === 'why') && blockers.length > 0}
        onOpenChange={close}
      />
      <StopRubricsDialog status={status} isOpen={open === 'stop'} onOpenChange={close} />
    </Panel>
  );
}

/** «Рубрики» header: one line, the state, a link to the settings and «Старт» / «Остановить» (owner, 31.10.2026). */
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
