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

type GroupProps = Omit<RadioGroupProps, 'children' | 'className'> & {
  label: string;
  description?: string;
  errorMessage?: string;
  /** `card` draws each option as a selectable card with room for a description. */
  variant?: 'default' | 'card';
  children: ReactNode;
};

export function RadioGroup({
  label,
  description,
  errorMessage,
  variant = 'default',
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
      <Label className={styles.label}>{label}</Label>
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
