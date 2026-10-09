import type { CSSProperties } from 'react';
import { Radio, RadioGroup } from 'react-aria-components';
import styles from './RatioTileGroup.module.css';

export type RatioTileOption = {
  id: string;
  /** Full label («Оригинал»). */
  label: string;
  /** Label under 860 px («Ориг.»); the full one is read by assistive technology either way. */
  shortLabel?: string;
  /** Width / height of the little frame drawn above the label (1 = square, 16 / 9 = wide). */
  shape: number;
  isDisabled?: boolean;
};

type Props = {
  /** Names the group («Соотношение сторон»). It is a radio group: arrows move the choice, Tab leaves. */
  label: string;
  options: readonly RatioTileOption[];
  value: string;
  onChange: (id: string) => void;
  isDisabled?: boolean;
};

/** Equal tiles with a ratio shape above the label (crop ratios). The selected tile is outlined and filled in accent. */
export function RatioTileGroup({ label, options, value, onChange, isDisabled }: Props) {
  return (
    <RadioGroup
      aria-label={label}
      orientation="horizontal"
      value={value}
      onChange={onChange}
      isDisabled={isDisabled}
      className={styles.group}
      style={{ '--ratio-count': options.length } as CSSProperties}
    >
      {options.map((option) => (
        <Radio
          key={option.id}
          value={option.id}
          aria-label={option.label}
          isDisabled={option.isDisabled}
          className={styles.tile}
        >
          <span
            className={styles.shape}
            aria-hidden="true"
            style={
              option.shape >= 1 ? { width: 22, aspectRatio: option.shape } : { height: 20, aspectRatio: option.shape }
            }
          />
          <span className={styles.label}>
            <span className={option.shortLabel ? styles.full : undefined}>{option.label}</span>
            {option.shortLabel ? <span className={styles.short}>{option.shortLabel}</span> : null}
          </span>
        </Radio>
      ))}
    </RadioGroup>
  );
}
