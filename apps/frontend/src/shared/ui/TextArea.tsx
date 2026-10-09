import { useState, type CSSProperties, type ReactNode } from 'react';
import { FieldError, Label, Text, TextArea as AriaTextArea, TextField as AriaTextField } from 'react-aria-components';
import { ru } from '../lib/ru';
import styles from './Field.module.css';
import { LabelRow, LimitCounter } from './FieldCounter';
import areaStyles from './TextArea.module.css';
import type { TextFieldComponentProps } from './TextField';

type Props = TextFieldComponentProps & {
  rows?: number;
  /** Minimum height in text lines (default is a 7 rem box). Phone editors use 2. */
  minRows?: number;
  /** Where the «n / limit» counter sits: under the field (default) or right-aligned on the label row. */
  limitPlacement?: 'footer' | 'label';
  /** Controls inside the field box above the text, separated by a hairline (rich-text toolbar). Keep its own accessible name. */
  toolbar?: ReactNode;
  /** `lg`: 17 px editor text on a 26 px line pitch (post text). Default keeps the form size. */
  textSize?: 'md' | 'lg';
};

export function TextArea({
  label,
  description,
  errorMessage,
  placeholder,
  rows = 5,
  minRows,
  limit,
  limitPlacement = 'footer',
  counter,
  toolbar,
  textSize = 'md',
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
  const onLabel = limit !== undefined && limitPlacement === 'label';
  const inFooter = limit !== undefined && !onLabel;
  const area = (
    <AriaTextArea
      className={`${styles.input} ${areaStyles.area} ${toolbar ? areaStyles.bare : ''}`}
      rows={rows}
      placeholder={placeholder}
      style={minRows !== undefined ? ({ '--area-rows': minRows } as CSSProperties) : undefined}
      data-min-rows={minRows !== undefined || undefined}
      data-text-size={textSize === 'lg' ? 'lg' : undefined}
    />
  );
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
      <LabelRow counter={counter ?? (onLabel ? <LimitCounter length={current.length} limit={limit} /> : undefined)}>
        <Label className={styles.label}>{label}</Label>
      </LabelRow>
      {toolbar ? (
        <div className={areaStyles.box}>
          <div className={areaStyles.toolbar}>{toolbar}</div>
          {area}
        </div>
      ) : (
        area
      )}
      {description || inFooter ? (
        <Text slot="description" className={styles.description}>
          <span>{description}</span>
          {inFooter ? (
            <span className={`mono ${over > 0 ? areaStyles.over : ''}`}>{ru.ui.counter(current.length, limit)}</span>
          ) : null}
        </Text>
      ) : null}
      <FieldError className={styles.error}>{message}</FieldError>
    </AriaTextField>
  );
}
