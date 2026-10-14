import type { ReactNode } from 'react';
import {
  FieldError,
  Label,
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
  Text,
  type RadioGroupProps,
  type RadioProps
} from 'react-aria-components';
import styles from './RadioGroup.module.css';
import { VisuallyHidden } from './VisuallyHidden';

type GroupProps = Omit<RadioGroupProps, 'children' | 'className'> & {
  label: string;
  description?: string;
  errorMessage?: string;
  /**
   * `card` draws each option as a selectable card with room for a description.
   * `rows` is a compact list: the selected row is outlined in accent, the others sit on hairline dividers.
   */
  variant?: 'default' | 'card' | 'rows';
  /** Keeps the label for screen readers only, when a visible heading (a sheet title) already names the choice. */
  labelHidden?: boolean;
  children: ReactNode;
};

export function RadioGroup({
  label,
  description,
  errorMessage,
  variant = 'default',
  labelHidden = false,
  isInvalid,
  children,
  ...rest
}: GroupProps) {
  return (
    <AriaRadioGroup
      {...rest}
      isInvalid={isInvalid || Boolean(errorMessage)}
      data-variant={variant}
      className={styles.group}
    >
      {labelHidden ? (
        <VisuallyHidden>
          <Label>{label}</Label>
        </VisuallyHidden>
      ) : (
        <Label className={styles.label}>{label}</Label>
      )}
      {description ? (
        <Text slot="description" className={styles.description}>
          {description}
        </Text>
      ) : null}
      <div className={styles.options}>{children}</div>
      <FieldError className={styles.error}>{errorMessage}</FieldError>
    </AriaRadioGroup>
  );
}

type Props = Omit<RadioProps, 'children' | 'className'> & { children: ReactNode; description?: string };

export function Radio({ children, description, ...rest }: Props) {
  return (
    <AriaRadio {...rest} className={styles.radio}>
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.text}>
        {children}
        {description ? <span className={styles.optionDescription}>{description}</span> : null}
      </span>
    </AriaRadio>
  );
}
