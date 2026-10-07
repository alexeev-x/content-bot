import {
  DateFormatter,
  getLocalTimeZone,
  now,
  Time,
  toTime,
  toZoned,
  type ZonedDateTime
} from '@internationalized/date';
import {
  Button,
  Calendar,
  CalendarCell,
  CalendarGrid,
  DateInput,
  ButtonContext,
  DatePicker,
  DatePickerStateContext,
  DateSegment,
  Dialog,
  FieldError,
  Group,
  Heading,
  I18nProvider,
  Label,
  Popover,
  Provider,
  Text,
  TimeField as AriaTimeField
} from 'react-aria-components';
import { useContext, useEffect } from 'react';
import { ru } from '../lib/ru';
import styles from './Field.module.css';
import dateStyles from './DateTimeField.module.css';
import { Icon } from './Icon';

const LOCALE = 'ru-RU';

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

const QUICK_MINUTES = [0, 15, 30, 45];
const DAY_MONTH = new DateFormatter(LOCALE, { day: 'numeric', month: 'long' });

/** Next quarter hour strictly after `from`, so a fresh value is round and never already past. */
function defaultTime(from: ZonedDateTime): Time {
  const t = toTime(from);
  const total = t.hour * 60 + t.minute + 1;
  const rounded = Math.ceil(total / 15) * 15;
  return new Time(Math.floor(rounded / 60) % 24, rounded % 60);
}

type TimePanelProps = { timeZone: string; minValue: ZonedDateTime | undefined; offset: string };

/** Touch-first time entry inside the popover: large typed field, ±1 h / ±5 min steppers, quarter-hour chips. */
function TimePanel({ timeZone, minValue, offset }: TimePanelProps) {
  const state = useContext(DatePickerStateContext);
  const raw = state?.timeValue;
  const time = raw ? new Time(raw.hour, raw.minute) : null;
  useEffect(() => {
    // Seed the time once on open: choosing a date alone never commits a value without a time.
    if (state && !state.timeValue) {
      const base = minValue ?? now(timeZone || getLocalTimeZone());
      state.setTimeValue(defaultTime(base));
    }
  }, [state, minValue, timeZone]);
  if (!state) return null;
  const zone = timeZone || getLocalTimeZone();
  // The bottom sheet covers the field, so the picked value is repeated here in one line.
  const picked =
    state.dateValue && time
      ? `${DAY_MONTH.format(state.dateValue.toDate(zone))}, ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')} (${offset})`
      : null;
  const step = (field: 'hour' | 'minute', amount: number) => {
    const base = time ?? defaultTime(minValue ?? now(timeZone || getLocalTimeZone()));
    state.setTimeValue(base.cycle(field, amount, { hourCycle: 24 }));
  };
  const setMinute = (minute: number) => {
    const base = time ?? defaultTime(minValue ?? now(timeZone || getLocalTimeZone()));
    state.setTimeValue(base.set({ minute }));
  };
  return (
    <Provider values={[[ButtonContext, {}]]}>
      <section className={dateStyles.time} aria-label={ru.ui.timeSection}>
        <AriaTimeField
          value={time}
          onChange={(next) => {
            if (next) state.setTimeValue(next);
          }}
          hourCycle={24}
          granularity="minute"
          shouldForceLeadingZeros
          className={dateStyles.timeField}
        >
          <Label className={dateStyles.timeLabel}>{ru.ui.timeSection}</Label>
          <DateInput className={dateStyles.timeInput}>
            {(segment) => <DateSegment segment={segment} className={dateStyles.timeSegment} />}
          </DateInput>
        </AriaTimeField>
        <div className={dateStyles.steppers}>
          <fieldset className={dateStyles.stepper} aria-label={ru.ui.hours}>
            <Button className={dateStyles.step} aria-label={ru.ui.hourMinus} onPress={() => step('hour', -1)}>
              −
            </Button>
            <span className={dateStyles.stepLabel} aria-hidden="true">
              {ru.ui.hoursShort}
            </span>
            <Button className={dateStyles.step} aria-label={ru.ui.hourPlus} onPress={() => step('hour', 1)}>
              +
            </Button>
          </fieldset>
          <fieldset className={dateStyles.stepper} aria-label={ru.ui.minutes}>
            <Button className={dateStyles.step} aria-label={ru.ui.minuteMinus} onPress={() => step('minute', -5)}>
              −
            </Button>
            <span className={dateStyles.stepLabel} aria-hidden="true">
              {ru.ui.minutesShort}
            </span>
            <Button className={dateStyles.step} aria-label={ru.ui.minutePlus} onPress={() => step('minute', 5)}>
              +
            </Button>
          </fieldset>
        </div>
        <fieldset className={dateStyles.quick} aria-label={ru.ui.quickMinutes}>
          {QUICK_MINUTES.map((minute) => (
            <Button
              key={minute}
              className={dateStyles.chip}
              aria-label={ru.ui.setMinutes(minute)}
              data-selected={time?.minute === minute ? true : undefined}
              onPress={() => setMinute(minute)}
            >
              {`:${String(minute).padStart(2, '0')}`}
            </Button>
          ))}
        </fieldset>
        <div className={dateStyles.footer}>
          <output className={dateStyles.picked} aria-live="polite">
            {picked ? ru.ui.pickedValue(picked) : ''}
          </output>
          <Button className={dateStyles.done} onPress={() => state.setOpen(false)}>
            {ru.ui.done}
          </Button>
        </div>
      </section>
    </Provider>
  );
}

function CalendarPanel() {
  return (
    <Calendar className={dateStyles.calendar}>
      <header className={dateStyles.calendarHeader}>
        <Button slot="previous" className={dateStyles.nav}>
          <Icon name="chevron-left" size={18} />
        </Button>
        <Heading className={dateStyles.month} />
        <Button slot="next" className={dateStyles.nav}>
          <Icon name="chevron-right" size={18} />
        </Button>
      </header>
      <CalendarGrid className={dateStyles.grid}>
        {(date) => <CalendarCell date={date} className={dateStyles.cell} />}
      </CalendarGrid>
    </Calendar>
  );
}

type Props = {
  label: string;
  value: ZonedDateTime | null;
  onChange: (value: ZonedDateTime | null) => void;
  /** IANA zone the owner schedules in; shown as the explicit label «Часовой пояс: Europe/Moscow (UTC+3)». */
  timeZone: string;
  description?: string;
  errorMessage?: string;
  isDisabled?: boolean;
  isRequired?: boolean;
  /** Earliest allowed value, so the calendar greys out the past. */
  minValue?: ZonedDateTime;
};

/** Date + time (minute granularity, 24 h) in an explicit zone. Storage stays UTC; the UTC value is shown as a hint. */
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
  const offset = (value ?? now(zone)).offset;
  return (
    <I18nProvider locale={LOCALE}>
      <DatePicker
        value={value}
        onChange={(next) => {
          // An empty picker commits a zone-less CalendarDateTime; pin it to the schedule zone.
          if (next === null) onChange(null);
          else if ('timeZone' in next) onChange(next);
          else onChange(toZoned(next, zone));
        }}
        granularity="minute"
        hourCycle={24}
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
        <Group className={`${styles.input} ${dateStyles.group}`}>
          <DateInput className={dateStyles.input}>
            {(segment) => <DateSegment segment={segment} className={dateStyles.segment} />}
          </DateInput>
          <Button className={dateStyles.trigger}>
            <Icon name="calendar" size={18} />
          </Button>
        </Group>
        <Text slot="description" className={`${styles.description} ${dateStyles.description}`}>
          <span>
            {ru.ui.timeZone(timeZone, offsetLabel(offset))}
            {description ? ` · ${description}` : ''}
          </span>
          {value ? <span className="mono">{ru.ui.utcHint(utcText(value))}</span> : null}
        </Text>
        <FieldError className={styles.error}>{errorMessage}</FieldError>
        <Popover className={dateStyles.popover} offset={8}>
          <Dialog className={dateStyles.dialog}>
            {/* Calendar and time side by side on desktop, stacked in the phone's bottom sheet. */}
            <div className={dateStyles.layout}>
              <CalendarPanel />
              <TimePanel timeZone={timeZone} minValue={minValue} offset={offsetLabel(offset)} />
            </div>
          </Dialog>
        </Popover>
      </DatePicker>
    </I18nProvider>
  );
}

type TimeProps = {
  label: string;
  value: Time | null;
  onChange: (value: Time | null) => void;
  description?: string;
  errorMessage?: string;
  isDisabled?: boolean;
};

/** Time of day, 24 h, minutes. */
export function TimeField({ label, value, onChange, description, errorMessage, isDisabled }: TimeProps) {
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
        <Label className={styles.label}>{label}</Label>
        <DateInput className={`${styles.input} ${dateStyles.input}`}>
          {(segment) => <DateSegment segment={segment} className={dateStyles.segment} />}
        </DateInput>
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
