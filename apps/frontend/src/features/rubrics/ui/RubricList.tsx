import { RUBRIC_TITLES, type RubricItemDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import {
  Button,
  ErrorState,
  Panel,
  Skeleton,
  StatusPill,
  Switch,
  TextField,
  useToast,
  type StatusGroup
} from '../../../shared/ui';
import { rubricListQueryOptions, useUpdateRubric } from '../api/rubrics-queries';
import { mskWhen } from '../model/msk';
import { rubricsCopy as copy } from './copy';
import { RubricHistory } from './RubricHistory';
import styles from './RubricsPage.module.css';

const STATE: Record<
  RubricItemDto['state'],
  { group: StatusGroup; icon: 'check-circle' | 'pause' | 'alert' | 'clock' | 'minus-circle' }
> = {
  active: { group: 'done', icon: 'check-circle' },
  paused: { group: 'retry', icon: 'pause' },
  unavailable: { group: 'unknown', icon: 'alert' },
  waiting: { group: 'pending', icon: 'clock' },
  off: { group: 'muted', icon: 'minus-circle' }
};

function RubricRow({ item }: { item: RubricItemDto }) {
  const update = useUpdateRubric();
  const toast = useToast();
  const [rest, setRest] = useState(String(item.rest?.days ?? ''));
  const [history, setHistory] = useState(false);
  const title = RUBRIC_TITLES[item.key];
  const restValue = Number(rest);
  const restValid = Number.isInteger(restValue) && restValue >= 7 && restValue <= 60;
  const state = STATE[item.state];
  const save = (input: { enabled?: boolean; restDays?: number }) =>
    update.mutate(
      { key: item.key, input: { ...input, revision: item.revision } },
      {
        onSuccess: () => toast.show({ tone: 'success', title: copy.list.saved }),
        onError: (error) =>
          toast.show({
            tone: 'error',
            title: error instanceof ApiError && error.status === 409 ? copy.scheduler.stale : copy.scheduler.saveError
          })
      }
    );
  return (
    <li className={styles.rubricRow}>
      <div className={styles.rubricHead}>
        <h3 className={styles.rubricTitle}>{title}</h3>
        <StatusPill label={copy.list.states[item.state]} group={state.group} icon={state.icon} />
      </div>
      <p className={styles.meta}>
        {item.lastPostAt === null
          ? copy.list.noLastPost
          : copy.list.lastPost(mskWhen(item.lastPostAt), item.lastPostSeeded)}
        {item.next === null ? '' : ` · ${copy.list.next(mskWhen(item.next.at))}`}
        {item.missing.length === 0 ? '' : ` · ${copy.missing(item.missing.map((need) => copy.needs[need]).join(', '))}`}
      </p>
      <div className={styles.rubricControls}>
        <Switch isSelected={item.enabled} isDisabled={update.isPending} onChange={(enabled) => save({ enabled })}>
          {copy.list.enabled(title)}
        </Switch>
        <Button variant="secondary" aria-label={copy.history.open(title)} onPress={() => setHistory(true)}>
          {copy.history.button}
        </Button>
      </div>
      {item.rest === null ? null : (
        <form
          className={styles.restForm}
          onSubmit={(event) => {
            event.preventDefault();
            if (restValid) save({ restDays: restValue });
          }}
        >
          <TextField
            label={copy.list.rest}
            inputMode="numeric"
            value={rest}
            onChange={setRest}
            description={copy.list.restHint(item.rest.baseDays)}
            {...(restValid ? {} : { errorMessage: copy.list.restError })}
          />
          <Button
            type="submit"
            variant="secondary"
            isDisabled={!restValid || restValue === item.rest.days || update.isPending}
          >
            {copy.list.save}
          </Button>
        </form>
      )}
      {history ? <RubricHistory rubric={item.key} onClose={() => setHistory(false)} /> : null}
    </li>
  );
}

/** «Рубрики» → Рубрики: every rubric with its state, last and next post, on/off and its rest. */
export function RubricList() {
  const list = useQuery(rubricListQueryOptions());
  if (list.isPending) return <Skeleton width="100%" height={320} />;
  if (list.isError)
    return (
      <ErrorState
        message={copy.loadError}
        requestId={list.error instanceof ApiError ? list.error.requestId : undefined}
        onRetry={() => void list.refetch()}
      />
    );
  return (
    <Panel title={copy.list.caption}>
      <ul className={styles.rubricRows}>
        {list.data.items.map((item) => (
          <RubricRow key={item.key} item={item} />
        ))}
      </ul>
    </Panel>
  );
}
