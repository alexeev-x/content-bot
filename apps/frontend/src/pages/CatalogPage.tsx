import { useId, useState, type CSSProperties } from 'react';
import { deriveAccent, measureAccent, statusHueWarning, type ColorTheme } from '../shared/lib/color';
import { Button, Card } from '../shared/ui';
import styles from './CatalogPage.module.css';

// Dev-only page, so its labels are plain English instead of ru.ts entries.
const PRESETS = ['cobalt', 'indigo', 'copper', 'orchid', 'mono'] as const;
const STATUSES = [
  ['pending', 'Scheduled', '◔'],
  ['active', 'Publishing', '◐'],
  ['done', 'Published', '✓'],
  ['retry', 'Retry scheduled', '↻'],
  ['failed', 'Failed', '✕'],
  ['unknown', 'Needs review', '?'],
  ['muted', 'Cancelled', '–']
] as const;
const SURFACES = ['bg', 'surface-1', 'surface-2', 'surface-3'] as const;
const THEMES: readonly ColorTheme[] = ['light', 'dark'];
const DEFAULT_CUSTOM = '#0f9d8a';

const scope = (theme: ColorTheme, accent: string) =>
  ({ 'data-theme': theme, [theme === 'light' ? 'data-accent-light' : 'data-accent-dark']: accent }) as Record<
    string,
    string
  >;

function StatusPill({ status, label, icon }: { status: string; label: string; icon: string }) {
  const style = {
    color: `var(--color-status-${status}-fg)`,
    background: `var(--color-status-${status}-bg)`,
    boxShadow: `inset 0 0 0 1px var(--color-status-${status}-ring)`
  } satisfies CSSProperties;
  return (
    <span className={styles.pill} style={style}>
      <span aria-hidden="true">{icon}</span>
      {label}
    </span>
  );
}

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
        <StatusPill status="active" label="Publishing" icon="◐" />
        <StatusPill status="unknown" label="Needs review" icon="?" />
      </div>
    </div>
  );
}

function CustomColor({ theme }: { theme: ColorTheme }) {
  const id = useId();
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
      <label htmlFor={id} className={styles.sampleName}>
        Custom base color
      </label>
      <div className={styles.row}>
        <input
          id={id}
          type="color"
          value={base}
          onChange={(event) => setBase(event.target.value)}
          className={styles.colorInput}
        />
        <code>{base}</code>
        <code>→ {derived.accent}</code>
      </div>
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

function ThemePanel({ theme }: { theme: ColorTheme }) {
  // The panel shows this theme with the accent currently applied to <html>; injected --custom-* inherit.
  const current = document.documentElement.dataset[theme === 'light' ? 'accentLight' : 'accentDark'] ?? 'cobalt';
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
        {STATUSES.map(([status, label, icon]) => (
          <StatusPill key={status} status={status} label={label} icon={icon} />
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

export function CatalogPage() {
  return (
    <div id="catalog" className={styles.page}>
      <h1 className={styles.title}>Design tokens</h1>
      <p className={styles.muted}>Dev-only catalog: neutrals, statuses and accents in both themes.</p>
      <div className={styles.panels}>
        {THEMES.map((theme) => (
          <ThemePanel key={theme} theme={theme} />
        ))}
      </div>
    </div>
  );
}
