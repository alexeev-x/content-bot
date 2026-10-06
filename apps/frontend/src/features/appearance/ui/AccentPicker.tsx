import type { AccentRef, CustomPresetDto } from '@alexeev/contracts';
import { ru } from '../../../shared/lib/ru';
import { Radio, RadioGroup } from '../../../shared/ui';
import type { ThemeName } from '../model/appearance-value';
import { AccentSwatch } from './AccentSwatch';
import styles from './AccentPicker.module.css';
import type { AccentSource } from './ThemeScope';

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

/** One radio card per preset (and per custom colour), each with a swatch drawn in this theme. */
export function AccentPicker({ theme, label, value, customPresets, onChange }: Props) {
  const source = (preset: CustomPresetDto): AccentSource => ({ kind: 'custom', baseColor: preset.baseColor });
  return (
    <RadioGroup
      label={label}
      variant="card"
      value={keyOf(value)}
      onChange={(key) => {
        const ref = parseKey(key);
        if (ref) onChange(ref);
      }}
    >
      {PRESET_IDS.map((id) => (
        <Radio
          key={id}
          value={`preset:${id}`}
          {...(id === 'cobalt' ? { description: ru.appearance.defaultPreset } : {})}
        >
          <span className={styles.option}>
            <AccentSwatch theme={theme} accent={{ kind: 'preset', id }} />
            {ru.appearance.presets[id]}
          </span>
        </Radio>
      ))}
      {customPresets.map((preset) => (
        <Radio key={preset.id} value={`custom:${preset.id}`} description={ru.appearance.customTag}>
          <span className={styles.option}>
            <AccentSwatch theme={theme} accent={source(preset)} />
            {preset.name}
          </span>
        </Radio>
      ))}
    </RadioGroup>
  );
}
