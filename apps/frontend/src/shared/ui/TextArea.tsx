import { useState } from 'react';
import { FieldError, Label, Text, TextArea as AriaTextArea, TextField as AriaTextField } from 'react-aria-components';
import { ru } from '../lib/ru';
import styles from './Field.module.css';
import areaStyles from './TextArea.module.css';
import type { TextFieldComponentProps } from './TextField';

type Props = TextFieldComponentProps & {
  rows?: number;
  /** Shows «n / limit» and marks the field invalid past the limit. The text is never truncated. */
  limit?: number;
};

export function TextArea({
  label,
  description,
  errorMessage,
  placeholder,
  rows = 5,
  limit,
  isInvalid,
  value,
  defaultValue,
  onChange,
  ...rest
}: Props) {
  const [inner, setInner] = useState(defaultValue ?? '');
  const current = value ?? inner;
  const over = limit !== undefined ? current.length - limit : 0;
  const message = errorMessage ?? (over > 0 ? ru.ui.overLimit(over) : undefined);
  return (
    <AriaTextField
      {...rest}
      value={current}
      onChange={(next) => {
        setInner(next);
        onChange?.(next);
      }}
      isInvalid={isInvalid || Boolean(message)}
      className={styles.field}
    >
      <Label className={styles.label}>{label}</Label>
      <AriaTextArea className={`${styles.input} ${areaStyles.area}`} rows={rows} placeholder={placeholder} />
      {description || limit !== undefined ? (
        <Text slot="description" className={styles.description}>
          <span>{description}</span>
          {limit !== undefined ? (
            <span className={`mono ${over > 0 ? areaStyles.over : ''}`}>{ru.ui.counter(current.length, limit)}</span>
          ) : null}
        </Text>
      ) : null}
      <FieldError className={styles.error}>{message}</FieldError>
    </AriaTextField>
  );
}
