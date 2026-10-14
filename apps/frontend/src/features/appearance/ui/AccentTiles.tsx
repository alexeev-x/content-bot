import { Radio, RadioGroup } from 'react-aria-components';
import type { AccentChoice, AccentId } from '../../../shared/lib/color';
import { ru } from '../../../shared/lib/ru';
import { Icon } from '../../../shared/ui';
import type { ThemeName } from '../model/appearance-value';
import styles from './AccentTiles.module.css';

type Props = {
  ids: readonly AccentId[];
  /** The theme on screen: each tile is scoped to it so its colour is the real token value. */
  theme: ThemeName;
  value: AccentChoice;
  onChange: (id: AccentChoice) => void;
};

const asAccent = (ids: readonly AccentId[], raw: string): AccentChoice | undefined =>
  raw === 'custom' ? 'custom' : ids.find((id) => id === raw);

export function AccentTiles({ ids, theme, value, onChange }: Props) {
  return (
    <RadioGroup
      aria-label={ru.appearance.accentLabel}
      orientation="horizontal"
      value={value}
      onChange={(raw) => {
        const id = asAccent(ids, raw);
        if (id) onChange(id);
      }}
      className={styles.group}
    >
      {ids.map((id) => (
        <Radio key={id} value={id} className={styles.tile} data-theme={theme} data-accent={id}>
          <span className={styles.disc} aria-hidden="true">
            <Icon name="check" size={18} className={styles.mark} />
          </span>
          <span className={styles.name}>{ru.appearance.accents[id]}</span>
        </Radio>
      ))}
      <Radio value="custom" className={styles.tile} data-theme={theme} data-accent="custom">
        <span className={styles.disc} aria-hidden="true">
          <Icon name="check" size={18} className={styles.mark} />
        </span>
        <span className={styles.name}>{ru.appearance.accents.custom}</span>
      </Radio>
    </RadioGroup>
  );
}
