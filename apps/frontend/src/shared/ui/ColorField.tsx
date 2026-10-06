import { useState } from 'react';
import { FieldError, Input, Label, Text, TextField } from 'react-aria-components';
import { parseHex } from '../lib/color';
import { ru } from '../lib/ru';
import styles from './Field.module.css';
import colorStyles from './ColorField.module.css';

type Props = {
  label: string;
  /** `#rrggbb` */
  value: string;
  /** Called only with a valid, lower-case `#rrggbb`. */
  onChange: (hex: string) => void;
  description?: string;
  errorMessage?: string;
  isDisabled?: boolean;
};

/** Accepts `#rrggbb` with or without the hash; null otherwise. */
function normalize(raw: string): string | null {
  const text = raw.trim();
  const withHash = text.startsWith('#') ? text : `#${text}`;
  return parseHex(withHash) ? withHash.toLowerCase() : null;
}

/** Hex text input + native colour picker; the picker button is the swatch of the last valid colour. */
export function ColorField({ label, value, onChange, description, errorMessage, isDisabled }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? value;
  const invalid = draft !== null && normalize(draft) === null;
  const message = errorMessage ?? (invalid ? ru.ui.invalidHex : undefined);

  return (
    <TextField
      className={styles.field}
      value={text}
      isDisabled={isDisabled}
      isInvalid={Boolean(message)}
      onChange={(next) => {
        const hex = normalize(next);
        if (hex) {
          setDraft(null);
          onChange(hex);
        } else {
          setDraft(next);
        }
      }}
      onBlur={() => setDraft(null)}
    >
      <Label className={styles.label}>{label}</Label>
      <div className={colorStyles.row}>
        <input
          type="color"
          className={colorStyles.picker}
          value={value}
          disabled={isDisabled}
          aria-label={`${label}: ${ru.ui.pickColor}`}
          onChange={(event) => {
            setDraft(null);
            onChange(event.target.value.toLowerCase());
          }}
        />
        <Input className={`${styles.input} mono`} spellCheck={false} autoCapitalize="off" maxLength={7} />
      </div>
      {description ? (
        <Text slot="description" className={styles.description}>
          {description}
        </Text>
      ) : null}
      <FieldError className={styles.error}>{message}</FieldError>
    </TextField>
  );
}
