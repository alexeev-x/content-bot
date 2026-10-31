import { RUBRIC_TITLES, type RubricKey } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { Button, DetailRow, DetailSection, DetailSheet, Panel, PanelList, StatusPill } from '../../../shared/ui';
import { rubricListQueryOptions } from '../api/rubrics-queries';
import { hasPicture, hasPoll, type CalendarItem } from '../model/calendar-items';
import { dayLabel, mskTime, mskWhen } from '../model/msk';
import { CalendarEntryRow, itemReason } from './CalendarEntryRow';
import { calendarCopy as text } from './calendar-copy';
import styles from './CalendarDrawer.module.css';
import { SlotDrawer } from './UpcomingSlots';

export type CalendarTarget = { kind: 'item'; item: CalendarItem } | { kind: 'day'; day: string };

type Props = {
  target: CalendarTarget | null;
  /** The entries of the day a `day` target opens. */
  dayItems: (day: string) => readonly CalendarItem[];
  onClose: () => void;
  onOpenItem: (item: CalendarItem) => void;
  onOpenRubric: (key: RubricKey) => void;
};

function contentOf(item: CalendarItem): string {
  const picture = hasPicture(item);
  const poll = hasPoll(item);
  if (picture && poll) return text.withBoth;
  if (picture) return text.withPicture;
  return poll ? text.withPoll : text.textOnly;
}

function ForecastDrawer({
  item,
  onClose,
  onOpenRubric
}: {
  item: Extract<CalendarItem, { kind: 'forecast' }>;
  onClose: () => void;
  onOpenRubric: (key: RubricKey) => void;
}) {
  // Rest and last post live on the rubric list; it is usually cached by now.
  const rubrics = useQuery(rubricListQueryOptions());
  const rubric = rubrics.data?.items.find((each) => each.key === item.rubricKey);
  const title = RUBRIC_TITLES[item.rubricKey];
  return (
    <DetailSheet
      isOpen
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={title}
      subtitle={`${dayLabel(item.day)}, ${mskTime(item.at)} МСК`}
      status={<StatusPill label={text.forecast} group="pending" icon="calendar" />}
      footer={
        <Button variant="primary" onPress={() => onOpenRubric(item.rubricKey)}>
          {text.openRubric}
        </Button>
      }
    >
      <DetailSection label={text.sections.what}>
        <DetailRow label={text.rows.content}>{contentOf(item)}</DetailRow>
        <DetailRow label={text.rows.reason}>{itemReason(item)}</DetailRow>
      </DetailSection>
      {rubric === undefined ? null : (
        <DetailSection label={text.sections.rubric}>
          {rubric.rest === null ? null : (
            <DetailRow label={text.rows.rest}>{text.restDays(rubric.rest.days)}</DetailRow>
          )}
          <DetailRow label={text.rows.lastPost}>
            {rubric.lastPostAt === null
              ? text.noPost
              : rubric.lastPostSeeded
                ? text.seededPost
                : `${mskWhen(rubric.lastPostAt)} МСК`}
          </DetailRow>
        </DetailSection>
      )}
      <p className={styles.note}>{text.forecastNote}</p>
    </DetailSheet>
  );
}

function DayDrawer({
  day,
  items,
  onClose,
  onOpenItem
}: {
  day: string;
  items: readonly CalendarItem[];
  onClose: () => void;
  onOpenItem: (item: CalendarItem) => void;
}) {
  return (
    <DetailSheet isOpen onOpenChange={(open) => (open ? undefined : onClose())} title={dayLabel(day)}>
      <Panel>
        <PanelList aria-label={dayLabel(day)}>
          {items.map((item) => (
            <CalendarEntryRow key={item.key} item={item} onPress={onOpenItem} />
          ))}
        </PanelList>
      </Panel>
    </DetailSheet>
  );
}

/** One drawer for every calendar entry: a real slot (state, steps, skip), a forecast line, or a whole day. */
export function CalendarDrawer({ target, dayItems, onClose, onOpenItem, onOpenRubric }: Props) {
  if (target === null) return null;
  if (target.kind === 'day')
    return <DayDrawer day={target.day} items={dayItems(target.day)} onClose={onClose} onOpenItem={onOpenItem} />;
  if (target.item.kind === 'slot') return <SlotDrawer id={target.item.slot.id} onClose={onClose} />;
  return <ForecastDrawer item={target.item} onClose={onClose} onOpenRubric={onOpenRubric} />;
}
