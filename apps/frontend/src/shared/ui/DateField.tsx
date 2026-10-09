import { DateFormatter, type CalendarDate } from '@internationalized/date';
import {
  Button,
  DatePicker,
  Dialog,
  FieldError,
  Group,
  I18nProvider,
  Label,
  Popover,
  Text
} from 'react-aria-components';
import { ru } from '../lib/ru';
import { CalendarPanel } from './DateTimeField';
import { Icon } from './Icon';
import styles from './Field.module.css';
import dateStyles from './DateTimeField.module.css';

const LOCALE = 'ru-RU';
const SHORT = new DateFormatter(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

type Props = {
  label: string;
  value: CalendarDate | null;
  onChange: (value: CalendarDate | null) => void;
  minValue?: CalendarDate;
  description?: string;
  errorMessage?: string;
  isDisabled?: boolean;
  /** Keeps the label for assistive technology only (the section heading already names the field). */
  hideLabel?: boolean;
};

/** Date without a time («8 окт. 2026») with a calendar popover; pairs with TimeField in the schedule row. */
export function DateField({
  label,
  value,
  onChange,
  minValue,
  description,
  errorMessage,
  isDisabled,
  hideLabel = false
}: Props) {
  const text = value ? SHORT.format(value.toDate('UTC')).replace(/\s?г\.$/, '') : ru.ui.selectDateTime;
  return (
    <I18nProvider locale={LOCALE}>
      <DatePicker
        value={value}
        onChange={onChange}
        granularity="day"
        minValue={minValue}
        isDisabled={isDisabled}
        isInvalid={Boolean(errorMessage)}
        className={styles.field}
      >
        <Label className={hideLabel ? dateStyles.screenReaderOnly : styles.label}>{label}</Label>
        <Group className={`${styles.input} ${dateStyles.group}`}>
          <Button className={dateStyles.fieldButton} aria-label={`${ru.ui.openCalendar}: ${label}, ${text}`}>
            <span>{text}</span>
            <Icon name="calendar" size={18} className={dateStyles.fieldIcon} />
          </Button>
        </Group>
        {description ? (
          <Text slot="description" className={styles.description}>
            {description}
          </Text>
        ) : null}
        <FieldError className={styles.error}>{errorMessage}</FieldError>
        <Popover className={`${dateStyles.popover} ${dateStyles.popoverDate}`} placement="bottom start" offset={8}>
          <Dialog className={dateStyles.dialog}>
            <CalendarPanel />
          </Dialog>
        </Popover>
      </DatePicker>
    </I18nProvider>
  );
}
