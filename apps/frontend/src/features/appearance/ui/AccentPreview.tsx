import { ru } from '../../../shared/lib/ru';
import { Button, Icon, Sparkline, StatusBadge } from '../../../shared/ui';
import type { ThemeName } from '../model/appearance-value';
import styles from './AccentPreview.module.css';
import { ThemeScope, type AccentSource } from './ThemeScope';

type Props = { theme: ThemeName; accent: AccentSource };

const TREND = [4, 6, 5, 9, 8, 12, 11, 15] as const;

/** A small sample of the real components in one theme and accent. Inert: it only shows, never acts. */
export function AccentPreview({ theme, accent }: Props) {
  const label = theme === 'light' ? ru.appearance.previewLight : ru.appearance.previewDark;
  return (
    <ThemeScope theme={theme} accent={accent} className={styles.preview}>
      <fieldset className={styles.inner} aria-label={`${ru.appearance.previewLabel}: ${label}`} inert>
        <div className={styles.nav}>
          <span className={styles.item} aria-current="page">
            <Icon name="home" size={18} />
            {ru.appearance.previewNavSelected}
          </span>
          <span className={styles.item}>
            <Icon name="calendar" size={18} />
            {ru.appearance.previewNavOther}
          </span>
        </div>
        <div className={styles.row}>
          <Button size="sm">{ru.appearance.previewPrimary}</Button>
          <Button size="sm" variant="secondary">
            {ru.appearance.previewSecondary}
          </Button>
          <Sparkline points={TREND} />
        </div>
        <div className={styles.row}>
          <StatusBadge status="scheduled" />
          <StatusBadge status="sent" />
          <StatusBadge status="unknown" />
          <StatusBadge status="failed" />
        </div>
      </fieldset>
    </ThemeScope>
  );
}
