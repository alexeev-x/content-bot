import type { ThemeName } from '../model/appearance-value';
import styles from './AccentSwatch.module.css';
import { ThemeScope, type AccentSource } from './ThemeScope';

type Props = { theme: ThemeName; accent: AccentSource };

/** Decorative dot in the accent of the given theme; the option or row next to it carries the name. */
export function AccentSwatch({ theme, accent }: Props) {
  return <ThemeScope as="span" theme={theme} accent={accent} className={styles.dot} />;
}
