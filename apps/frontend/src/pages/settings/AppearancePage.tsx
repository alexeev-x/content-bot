import { applyAppearance } from '../../app/theme';
import { AppearanceEditor, type AppearanceValue } from '../../features/appearance';
import { ru } from '../../shared/lib/ru';
import styles from './AppearancePage.module.css';

// Live preview on the real document without touching the stored copy; stable so effects do not re-run.
const preview = (value: AppearanceValue) => applyAppearance(value, { persist: false });

export function AppearancePage() {
  return (
    <div className={styles.page}>
      <p className={styles.lead}>{ru.appearance.description}</p>
      <AppearanceEditor preview={preview} />
    </div>
  );
}
