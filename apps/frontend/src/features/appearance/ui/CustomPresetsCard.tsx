import { CUSTOM_PRESETS_MAX, type CustomPresetDto } from '@alexeev/contracts';
import { useState } from 'react';
import { ru } from '../../../shared/lib/ru';
import { Button, Card, ConfirmDialog, IconButton } from '../../../shared/ui';
import { presetUsage, type AppearanceValue } from '../model/appearance-value';
import { AccentSwatch } from './AccentSwatch';
import styles from './CustomPresetsCard.module.css';
import { CustomPresetDialog } from './CustomPresetDialog';

type Props = {
  value: AppearanceValue;
  onAdd: (preset: CustomPresetDto) => void;
  onUpdate: (preset: CustomPresetDto) => void;
  onRemove: (id: string) => void;
};

type DialogState = { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; preset: CustomPresetDto };

export function CustomPresetsCard({ value, onAdd, onUpdate, onRemove }: Props) {
  const [dialog, setDialog] = useState<DialogState>({ kind: 'closed' });
  const [removing, setRemoving] = useState<CustomPresetDto | null>(null);
  const atLimit = value.customPresets.length >= CUSTOM_PRESETS_MAX;
  const usage = removing ? presetUsage(value, removing.id) : [];

  return (
    <Card
      title={ru.appearance.customTitle}
      actions={
        <Button
          size="sm"
          variant="secondary"
          icon="plus"
          isDisabled={atLimit}
          onPress={() => setDialog({ kind: 'create' })}
        >
          {ru.appearance.addColor}
        </Button>
      }
    >
      <p className={styles.hint}>
        {atLimit
          ? ru.appearance.customLimit(CUSTOM_PRESETS_MAX)
          : ru.appearance.customCount(value.customPresets.length, CUSTOM_PRESETS_MAX)}
      </p>
      {value.customPresets.length === 0 ? (
        <p className={styles.empty}>{ru.appearance.customEmpty}</p>
      ) : (
        <ul className={styles.list}>
          {value.customPresets.map((preset) => (
            <li key={preset.id} className={styles.row}>
              <span className={styles.swatches}>
                <AccentSwatch theme="light" accent={{ kind: 'custom', baseColor: preset.baseColor }} />
                <AccentSwatch theme="dark" accent={{ kind: 'custom', baseColor: preset.baseColor }} />
              </span>
              <span className={styles.name}>{preset.name}</span>
              <span className={styles.actions}>
                <IconButton
                  label={ru.appearance.editColor(preset.name)}
                  icon="edit"
                  onPress={() => setDialog({ kind: 'edit', preset })}
                />
                <IconButton
                  label={ru.appearance.deleteColor(preset.name)}
                  icon="trash"
                  onPress={() => setRemoving(preset)}
                />
              </span>
            </li>
          ))}
        </ul>
      )}

      {dialog.kind !== 'closed' ? (
        <CustomPresetDialog
          key={dialog.kind === 'edit' ? dialog.preset.id : 'new'}
          isOpen
          onOpenChange={(open) => {
            if (!open) setDialog({ kind: 'closed' });
          }}
          preset={dialog.kind === 'edit' ? dialog.preset : undefined}
          onSubmit={dialog.kind === 'edit' ? onUpdate : onAdd}
        />
      ) : null}

      <ConfirmDialog
        isOpen={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={ru.appearance.deleteTitle(removing?.name ?? '')}
        description={ru.appearance.deleteDescription(usage)}
        confirmLabel={ru.appearance.deleteConfirm}
        cancelLabel={ru.appearance.deleteCancel}
        onConfirm={() => {
          if (removing) onRemove(removing.id);
          setRemoving(null);
        }}
      />
    </Card>
  );
}
