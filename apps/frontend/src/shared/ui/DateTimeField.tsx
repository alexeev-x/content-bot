import {
  DateFormatter,
  CalendarDateTime,
  getLocalTimeZone,
  now,
  Time as TimeValue,
  ZonedDateTime,
  type Time
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
import { useContext, useId, useState } from 'react';
import { nextQuarterHour } from '../lib/next-quarter-hour';
import { ru } from '../lib/ru';
import { DateTimePickerTimePanel } from './DateTimePickerTimePanel';
import { Icon, type IconName } from './Icon';
import styles from './Field.module.css';
import dateStyles from './DateTimeField.module.css';
import { localDateTime, resolveLocalTime } from './date-time-resolution';

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

function PickerGroup({ label, value, offset }: { label: string; value: CalendarDateTime | null; offset: string }) {
  const date = value
    ? new DateFormatter(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(
        value.toDate('UTC')
      )
    : null;
  const time = value ? `${String(value.hour).padStart(2, '0')}:${String(value.minute).padStart(2, '0')}` : null;
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
  const dstRadioName = useId();
  const [draft, setDraft] = useState<CalendarDateTime | null>(null);
  const [foldChoice, setFoldChoice] = useState<'first' | 'second' | null>(null);
  const shown = isOpen ? draft : value ? localDateTime(value) : null;
  const defaultLocal = localDateTime(value ?? nextQuarterHour(now(zone)));
  const working = shown ?? defaultLocal;
  const resolution = resolveLocalTime(working, zone);
  const selectedCandidate =
    resolution.kind === 'unique'
      ? resolution.candidates[0]
      : resolution.kind === 'fold'
        ? foldChoice === 'first'
          ? resolution.candidates[0]
          : foldChoice === 'second'
            ? resolution.candidates[1]
            : null
        : null;
  const offset = selectedCandidate
    ? offsetLabel(selectedCandidate.offset)
    : resolution.kind === 'fold'
      ? 'UTC?'
      : offsetLabel(now(zone).offset);
  const lowerBound = minValue && minValue.toDate().getTime() > now(zone).toDate().getTime() ? minValue : now(zone);
  const isConfirmDisabled = !selectedCandidate || selectedCandidate.toDate().getTime() <= lowerBound.toDate().getTime();

  function constrainLocal(local: CalendarDateTime): CalendarDateTime {
    const result = resolveLocalTime(local, zone);
    if (result.kind !== 'unique' || result.candidates[0].toDate().getTime() > lowerBound.toDate().getTime())
      return local;
    return localDateTime(nextQuarterHour(lowerBound));
  }

  function confirm(candidate?: CalendarDateTime) {
    const local = candidate ?? draft ?? defaultLocal;
    const result = resolveLocalTime(local, zone);
    if (result.kind === 'gap') return;
    if (result.kind === 'fold' && foldChoice === null) return;
    const chosen = result.kind === 'unique' ? result.candidates[0] : result.candidates[foldChoice === 'second' ? 1 : 0];
    if (!chosen) return;
    const current = now(zone);
    const confirmLowerBound = minValue && minValue.toDate().getTime() > current.toDate().getTime() ? minValue : current;
    if (chosen.toDate().getTime() <= confirmLowerBound.toDate().getTime()) return;
    onChange(chosen);
    setIsOpen(false);
    setDraft(null);
    setFoldChoice(null);
  }

  function cancel() {
    setIsOpen(false);
    setDraft(null);
    setFoldChoice(null);
  }

  return (
    <I18nProvider locale={LOCALE}>
      <DatePicker
        value={shown}
        onChange={(next) => {
          const local = next === null ? null : next instanceof ZonedDateTime ? localDateTime(next) : next;
          if (isOpen && local) {
            setDraft(constrainLocal(local));
            setFoldChoice(null);
          }
        }}
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (open) {
            setDraft(value ? localDateTime(value) : defaultLocal);
            setFoldChoice(null);
            setIsOpen(true);
          } else cancel();
        }}
        granularity="minute"
        hourCycle={24}
        hideTimeZone
        shouldCloseOnSelect={false}
        placeholderValue={defaultLocal}
        minValue={minValue ? localDateTime(minValue) : undefined}
        isDisabled={isDisabled}
        isRequired={isRequired}
        isInvalid={Boolean(errorMessage)}
        shouldForceLeadingZeros
        className={styles.field}
      >
        <Label className={styles.label}>{label}</Label>
        <PickerGroup label={label} value={shown} offset={offset} />
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
                value={working}
                timeZone={zone}
                onChange={(next) => {
                  setDraft(constrainLocal(next));
                  setFoldChoice(null);
                }}
                onConfirm={confirm}
                onCancel={cancel}
                offset={offset}
                minValue={minValue}
                isConfirmDisabled={isConfirmDisabled}
              />
              {resolution.kind === 'gap' ? (
                <p className={dateStyles.dstMessage} role="alert">
                  Этого времени нет из-за перехода на летнее время. Выберите другое время.
                </p>
              ) : null}
              {resolution.kind === 'fold' ? (
                <fieldset className={dateStyles.dstChoice}>
                  <legend>Это время встречается дважды. Выберите вариант.</legend>
                  {resolution.candidates.map((candidate, index) => {
                    const choice = index === 0 ? 'first' : 'second';
                    return (
                      <label key={candidate.toDate().toISOString()}>
                        <input
                          type="radio"
                          name={dstRadioName}
                          value={choice}
                          checked={foldChoice === choice}
                          onChange={() => setFoldChoice(choice)}
                        />
                        {index === 0 ? 'Первое время' : 'Второе время'} — {offsetLabel(candidate.offset)} (
                        {utcText(candidate)})
                      </label>
                    );
                  })}
                </fieldset>
              ) : null}
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
