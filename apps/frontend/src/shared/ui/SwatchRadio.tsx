import type { ReactNode } from 'react';
import {
  Label,
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
  Text,
  type RadioGroupProps,
  type RadioProps
} from 'react-aria-components';
import { Icon } from './Icon';
import styles from './SwatchRadio.module.css';
import { VisuallyHidden } from './VisuallyHidden';

type GroupProps = Omit<RadioGroupProps, 'children' | 'className' | 'orientation'> & {
  label: string;
  description?: string;
  children: ReactNode;
};

/** A compact row of colour swatches (one radio group). Arrow keys move the selection, as in any radio group. */
export function SwatchRadioGroup({ label, description, children, ...rest }: GroupProps) {
  return (
    <AriaRadioGroup {...rest} orientation="horizontal" className={styles.group}>
      <Label className={styles.label}>{label}</Label>
      {description ? (
        <Text slot="description" className={styles.description}>
          {description}
        </Text>
      ) : null}
      <div className={styles.options}>{children}</div>
    </AriaRadioGroup>
  );
}

type Props = Omit<RadioProps, 'children' | 'className' | 'aria-label'> & {
  /** The colour name: the accessible label and the native tooltip. */
  name: string;
  /** Any CSS colour. */
  color: string;
};

export function SwatchRadio({ name, color, ...rest }: Props) {
  return (
    <AriaRadio {...rest} className={styles.swatch} data-name={name}>
      <span className={styles.disc} style={{ background: color }} aria-hidden="true" title={name}>
        <span className={styles.mark}>
          <Icon name="check" size={12} />
        </span>
      </span>
      <VisuallyHidden>{name}</VisuallyHidden>
    </AriaRadio>
  );
}
