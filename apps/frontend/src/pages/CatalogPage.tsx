import { useEffect, useState } from 'react';
import {
  applyAppearance,
  applyCachedAppearance,
  DEFAULT_APPEARANCE,
  useTheme,
  type ThemePreference
} from '../app/theme';
import type { ColorTheme } from '../shared/lib/color';
import { SegmentedControl, ToastProvider } from '../shared/ui';
import { CatalogButtons } from './CatalogButtons';
import { CatalogDisplay } from './CatalogDisplay';
import { CatalogForms } from './CatalogForms';
import { CatalogOverlays } from './CatalogOverlays';
import { PRESETS, scope, TokenPanel } from './CatalogTokens';
import styles from './CatalogPage.module.css';

// Dev-only page, so its labels are plain English instead of ru.ts entries.
const THEMES: readonly ColorTheme[] = ['light', 'dark'];
type Preset = (typeof PRESETS)[number];
const ACCENT_OPTIONS = PRESETS.map((id) => ({ id, label: id }));

const THEME_OPTIONS = [
  { id: 'light', label: 'light' },
  { id: 'dark', label: 'dark' }
];

/** Every primitive in every state inside one themed scope. Dialogs, menus and toasts portal to <body>, so they follow the page theme and accent chosen above. */
function PrimitivePanel({ theme, accent }: { theme: ColorTheme; accent: string }) {
  return (
    <section className={styles.panel} {...scope(theme, accent)} aria-labelledby={`primitives-${theme}`}>
      <div className={styles.portalRoot}>
        <ToastProvider>
          <h2 id={`primitives-${theme}`} className={styles.panelTitle}>
            {theme === 'light' ? 'Components, light' : 'Components, dark'}
          </h2>
          <CatalogButtons />
          <CatalogForms />
          <CatalogOverlays />
          <CatalogDisplay />
        </ToastProvider>
      </div>
    </section>
  );
}

export function CatalogPage() {
  const [accent, setAccent] = useState<Preset>('cobalt');
  const { preference, setPreference } = useTheme();

  // Overlays live outside the scoped panels, so the document itself takes the chosen accent.
  useEffect(() => {
    const preset = { kind: 'preset', id: accent } as const;
    applyAppearance(
      { ...DEFAULT_APPEARANCE, themeMode: preference, lightAccent: preset, darkAccent: preset },
      { persist: false }
    );
    return applyCachedAppearance;
  }, [accent, preference]);

  return (
    <div id="catalog" className={styles.page}>
      <h1 className={styles.title}>Design catalog</h1>
      <p className={styles.muted}>Dev-only: every primitive state and the tokens, in both themes.</p>
      <div className={styles.row}>
        <SegmentedControl
          label="Accent preset"
          options={ACCENT_OPTIONS}
          value={accent}
          onChange={(id) => setAccent(id as Preset)}
        />
        <SegmentedControl
          label="Overlay theme"
          options={THEME_OPTIONS}
          value={preference === 'dark' ? 'dark' : 'light'}
          onChange={(id) => setPreference(id as ThemePreference)}
        />
      </div>
      <div className={styles.panels}>
        {THEMES.map((theme) => (
          <PrimitivePanel key={theme} theme={theme} accent={accent} />
        ))}
      </div>
      <h2 className={styles.title}>Design tokens</h2>
      <div className={styles.panels}>
        {THEMES.map((theme) => (
          <TokenPanel key={theme} theme={theme} current={accent} />
        ))}
      </div>
    </div>
  );
}
