import { CUSTOM_PRESET_NAME_MAX, customPresetSchema, type CustomPresetDto } from '@alexeev/contracts';
import { useState } from 'react';
import { statusHueWarning } from '../../../shared/lib/color';
import { ru } from '../../../shared/lib/ru';
import { Banner, Button, ColorField, Dialog, Disclosure, DisclosureGroup, TextField } from '../../../shared/ui';
import { AccentPreview } from './AccentPreview';
import { ThemeScope } from './ThemeScope';
import styles from './CustomPresetDialog.module.css';

/** Seed for a new colour: a calm teal that no status token resembles. */
const NEW_COLOR = '#0f9d8a';

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when renaming or recolouring an existing preset. */
  preset?: CustomPresetDto | undefined;
  onSubmit: (preset: CustomPresetDto) => void;
};

function nameError(name: string): string | undefined {
  const trimmed = name.trim();
  if (trimmed.length === 0) return ru.appearance.nameRequired;
  if (trimmed.length > CUSTOM_PRESET_NAME_MAX) return ru.appearance.nameTooLong(CUSTOM_PRESET_NAME_MAX);
  return customPresetSchema.shape.name.safeParse(trimmed).success ? undefined : ru.appearance.nameForbidden;
}

/** Create or edit a custom colour. Changes reach the page draft only on submit; the preview here is local. */
const THEMES = ['light', 'dark'] as const;

export function CustomPresetDialog({ isOpen, onOpenChange, preset, onSubmit }: Props) {
  const [name, setName] = useState(preset?.name ?? '');
  const [baseColor, setBaseColor] = useState(preset?.baseColor ?? NEW_COLOR);
  const [showError, setShowError] = useState(false);
  const error = showError ? nameError(name) : undefined;
  const warning = statusHueWarning(baseColor);
  const accent = { kind: 'custom', baseColor } as const;

  const submit = () => {
    if (nameError(name)) {
      setShowError(true);
      return;
    }
    const parsed = customPresetSchema.safeParse({
      id: preset?.id ?? crypto.randomUUID(),
      name: name.trim(),
      baseColor
    });
    if (!parsed.success) {
      setShowError(true);
      return;
    }
    onSubmit(parsed.data);
    onOpenChange(false);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={preset ? ru.appearance.dialogEditTitle : ru.appearance.dialogCreateTitle}
      description={ru.appearance.dialogDescription}
      size="wide"
      footer={
        <>
          <Button variant="secondary" onPress={() => onOpenChange(false)}>
            {ru.ui.cancel}
          </Button>
          <Button onPress={submit}>{preset ? ru.appearance.dialogSaveEdit : ru.appearance.dialogSaveCreate}</Button>
        </>
      }
    >
      <div className={styles.layout}>
        <div className={styles.fields}>
          <form
            className={styles.form}
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <TextField
              label={ru.appearance.nameLabel}
              description={ru.appearance.nameHint(CUSTOM_PRESET_NAME_MAX)}
              value={name}
              onChange={setName}
              onBlur={() => setShowError(true)}
              errorMessage={error}
              isRequired
              // Intentional: the dialog is about this field, so focus starts there.
              // oxlint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
            <ColorField
              label={ru.appearance.colorLabel}
              description={ru.appearance.colorHint}
              value={baseColor}
              onChange={setBaseColor}
            />
          </form>
          {warning ? (
            <Banner tone="warning" title={ru.appearance.warningTitle[warning]}>
              {ru.appearance.warningBody[warning]}
            </Banner>
          ) : null}
        </div>
        {/* Collapsed by default so the dialog stays short; the dot shows the accent of each theme without opening it. */}
        <DisclosureGroup>
          {THEMES.map((theme) => (
            <Disclosure
              key={theme}
              id={theme}
              title={theme === 'light' ? ru.appearance.previewLightTitle : ru.appearance.previewDarkTitle}
              aside={<ThemeScope as="span" theme={theme} accent={accent} className={styles.dot} />}
            >
              <AccentPreview theme={theme} accent={accent} />
            </Disclosure>
          ))}
        </DisclosureGroup>
      </div>
    </Dialog>
  );
}
