import type { AccentRef, CustomPresetDto } from '@alexeev/contracts';
import { useLayoutEffect, useRef, useState } from 'react';
import { deriveAccent } from '../../../shared/lib/color';
import { ru } from '../../../shared/lib/ru';
import { SwatchRadio, SwatchRadioGroup } from '../../../shared/ui';
import type { ThemeName } from '../model/appearance-value';
import { ThemeScope } from './ThemeScope';

const PRESET_IDS = ['cobalt', 'indigo', 'copper', 'orchid', 'mono'] as const;

const keyOf = (ref: AccentRef) => `${ref.kind}:${ref.id}`;

function parseKey(key: string): AccentRef | null {
  const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  if (kind === 'custom') return { kind, id };
  const preset = PRESET_IDS.find((candidate) => candidate === id);
  return kind === 'preset' && preset ? { kind, id: preset } : null;
}

type Props = {
  theme: ThemeName;
  label: string;
  value: AccentRef;
  customPresets: readonly CustomPresetDto[];
  onChange: (ref: AccentRef) => void;
};

/**
 * One row of colour swatches per theme (presets, then custom colours). Preset colours live only in tokens.css, so a
 * hidden probe scoped to this theme reads the resolved accent; custom colours are derived with the same function
 * the live theme uses.
 */
export function AccentPicker({ theme, label, value, customPresets, onChange }: Props) {
  const probes = useRef<HTMLSpanElement>(null);
  const [presetColors, setPresetColors] = useState<Readonly<Record<string, string>>>({});

  useLayoutEffect(() => {
    const root = probes.current;
    if (!root) return;
    const next: Record<string, string> = {};
    for (const probe of root.querySelectorAll<HTMLElement>('[data-preset]')) {
      const scoped = probe.firstElementChild;
      if (scoped && probe.dataset.preset) {
        next[probe.dataset.preset] = getComputedStyle(scoped).getPropertyValue('--color-accent').trim();
      }
    }
    setPresetColors(next);
  }, [theme]);

  const selected =
    value.kind === 'preset'
      ? ru.appearance.presets[value.id as (typeof PRESET_IDS)[number]]
      : customPresets.find((preset) => preset.id === value.id)?.name;

  return (
    <>
      <SwatchRadioGroup
        label={label}
        {...(selected ? { description: selected } : {})}
        value={keyOf(value)}
        onChange={(key) => {
          const ref = parseKey(key);
          if (ref) onChange(ref);
        }}
      >
        {PRESET_IDS.map((id) => (
          <SwatchRadio
            key={id}
            value={`preset:${id}`}
            name={ru.appearance.presets[id]}
            color={presetColors[id] ?? 'transparent'}
          />
        ))}
        {customPresets.map((preset) => (
          <SwatchRadio
            key={preset.id}
            value={`custom:${preset.id}`}
            name={preset.name}
            color={deriveAccent(preset.baseColor, theme).accent}
          />
        ))}
      </SwatchRadioGroup>
      <span ref={probes} hidden aria-hidden="true">
        {PRESET_IDS.map((id) => (
          <span key={id} data-preset={id}>
            <ThemeScope as="span" theme={theme} accent={{ kind: 'preset', id }} />
          </span>
        ))}
      </span>
    </>
  );
}
