import type { ThemeMode } from '@alexeev/contracts';
import { Radio, RadioGroup } from 'react-aria-components';
import { ru } from '../../../shared/lib/ru';
import styles from './ThemeTiles.module.css';

type Props = { value: ThemeMode; onChange: (mode: ThemeMode) => void };

const MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];

/** A tiny window drawn with the tokens of the theme it stands for; the accent shown is the current one. */
function Sketch({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <span className={styles.sketch} data-theme={theme}>
      <span className={styles.side}>
        <span className={styles.navOn} />
        <span className={styles.navOff} />
        <span className={styles.navOff} />
      </span>
      <span className={styles.main}>
        <span className={styles.lineWide} />
        <span className={styles.lineNarrow} />
        <span className={styles.button} />
      </span>
    </span>
  );
}

const isMode = (raw: string): raw is ThemeMode => MODES.some((mode) => mode === raw);

export function ThemeTiles({ value, onChange }: Props) {
  return (
    <RadioGroup
      aria-label={ru.appearance.themeLabel}
      orientation="horizontal"
      value={value}
      onChange={(raw) => {
        if (isMode(raw)) onChange(raw);
      }}
      className={styles.group}
    >
      {MODES.map((mode) => (
        <Radio key={mode} value={mode} className={styles.tile}>
          <span className={styles.art} aria-hidden="true">
            {mode === 'system' ? (
              <>
                <Sketch theme="light" />
                <span className={styles.half}>
                  <Sketch theme="dark" />
                </span>
              </>
            ) : (
              <Sketch theme={mode} />
            )}
          </span>
          <span className={styles.name}>{ru.appearance.themes[mode]}</span>
        </Radio>
      ))}
    </RadioGroup>
  );
}
