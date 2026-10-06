import { useState, type CSSProperties } from 'react';
import { deriveAccent, measureAccent, statusHueWarning, type ColorTheme } from '../shared/lib/color';
import { Button, Card, ColorField, StatusBadge, type StatusKey } from '../shared/ui';
import styles from './CatalogPage.module.css';

// Dev-only page, so its labels are plain English instead of ru.ts entries.
export const PRESETS = ['cobalt', 'indigo', 'copper', 'orchid', 'mono'] as const;
const STATUSES: readonly StatusKey[] = ['scheduled', 'sending', 'sent', 'retry_wait', 'failed', 'unknown', 'cancelled'];
const SURFACES = ['bg', 'surface-1', 'surface-2', 'surface-3'] as const;
const DEFAULT_CUSTOM = '#0f9d8a';

export const scope = (theme: ColorTheme, accent: string) =>
  ({ 'data-theme': theme, [theme === 'light' ? 'data-accent-light' : 'data-accent-dark']: accent }) as Record<
    string,
    string
  >;

function AccentSample({
  theme,
  label,
  accent,
  custom
}: {
  theme: ColorTheme;
  label: string;
  accent: string;
  custom?: CSSProperties;
}) {
  return (
    <div className={styles.accentSample} style={custom} {...scope(theme, accent)}>
      <strong className={styles.sampleName}>{label}</strong>
      <div className={styles.row}>
        <span className={styles.swatch} style={{ background: 'var(--color-accent)' }} aria-hidden="true" />
        <Button variant="primary">Primary</Button>
        <a className={styles.link} href="#catalog">
          Link text
        </a>
      </div>
      <div className={styles.selected}>Selected item</div>
      <div className={styles.row}>
        <StatusBadge status="sending" />
        <StatusBadge status="unknown" />
      </div>
    </div>
  );
}

function CustomColor({ theme }: { theme: ColorTheme }) {
  const [base, setBase] = useState(DEFAULT_CUSTOM);
  const derived = deriveAccent(base, theme);
  const checks = measureAccent(derived, theme);
  const warning = statusHueWarning(base);
  const injected = Object.fromEntries(
    Object.entries({
      accent: derived.accent,
      'accent-hover': derived.hover,
      'accent-text': derived.text,
      'accent-soft': derived.soft,
      'on-accent': derived.onAccent,
      'focus-ring': derived.ring,
      'accent-glow': derived.glow
    }).map(([name, value]) => [`--custom-${theme}-${name}`, value])
  ) as CSSProperties;
  return (
    <div className={styles.custom}>
      <ColorField label="Custom base color" value={base} onChange={setBase} />
      <code>→ {derived.accent}</code>
      <p className={styles.note}>
        on-accent {checks.onAccent.toFixed(2)}:1 · text {checks.text.toFixed(2)}:1 · ring {checks.ring.toFixed(2)}:1
      </p>
      {warning ? (
        <output className={styles.warning}>
          Close to the {warning} status color; the pills stay distinguishable by icon and text.
        </output>
      ) : null}
      <AccentSample theme={theme} label="Custom" accent="custom" custom={injected} />
    </div>
  );
}

export function TokenPanel({ theme, current }: { theme: ColorTheme; current: string }) {
  return (
    <section className={styles.panel} {...scope(theme, current)} aria-labelledby={`panel-${theme}`}>
      <h2 id={`panel-${theme}`} className={styles.panelTitle}>
        {theme === 'light' ? 'Light theme' : 'Dark theme'}
      </h2>

      <h3 className={styles.group}>Surfaces</h3>
      <div className={styles.surfaces}>
        {SURFACES.map((name) => (
          <div key={name} className={styles.surface} style={{ background: `var(--color-${name})` }}>
            <code>--color-{name}</code>
          </div>
        ))}
      </div>

      <h3 className={styles.group}>Text and borders</h3>
      <Card>
        <p>Text, the primary reading color.</p>
        <p className={styles.muted}>Muted text for secondary information.</p>
        <div className={styles.row}>
          <Button isDisabled>Disabled</Button>
          <Button variant="secondary">Secondary</Button>
        </div>
        <p className={styles.danger}>Danger / error text.</p>
        <div className={styles.borders}>
          <span className={styles.borderSubtle}>border-subtle</span>
          <span className={styles.borderStrong}>border-strong (inputs)</span>
        </div>
      </Card>

      <h3 className={styles.group}>Status pills</h3>
      <div className={styles.row}>
        {STATUSES.map((status) => (
          <StatusBadge key={status} status={status} />
        ))}
      </div>

      <h3 className={styles.group}>Accent presets</h3>
      <div className={styles.accents}>
        {PRESETS.map((preset) => (
          <AccentSample key={preset} theme={theme} label={preset} accent={preset} />
        ))}
        <CustomColor theme={theme} />
      </div>

      <h3 className={styles.group}>Type, shape, chat</h3>
      <p className={styles.display}>Display 34 / 650</p>
      <p className={styles.heading}>Heading 18 / 650</p>
      <p>
        Body 15 Onest: Публикации по расписанию <code>12:30</code> <code>rev 7</code>
      </p>
      <div className={styles.shapes}>
        <span className={styles.shape} style={{ borderRadius: 'var(--radius-1)' }}>
          8
        </span>
        <span className={styles.shape} style={{ borderRadius: 'var(--radius-2)' }}>
          12
        </span>
        <span className={styles.shape} style={{ borderRadius: 'var(--radius-3)' }}>
          18
        </span>
        <span className={styles.shape} style={{ borderRadius: 'var(--radius-pill)' }}>
          pill
        </span>
      </div>
      <div className={styles.chat}>
        <div className={styles.bubble}>
          <p>Telegram preview bubble</p>
          <a className={styles.bubbleLink} href="#catalog">
            t.me/example
          </a>
          <span className={styles.bubbleMeta}>12:30</span>
        </div>
      </div>
    </section>
  );
}
