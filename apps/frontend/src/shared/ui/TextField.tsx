import { useState, type ReactNode } from 'react';
import { FieldError, Input, Label, Text, TextField as AriaTextField, type TextFieldProps } from 'react-aria-components';
import styles from './Field.module.css';
import { LabelRow, LimitCounter } from './FieldCounter';

export type TextFieldComponentProps = Omit<TextFieldProps, 'children' | 'className'> & {
  label: string;
  description?: string;
  /** A message shows the field as invalid; the text is the non-colour signal. */
  errorMessage?: string;
  placeholder?: string;
  /** Right-aligned slot on the label row (muted, tabular numbers). Announce it yourself if it is live. */
  counter?: ReactNode;
  /** Shows «n / limit» on the label row from the current value; announced politely from 90 % of the limit. Never truncates. */
  limit?: number;
};

export function TextField({
  label,
  description,
  errorMessage,
  placeholder,
  counter,
  limit,
  isInvalid,
  isRequired,
  value,
  defaultValue,
  onChange,
  ...rest
}: TextFieldComponentProps) {
  const [inner, setInner] = useState(defaultValue ?? '');
  const current = value ?? inner;
  return (
    <AriaTextField
      {...rest}
      value={current}
      onChange={(next) => {
        setInner(next);
        onChange?.(next);
      }}
      isRequired={isRequired}
      isInvalid={isInvalid || Boolean(errorMessage)}
      className={styles.field}
    >
      <LabelRow
        counter={counter ?? (limit !== undefined ? <LimitCounter length={current.length} limit={limit} /> : undefined)}
      >
        <Label className={styles.label}>{label}</Label>
      </LabelRow>
      <Input className={styles.input} placeholder={placeholder} />
      {description ? (
        <Text slot="description" className={styles.description}>
          {description}
        </Text>
      ) : null}
      <FieldError className={styles.error}>{errorMessage}</FieldError>
    </AriaTextField>
  );
}
