import { useState } from 'react';
import { applyAppearance, applyDensity, readDensity, type Density } from '../../app/theme';
import { AppearanceEditor, type AppearanceValue } from '../../features/appearance';
import styles from './AppearancePage.module.css';

// Live preview on the real document without touching the stored copy; stable so effects do not re-run.
const preview = (value: AppearanceValue) => applyAppearance(value, { persist: false });

export function AppearancePage() {
  const [density, setDensity] = useState<Density>(readDensity);
  return (
    <div className={styles.page}>
      <AppearanceEditor
        preview={preview}
        density={density}
        onDensityChange={(next) => {
          applyDensity(next);
          setDensity(next);
        }}
      />
    </div>
  );
}
