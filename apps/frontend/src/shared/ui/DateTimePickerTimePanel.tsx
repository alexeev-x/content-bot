import { DateFormatter, type ZonedDateTime } from '@internationalized/date';
import { Button } from 'react-aria-components';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { ru } from '../lib/ru';
import { Icon } from './Icon';
import styles from './DateTimeField.module.css';

const QUICK_MINUTES = [0, 15, 30, 45];

type Unit = 'hour' | 'minute';

type TimeUnitProps = {
  unit: Unit;
  value: number;
  onSelect: (value: number) => void;
  onStep: (direction: 1 | -1) => void;
  onConfirm: (number?: number) => void;
};

function TimeUnit({ unit, value, onSelect, onStep, onConfirm }: TimeUnitProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const max = unit === 'hour' ? 23 : 59;
  const label = unit === 'hour' ? ru.ui.hours : ru.ui.minutes;
  const plusLabel = unit === 'hour' ? ru.ui.hourPlus : ru.ui.minutePlus;
  const minusLabel = unit === 'hour' ? ru.ui.hourMinus : ru.ui.minuteMinus;

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      setEditing(null);
      onStep(event.key === 'ArrowUp' ? 1 : -1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (editing !== null) {
        const typed = Number(editing);
        if (editing.length > 0 && typed <= max) {
          onConfirm(typed);
        }
      } else {
        onConfirm();
      }
    }
  }

  return (
    <div className={styles.timeUnit}>
      <Button className={styles.timeArrow} aria-label={plusLabel} onPress={() => onStep(1)}>
        <Icon name="chevron-up" size={18} />
      </Button>
      <input
        aria-label={label}
        className={styles.timeValue}
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={editing ?? String(value).padStart(2, '0')}
        onFocus={(event) => event.currentTarget.select()}
        onClick={(event) => event.currentTarget.select()}
        onChange={(event) => {
          const typed = event.currentTarget.value;
          if (!/^\d{0,2}$/.test(typed)) return;
          setEditing(typed);
          if (typed.length === 2) {
            if (Number(typed) <= max) onSelect(Number(typed));
            setEditing(null);
          }
        }}
        onBlur={() => {
          if (editing !== null && editing.length > 0 && Number(editing) <= max) onSelect(Number(editing));
          setEditing(null);
        }}
        onKeyDown={handleKeyDown}
      />
      <Button className={styles.timeArrow} aria-label={minusLabel} onPress={() => onStep(-1)}>
        <Icon name="chevron-down" size={18} />
      </Button>
    </div>
  );
}

type Props = {
  value: ZonedDateTime;
  onChange: (value: ZonedDateTime) => void;
  onConfirm: (value?: ZonedDateTime) => void;
  onCancel: () => void;
  offset: string;
  minValue?: ZonedDateTime;
};

export function DateTimePickerTimePanel({ value, onChange, onConfirm, onCancel, offset, minValue }: Props) {
  const [currentInstant, setCurrentInstant] = useState<number | null>(null);
  const earliestInstant = minValue ? Math.max(minValue.toDate().getTime(), currentInstant ?? -Infinity) : null;
  const dateText =
    new DateFormatter('ru-RU', {
      day: 'numeric',
      month: 'long',
      timeZone: value.timeZone
    }).format(value.toDate()) + ` ${value.year}`;

  useEffect(() => {
    if (!minValue) return;
    const timer = setInterval(() => setCurrentInstant(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [minValue]);

  function select(unit: Unit, number: number) {
    onChange(value.set(unit === 'hour' ? { hour: number } : { minute: number }));
  }

  function step(unit: Unit, direction: 1 | -1) {
    onChange(value.add(unit === 'hour' ? { hours: direction } : { minutes: 5 * direction }));
  }

  return (
    <section className={styles.time} aria-label={ru.ui.timeSection}>
      <div className={styles.timeHeader}>
        <span>{ru.ui.timeSection}</span>
        <span className={styles.zone}>{offset}</span>
      </div>
      <div className={styles.clock}>
        <TimeUnit
          unit="hour"
          value={value.hour}
          onSelect={(number) => select('hour', number)}
          onStep={(direction) => step('hour', direction)}
          onConfirm={(number) => onConfirm(number === undefined ? undefined : value.set({ hour: number }))}
        />
        <span className={styles.colon} aria-hidden="true">
          :
        </span>
        <TimeUnit
          unit="minute"
          value={value.minute}
          onSelect={(number) => select('minute', number)}
          onStep={(direction) => step('minute', direction)}
          onConfirm={(number) => onConfirm(number === undefined ? undefined : value.set({ minute: number }))}
        />
      </div>
      <fieldset className={styles.quick} aria-label={ru.ui.quickMinutes}>
        <legend className={styles.quickLabel}>{ru.ui.quickMinutes}</legend>
        {QUICK_MINUTES.map((minute) => (
          <Button
            key={minute}
            className={styles.chip}
            aria-label={ru.ui.setMinutes(minute)}
            data-selected={value.minute === minute || undefined}
            isDisabled={earliestInstant !== null && value.set({ minute }).toDate().getTime() <= earliestInstant}
            onPress={() => select('minute', minute)}
          >
            {`:${String(minute).padStart(2, '0')}`}
          </Button>
        ))}
      </fieldset>
      <div className={styles.footer}>
        <output className={styles.picked} aria-live="polite">
          <Icon name="calendar" size={18} />
          <span>
            <span className={styles.pickedLabel}>{ru.ui.picked}</span>
            <strong>
              {dateText} · {String(value.hour).padStart(2, '0')}:{String(value.minute).padStart(2, '0')}
            </strong>
            <span className={styles.zone}>{offset}</span>
          </span>
        </output>
        <div className={styles.actions}>
          <Button className={styles.cancel} onPress={onCancel}>
            {ru.ui.cancel}
          </Button>
          <Button className={styles.done} onPress={() => onConfirm()}>
            {ru.ui.done}
          </Button>
        </div>
      </div>
    </section>
  );
}
