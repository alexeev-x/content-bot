import {
  DateFormatter,
  getLocalTimeZone,
  now,
  Time as TimeValue,
  toZoned,
  type Time,
  type ZonedDateTime
} from '@internationalized/date';
import {
  Button,
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarStateContext,
  DateInput,
  DatePicker,
  DateSegment,
  Dialog,
  FieldError,
  Group,
  Heading,
  I18nProvider,
  Label,
  Popover,
  Text,
  TimeField as AriaTimeField
} from 'react-aria-components';
import { useContext, useState } from 'react';
import { nextQuarterHour } from '../lib/next-quarter-hour';
import { ru } from '../lib/ru';
import { DateTimePickerTimePanel } from './DateTimePickerTimePanel';
import { Icon, type IconName } from './Icon';
import styles from './Field.module.css';
import dateStyles from './DateTimeField.module.css';

const LOCALE = 'ru-RU';
const MONTH_NAME = new DateFormatter(LOCALE, { month: 'long', timeZone: 'UTC' });

function offsetLabel(offsetMs: number): string {
  const sign = offsetMs < 0 ? '-' : '+';
  const minutes = Math.abs(offsetMs) / 60_000;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `UTC${sign}${hours}${rest ? `:${String(rest).padStart(2, '0')}` : ''}`;
}

function utcText(value: ZonedDateTime): string {
  return `${value.toDate().toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function PickerGroup({
  label,
  value,
  zone,
  offset
}: {
  label: string;
  value: ZonedDateTime | null;
  zone: string;
  offset: string;
}) {
  const date = value
    ? new DateFormatter(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: zone }).format(
        value.toDate()
      )
    : null;
  const time = value
    ? new DateFormatter(LOCALE, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone }).format(
        value.toDate()
      )
    : null;
  const formatted = date && time ? `${date} · ${time}` : ru.ui.selectDateTime;
  return (
    <Group className={`${styles.input} ${dateStyles.group}`}>
      <Button
        className={dateStyles.fieldButton}
        aria-label={`${ru.ui.openCalendar}: ${label}, ${formatted} (${offset})`}
      >
        <span>{formatted}</span>
        <span className={dateStyles.fieldOffset}>({offset})</span>
        <Icon name="calendar" size={18} className={dateStyles.fieldIcon} />
      </Button>
    </Group>
  );
}

function CalendarMonthHeading() {
  const state = useContext(CalendarStateContext);
  if (!state) return null;
  const visibleMonth = state.visibleRange.start;
  return (
    <>
      <Heading className={dateStyles.screenReaderOnly} />
      <span className={dateStyles.month} aria-hidden="true">
        {MONTH_NAME.format(visibleMonth.toDate('UTC'))} {visibleMonth.year}
      </span>
    </>
  );
}

export function CalendarPanel() {
  return (
    <Calendar className={dateStyles.calendar}>
      <header className={dateStyles.calendarHeader}>
        <Button slot="previous" className={dateStyles.nav}>
          <Icon name="chevron-left" size={18} />
        </Button>
        <CalendarMonthHeading />
        <Button slot="next" className={dateStyles.nav}>
          <Icon name="chevron-right" size={18} />
        </Button>
      </header>
      <CalendarGrid className={dateStyles.grid} weekdayStyle="short">
        {(date) => <CalendarCell date={date} className={dateStyles.cell} />}
      </CalendarGrid>
    </Calendar>
  );
}

type Props = {
  label: string;
  value: ZonedDateTime | null;
  onChange: (value: ZonedDateTime | null) => void;
  timeZone: string;
  description?: string;
  errorMessage?: string;
  isDisabled?: boolean;
  isRequired?: boolean;
  minValue?: ZonedDateTime;
};

/** A scheduled instant is edited as a draft until Done; dismissing the popover discards it. */
export function DateTimeField({
  label,
  value,
  onChange,
  timeZone,
  description,
  errorMessage,
  isDisabled,
  isRequired,
  minValue
}: Props) {
  const zone = timeZone || getLocalTimeZone();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<ZonedDateTime | null>(null);
  const shown = isOpen ? draft : value;
  const offset = offsetLabel((shown ?? now(zone)).offset);

  function constrain(candidate: ZonedDateTime): ZonedDateTime {
    if (!minValue) return candidate;
    const current = now(zone);
    const lowerBound = minValue.toDate().getTime() > current.toDate().getTime() ? minValue : current;
    return candidate.toDate().getTime() <= lowerBound.toDate().getTime() ? nextQuarterHour(lowerBound) : candidate;
  }

  function normalize(next: ZonedDateTime | null): ZonedDateTime | null {
    if (next === null) return null;
    return constrain('timeZone' in next ? next : toZoned(next, zone));
  }

  function confirm(candidate?: ZonedDateTime) {
    const chosen = constrain(candidate ?? draft ?? nextQuarterHour(now(zone)));
    onChange(chosen);
    setIsOpen(false);
    setDraft(null);
  }

  function cancel() {
    setIsOpen(false);
    setDraft(null);
  }

  return (
    <I18nProvider locale={LOCALE}>
      <DatePicker
        value={shown}
        onChange={(next) => {
          const chosen = normalize(next);
          if (isOpen) setDraft(chosen);
          else onChange(chosen);
        }}
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (open) {
            setDraft(value ?? nextQuarterHour(now(zone)));
            setIsOpen(true);
          } else cancel();
        }}
        granularity="minute"
        hourCycle={24}
        hideTimeZone
        shouldCloseOnSelect={false}
        placeholderValue={now(zone)}
        minValue={minValue}
        isDisabled={isDisabled}
        isRequired={isRequired}
        isInvalid={Boolean(errorMessage)}
        shouldForceLeadingZeros
        className={styles.field}
      >
        <Label className={styles.label}>{label}</Label>
        <PickerGroup label={label} value={shown} zone={zone} offset={offset} />
        <Text slot="description" className={`${styles.description} ${dateStyles.description}`}>
          <span>
            {ru.ui.timeZone(zone, offset)}
            {description ? ` · ${description}` : ''}
          </span>
          {value ? <span className="mono">{ru.ui.utcHint(utcText(value))}</span> : null}
        </Text>
        <FieldError className={styles.error}>{errorMessage}</FieldError>
        <Popover className={dateStyles.popover} placement="bottom" shouldFlip={false} offset={8}>
          <Dialog className={dateStyles.dialog}>
            <div className={dateStyles.layout}>
              <CalendarPanel />
              <DateTimePickerTimePanel
                value={draft ?? nextQuarterHour(now(zone))}
                onChange={(next) => setDraft(constrain(next))}
                onConfirm={confirm}
                onCancel={cancel}
                offset={offset}
                minValue={minValue}
              />
            </div>
          </Dialog>
        </Popover>
      </DatePicker>
    </I18nProvider>
  );
}

type TimeStepper = {
  /** Names of the up and down buttons («Время: на 5 минут позже» / «раньше»). */
  incrementLabel: string;
  decrementLabel: string;
  /** Minutes added or removed per press; the hour wraps around midnight. Default 5. */
  stepMinutes?: number;
};

type TimeProps = {
  label: string;
  value: Time | null;
  onChange: (value: Time | null) => void;
  description?: string;
  errorMessage?: string;
  isDisabled?: boolean;
  /** Keeps the label for assistive technology only (the section heading already names the field). */
  hideLabel?: boolean;
  /** Icon at the end of the segments (a clock). */
  icon?: IconName;
  /** Stacked up/down buttons at the end of the field; the arrow keys on the segments work either way. */
  stepper?: TimeStepper;
};

/** Time of day, 24 h, minutes. */
export function TimeField({
  label,
  value,
  onChange,
  description,
  errorMessage,
  isDisabled,
  hideLabel = false,
  icon,
  stepper
}: TimeProps) {
  const step = (direction: 1 | -1) => {
    const base = value ?? new TimeValue(12, 0);
    onChange(base.add({ minutes: direction * (stepper?.stepMinutes ?? 5) }));
  };
  return (
    <I18nProvider locale={LOCALE}>
      <AriaTimeField
        value={value}
        onChange={onChange}
        hourCycle={24}
        granularity="minute"
        isDisabled={isDisabled}
        isInvalid={Boolean(errorMessage)}
        shouldForceLeadingZeros
        className={styles.field}
      >
        <Label className={hideLabel ? dateStyles.screenReaderOnly : styles.label}>{label}</Label>
        {icon || stepper ? (
          <Group
            isDisabled={isDisabled}
            isInvalid={Boolean(errorMessage)}
            className={`${styles.input} ${dateStyles.timeBox}`}
          >
            <DateInput className={dateStyles.input}>
              {(segment) => <DateSegment segment={segment} className={dateStyles.segment} />}
            </DateInput>
            {icon ? <Icon name={icon} size={18} className={dateStyles.fieldIcon} /> : null}
            {stepper ? (
              <span className={dateStyles.stepper}>
                <Button
                  aria-label={stepper.incrementLabel}
                  isDisabled={isDisabled}
                  className={dateStyles.stepButton}
                  onPress={() => step(1)}
                >
                  <Icon name="chevron-up" size={14} strokeWidth={2.25} />
                </Button>
                <Button
                  aria-label={stepper.decrementLabel}
                  isDisabled={isDisabled}
                  className={dateStyles.stepButton}
                  onPress={() => step(-1)}
                >
                  <Icon name="chevron-down" size={14} strokeWidth={2.25} />
                </Button>
              </span>
            ) : null}
          </Group>
        ) : (
          <DateInput className={`${styles.input} ${dateStyles.input}`}>
            {(segment) => <DateSegment segment={segment} className={dateStyles.segment} />}
          </DateInput>
        )}
        {description ? (
          <Text slot="description" className={styles.description}>
            {description}
          </Text>
        ) : null}
        <FieldError className={styles.error}>{errorMessage}</FieldError>
      </AriaTimeField>
    </I18nProvider>
  );
}
