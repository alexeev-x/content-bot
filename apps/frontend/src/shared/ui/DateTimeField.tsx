import { getLocalTimeZone, now, type Time, type ZonedDateTime } from '@internationalized/date';
import {
  Button,
  Calendar,
  CalendarCell,
  CalendarGrid,
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
  const offset = (value ?? now(timeZone || getLocalTimeZone())).offset;
  return (
    <I18nProvider locale={LOCALE}>
      <DatePicker
        value={value}
        onChange={onChange}
        granularity="minute"
        hourCycle={24}
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
        <Text slot="description" className={styles.description}>
          <span>
            {ru.ui.timeZone(timeZone, offsetLabel(offset))}
            {description ? ` · ${description}` : ''}
          </span>
          {value ? <span className="mono">{ru.ui.utcHint(utcText(value))}</span> : null}
        </Text>
        <FieldError className={styles.error}>{errorMessage}</FieldError>
        <Popover className={dateStyles.popover} offset={8}>
          <Dialog className={dateStyles.dialog}>
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
