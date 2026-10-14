import { Radio, RadioGroup } from 'react-aria-components';
import type { AccentChoice, AccentId } from '../../../shared/lib/color';
import { ru } from '../../../shared/lib/ru';
import { Icon } from '../../../shared/ui';
import type { ThemeName } from '../model/appearance-value';
import styles from './ThemeCards.module.css';

type Props = {
  ids: readonly AccentId[];
  /** The mode on screen: every card is drawn in it with its own theme's tokens. */
  theme: ThemeName;
  value: AccentChoice;
  onChange: (id: AccentChoice) => void;
};

/** A small picture of the studio in one theme: menu strip, a card with a status and the main button. */
function Miniature() {
  return (
    <span className={styles.mini} aria-hidden="true">
      <span className={styles.side}>
        <span className={styles.navOn} />
        <span className={styles.nav} />
        <span className={styles.nav} />
      </span>
      <span className={styles.main}>
        <span className={styles.panel}>
          <span className={styles.lineStrong} />
          <span className={styles.line} />
          <span className={styles.chip} />
        </span>
        <span className={styles.button} />
      </span>
    </span>
  );
}

export function ThemeCards({ ids, theme, value, onChange }: Props) {
  const all: AccentChoice[] = [...ids, 'custom'];
  return (
    <RadioGroup
      aria-label={ru.appearance.accentLabel}
      orientation="horizontal"
      value={value}
      onChange={(raw) => {
        const id = all.find((candidate) => candidate === raw);
        if (id) onChange(id);
      }}
      className={styles.group}
    >
      {all.map((id) => (
        <Radio key={id} value={id} className={styles.card} data-theme={theme} data-accent={id}>
          <Miniature />
          <span className={styles.caption}>
            <span className={styles.text}>
              <span className={styles.name}>{ru.appearance.accents[id]}</span>
              <span className={styles.hint}>{ru.appearance.accentHints[id]}</span>
            </span>
            <span className={styles.check} aria-hidden="true">
              <Icon name="check" size={14} />
            </span>
          </span>
        </Radio>
      ))}
    </RadioGroup>
  );
}
