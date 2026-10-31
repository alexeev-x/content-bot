import type { RubricSchedulerStatusDto } from '@alexeev/contracts';
import { useState } from 'react';
import { Button, Icon, Select, useToast } from '../../../shared/ui';
import { useRubricDevEnable } from '../api/rubrics-queries';
import { isDevFix, startBlockers, useChannelOptions, useSchedulerSave } from '../model/scheduler-model';
import styles from './Autopublish.module.css';
import { rubricsCopy as copy } from './copy';

type Props = { status: RubricSchedulerStatusDto };

/**
 * What stops the rubrics, each with its fix (the server names it in `fix`): a channel picker with «Сохранить», one DEV
 * button for every DEV switch, text only where nothing here can help (a server setting, a missing migration).
 */
export function RubricBlockers({ status }: Props) {
  const blockers = startBlockers(status);
  const channels = useChannelOptions(status);
  const { save, isPending } = useSchedulerSave(status);
  const devEnable = useRubricDevEnable();
  const toast = useToast();
  const [picked, setPicked] = useState<string | null>(null);
  if (blockers.length === 0) return null;
  const hasDev = blockers.some(isDevFix);
  return (
    <div className={styles.blockers}>
      <ul className={styles.blockerList} aria-label={copy.scheduler.blockersDialog.list}>
        {blockers.map((lock) => (
          <li key={lock.code} className={styles.blocker}>
            <span className={styles.blockerText}>
              <Icon name="alert" size={16} />
              {copy.scheduler.locks[lock.code]}
            </span>
            {lock.fix === 'PICK_CHANNEL' ? (
              <div className={styles.fix}>
                <Select
                  label={copy.scheduler.channel}
                  placeholder={copy.scheduler.channelPlaceholder}
                  options={channels.options}
                  value={picked}
                  isDisabled={isPending}
                  onChange={setPicked}
                />
                <Button
                  variant="primary"
                  isLoading={isPending}
                  isDisabled={picked === null}
                  onPress={() =>
                    save({ enabled: status.enabled, destinationId: picked }, { onSuccess: () => setPicked(null) })
                  }
                >
                  {copy.scheduler.blockersDialog.save}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {hasDev ? (
        <Button
          variant="primary"
          isLoading={devEnable.isPending}
          onPress={() =>
            devEnable.mutate(undefined, {
              onError: () => toast.show({ tone: 'error', title: copy.scheduler.blockersDialog.devError })
            })
          }
        >
          {copy.scheduler.blockersDialog.devAll}
        </Button>
      ) : null}
    </div>
  );
}
