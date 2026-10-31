import { RUBRIC_TITLES, type RubricItemDto } from '@alexeev/contracts';
import { useState } from 'react';
import { Button, DetailRow, DetailSection, DetailSheet, Slider } from '../../../shared/ui';
import { mskWhen } from '../model/msk';
import { useRubricSave } from '../model/use-rubric-save';
import { rubricsCopy as copy } from './copy';
import { listCopy } from './list-copy';
import { RubricHistory } from './RubricHistory';
import styles from './RubricList.module.css';
import { RubricState } from './RubricState';

const REST_MIN = 7;
const REST_MAX = 60;

/** The rubric's drawer: rest days (saved only when changed), why it cannot go out, and its history. */
type Props = { item: RubricItemDto; onClose: () => void; onOpenAnalytics?: (() => void) | undefined };

export function RubricDetail({ item, onClose, onOpenAnalytics }: Props) {
  const { save, isPending } = useRubricSave(item);
  const title = RUBRIC_TITLES[item.key];
  const saved = item.rest?.days ?? null;
  // The draft is local and survives a 409: the owner's number is never replaced by the fresher server one.
  const [rest, setRest] = useState(saved ?? REST_MIN);
  const dirty = saved !== null && rest !== saved;
  return (
    <DetailSheet
      isOpen
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={title}
      status={<RubricState state={item.state} />}
      footer={
        <>
          {item.rest === null ? null : (
            <Button variant="primary" isDisabled={!dirty || isPending} onPress={() => save({ restDays: rest })}>
              {listCopy.detail.save}
            </Button>
          )}
          <Button variant="secondary" onPress={onClose}>
            {listCopy.detail.close}
          </Button>
        </>
      }
    >
      <DetailSection label={listCopy.detail.state}>
        <DetailRow label={listCopy.detail.lastPost}>
          {item.lastPostAt === null || item.lastPostSeeded ? listCopy.never : mskWhen(item.lastPostAt)}
        </DetailRow>
        <DetailRow label={listCopy.detail.nextPost}>
          {item.next === null ? '—' : `${mskWhen(item.next.at)} МСК`}
        </DetailRow>
      </DetailSection>
      {item.missing.length === 0 ? null : (
        <DetailSection label={listCopy.detail.blockers}>
          <DetailRow label={listCopy.detail.blockers}>
            {copy.missing(item.missing.map((need) => copy.needs[need]).join(', '))}
          </DetailRow>
        </DetailSection>
      )}
      {item.rest === null ? null : (
        <section className={styles.block}>
          <h3 className={styles.blockLabel}>{listCopy.detail.rest}</h3>
          <Slider
            label={listCopy.detail.restLabel}
            value={rest}
            onChange={setRest}
            min={REST_MIN}
            max={REST_MAX}
            step={1}
            decrementLabel={listCopy.detail.decrement}
            incrementLabel={listCopy.detail.increment}
            isDisabled={isPending}
          />
          <p className={styles.hint}>{listCopy.detail.restHint(item.rest.baseDays)}</p>
        </section>
      )}
      {onOpenAnalytics === undefined ? null : (
        <Button variant="secondary" onPress={onOpenAnalytics}>
          {listCopy.detail.analytics}
        </Button>
      )}
      <section className={styles.block}>
        <h3 className={styles.blockLabel}>{listCopy.detail.history}</h3>
        <RubricHistory rubric={item.key} />
      </section>
    </DetailSheet>
  );
}
