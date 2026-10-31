import { RUBRIC_TITLES, type RubricItemDto } from '@alexeev/contracts';
import { Icon, Switch, VisuallyHidden } from '../../../shared/ui';
import { addDays, mskDay, mskTime, shortDayLabel } from '../model/msk';
import { relativeDay } from '../model/rubric-filter';
import { useRubricSave } from '../model/use-rubric-save';
import { listCopy } from './list-copy';
import styles from './RubricTable.module.css';
import { RubricState } from './RubricState';

/** «завтра 15:30», or a dash. */
export function nextText(item: RubricItemDto, today: string): string {
  return item.next === null ? listCopy.dash : `${relativeDay(item.next.at, today)} ${mskTime(item.next.at)}`;
}

/** Short relative day of the last real post, or a dash (a seeded time is not a post). */
export function lastText(item: RubricItemDto, today: string): string {
  return item.lastPostAt === null || item.lastPostSeeded ? listCopy.dash : relativeDay(item.lastPostAt, today);
}

/** «отдыхает до 5 нояб.» while the rubric's rest after its last post has not passed. */
export function restUntilText(item: RubricItemDto, today: string): string | null {
  if (item.rest === null || item.lastPostAt === null || item.lastPostSeeded) return null;
  const until = addDays(mskDay(item.lastPostAt), item.rest.days);
  return until > today ? listCopy.restsUntil(shortDayLabel(until)) : null;
}

/** Picture and poll as icons with a text name, so the icons are never the only signal. */
export function FormatIcons({ item }: { item: RubricItemDto }) {
  return (
    <span className={styles.formats}>
      {item.hasPicture ? (
        <span title={listCopy.withPicture}>
          <Icon name="image" size={16} />
          <VisuallyHidden>{listCopy.withPicture}</VisuallyHidden>
        </span>
      ) : null}
      {item.hasPoll ? (
        <span title={listCopy.withPoll}>
          <Icon name="chart" size={16} />
          <VisuallyHidden>{listCopy.withPoll}</VisuallyHidden>
        </span>
      ) : null}
    </span>
  );
}

export const isException = (item: RubricItemDto) => item.state === 'paused' || item.state === 'unavailable';

/** The on/off switch: its name is an aria-label only. */
export function RubricSwitch({ item }: { item: RubricItemDto }) {
  const { save, isPending } = useRubricSave(item);
  return (
    <Switch
      aria-label={listCopy.switchLabel(RUBRIC_TITLES[item.key])}
      isSelected={item.enabled}
      isDisabled={isPending}
      onChange={(enabled) => save({ enabled })}
    >
      {null}
    </Switch>
  );
}

type Props = {
  label: string;
  rows: readonly RubricItemDto[];
  today: string;
  onOpen: (key: RubricItemDto['key']) => void;
};

/** Desktop: one 44 px line per rubric. The name opens the drawer; the switch is its own control. */
export function RubricTable({ label, rows, today, onOpen }: Props) {
  return (
    <table className={styles.table} aria-label={label}>
      <thead>
        <tr>
          <th scope="col">{listCopy.columns.rubric}</th>
          <th scope="col">{listCopy.columns.format}</th>
          <th scope="col">{listCopy.columns.last}</th>
          <th scope="col">{listCopy.columns.next}</th>
          <th scope="col">{listCopy.columns.state}</th>
          <th scope="col">
            <span className={styles.hidden}>{listCopy.columns.switch}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((item) => (
          <tr key={item.key} data-dimmed={item.enabled ? undefined : ''}>
            <th scope="row">
              <button type="button" className={styles.name} onClick={() => onOpen(item.key)}>
                {RUBRIC_TITLES[item.key]}
              </button>
            </th>
            <td>
              <FormatIcons item={item} />
            </td>
            <td className={styles.muted}>{lastText(item, today)}</td>
            <td>{nextText(item, today)}</td>
            <td>{isException(item) ? <RubricState state={item.state} /> : null}</td>
            <td className={styles.switch}>
              <RubricSwitch item={item} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
