import { FieldError, Input, Label, Text, TextField as AriaTextField, type TextFieldProps } from 'react-aria-components';
import styles from './Field.module.css';

export type TextFieldComponentProps = Omit<TextFieldProps, 'children' | 'className'> & {
  label: string;
  description?: string;
  /** A message shows the field as invalid; the text is the non-colour signal. */
  errorMessage?: string;
  placeholder?: string;
};

export function TextField({
  label,
  description,
  errorMessage,
  placeholder,
  isInvalid,
  isRequired,
  ...rest
}: TextFieldComponentProps) {
  return (
    <AriaTextField
      {...rest}
      isRequired={isRequired}
      isInvalid={isInvalid || Boolean(errorMessage)}
      className={styles.field}
    >
      <Label className={styles.label}>{label}</Label>
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
