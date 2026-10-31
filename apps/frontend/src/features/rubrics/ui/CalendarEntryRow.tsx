import { RUBRIC_TITLES } from '@alexeev/contracts';
import { Icon, ListRow, StatusPill, VisuallyHidden } from '../../../shared/ui';
import { hasPicture, hasPoll, type CalendarItem } from '../model/calendar-items';
import { mskTime } from '../model/msk';
import { calendarCopy } from './calendar-copy';
import { rubricsCopy as copy } from './copy';
import { SlotState } from './SlotState';

export function itemReason(item: CalendarItem): string {
  return item.kind === 'slot' ? item.slot.reason.text : item.forecast.reason.text;
}

/** Picture and poll as icons with a text for screen readers. */
export function EntryMarkers({ item }: { item: CalendarItem }) {
  return (
    <>
      {hasPicture(item) ? (
        <span title={copy.picture}>
          <Icon name="image" size={16} aria-hidden="true" />
          <VisuallyHidden>{copy.picture}</VisuallyHidden>
        </span>
      ) : null}
      {hasPoll(item) ? (
        <span title={copy.poll}>
          <Icon name="chart" size={16} aria-hidden="true" />
          <VisuallyHidden>{copy.poll}</VisuallyHidden>
        </span>
      ) : null}
    </>
  );
}

export function EntryStatus({ item }: { item: CalendarItem }) {
  return item.kind === 'slot' ? (
    <SlotState state={item.slot.state} />
  ) : (
    <StatusPill label={calendarCopy.forecast} group="pending" icon="calendar" />
  );
}

/** One slot or forecast line as a pressable row: time, rubric, markers, state. Forecasts are dimmed. */
export function CalendarEntryRow({ item, onPress }: { item: CalendarItem; onPress: (item: CalendarItem) => void }) {
  const reason = itemReason(item);
  const unusual = reason !== '' && !calendarCopy.usualReason.test(reason);
  return (
    <ListRow
      title={RUBRIC_TITLES[item.rubricKey]}
      leading={<time dateTime={item.at}>{mskTime(item.at)}</time>}
      markers={<EntryMarkers item={item} />}
      meta={unusual ? reason : undefined}
      status={<EntryStatus item={item} />}
      isDimmed={item.kind === 'forecast'}
      onPress={() => onPress(item)}
    />
  );
}
