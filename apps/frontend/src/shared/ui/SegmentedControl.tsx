import { Radio, RadioGroup } from 'react-aria-components';
import { Icon, type IconName } from './Icon';
import styles from './SegmentedControl.module.css';

export type SegmentOption = { id: string; label: string; icon?: IconName; isDisabled?: boolean };

type Props = {
  /** Names the group for assistive technology (it is a radio group: arrows move, Tab leaves). */
  label: string;
  options: readonly SegmentOption[];
  value: string;
  onChange: (id: string) => void;
  fullWidth?: boolean;
  isDisabled?: boolean;
};

export function SegmentedControl({ label, options, value, onChange, fullWidth = false, isDisabled }: Props) {
  return (
    <RadioGroup
      aria-label={label}
      orientation="horizontal"
      value={value}
      onChange={onChange}
      isDisabled={isDisabled}
      data-full={fullWidth || undefined}
      className={styles.group}
    >
      {options.map((option) => (
        <Radio key={option.id} value={option.id} isDisabled={option.isDisabled} className={styles.segment}>
          {option.icon ? <Icon name={option.icon} size={16} /> : null}
          {option.label}
        </Radio>
      ))}
    </RadioGroup>
  );
}
