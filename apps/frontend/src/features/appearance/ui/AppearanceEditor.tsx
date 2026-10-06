import { useBlocker } from '@tanstack/react-router';
import { ApiError } from '../../../shared/api/http-client';
import { ru } from '../../../shared/lib/ru';
import {
  Banner,
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  SegmentedControl,
  Skeleton,
  useToast,
  VisuallyHidden,
  type SegmentOption
} from '../../../shared/ui';
import {
  addPreset,
  removePreset,
  setAccent,
  setThemeMode,
  updatePreset,
  type AppearanceValue
} from '../model/appearance-value';
import { useAppearanceEditor } from '../model/use-appearance-editor';
import { AccentPicker } from './AccentPicker';
import { AccentPreview } from './AccentPreview';
import styles from './AppearanceEditor.module.css';
import { CustomPresetsCard } from './CustomPresetsCard';
import { type AccentSource } from './ThemeScope';
import type { AccentRef, ThemeMode } from '@alexeev/contracts';

const MODES: readonly SegmentOption[] = [
  { id: 'system', label: ru.theme.system, icon: 'monitor' },
  { id: 'light', label: ru.theme.light, icon: 'sun' },
  { id: 'dark', label: ru.theme.dark, icon: 'moon' }
];

type Props = {
  /** Applies a value to the document without persisting it; must be a stable function. */
  preview: (value: AppearanceValue) => void;
};

function sourceOf(ref: AccentRef, value: AppearanceValue): AccentSource {
  if (ref.kind === 'preset') return { kind: 'preset', id: ref.id };
  const preset = value.customPresets.find((candidate) => candidate.id === ref.id);
  return preset ? { kind: 'custom', baseColor: preset.baseColor } : { kind: 'preset', id: 'cobalt' };
}

function Loading() {
  return (
    <div aria-busy="true" className={styles.grid}>
      <VisuallyHidden>{ru.ui.loading}</VisuallyHidden>
      <Card>
        <Skeleton height={44} />
      </Card>
      <Card>
        <Skeleton height={220} />
      </Card>
      <Card>
        <Skeleton height={220} />
      </Card>
    </div>
  );
}

export function AppearanceEditor({ preview }: Props) {
  const editor = useAppearanceEditor({ preview });
  const toast = useToast();
  const blocker = useBlocker({
    shouldBlockFn: () => editor.isDirty,
    enableBeforeUnload: () => editor.isDirty,
    withResolver: true
  });

  if (editor.isLoading) return <Loading />;
  if (editor.loadError || !editor.value) {
    const error = editor.loadError;
    const forbidden = error instanceof ApiError && error.status === 403;
    return (
      <ErrorState
        title={forbidden ? ru.auth.noAccessTitle : ru.appearance.loadErrorTitle}
        message={forbidden ? ru.auth.noAccessDescription : ru.appearance.loadErrorMessage}
        {...(error instanceof ApiError && error.requestId ? { requestId: error.requestId } : {})}
        {...(forbidden ? {} : { onRetry: editor.reload })}
      />
    );
  }

  const value = editor.value;
  const save = async () => {
    const result = await editor.submit();
    if (result === 'saved') toast.show({ tone: 'success', title: ru.appearance.savedToast });
  };

  return (
    <div className={styles.grid}>
      {editor.problem === 'conflict' ? (
        <Banner
          tone="conflict"
          title={ru.appearance.conflictTitle}
          action={
            <div className={styles.actions}>
              <Button variant="secondary" onPress={() => void editor.reloadFromServer()}>
                {ru.appearance.conflictReload}
              </Button>
              <Button variant="secondary" onPress={() => void editor.keepMine()}>
                {ru.appearance.conflictKeep}
              </Button>
            </div>
          }
        >
          {ru.appearance.conflictBody}
          {editor.reloadFailed ? <> {ru.appearance.conflictReloadFailed}</> : null}
        </Banner>
      ) : editor.problem ? (
        <Banner tone="error" title={ru.appearance.saveErrorTitle[editor.problem]}>
          {ru.appearance.saveErrorBody[editor.problem]}
          {editor.requestId ? (
            <>
              {' '}
              {ru.ui.requestId}: <code>{editor.requestId}</code>
            </>
          ) : null}
        </Banner>
      ) : null}

      <Card title={ru.appearance.modeTitle}>
        <div className={styles.mode}>
          <SegmentedControl
            label={ru.appearance.modeTitle}
            options={MODES}
            value={value.themeMode}
            onChange={(id) => editor.edit((current) => setThemeMode(current, id as ThemeMode))}
          />
          <p className={styles.hint}>{ru.appearance.modeHint}</p>
        </div>
      </Card>

      <div className={styles.themes}>
        {(['light', 'dark'] as const).map((theme) => {
          const ref = theme === 'light' ? value.lightAccent : value.darkAccent;
          return (
            <Card key={theme} title={theme === 'light' ? ru.appearance.lightTitle : ru.appearance.darkTitle}>
              <div className={styles.stack}>
                <AccentPicker
                  theme={theme}
                  label={ru.appearance.accentLabel}
                  value={ref}
                  customPresets={value.customPresets}
                  onChange={(next) => editor.edit((current) => setAccent(current, theme, next))}
                />
                <AccentPreview theme={theme} accent={sourceOf(ref, value)} />
              </div>
            </Card>
          );
        })}
      </div>

      <CustomPresetsCard
        value={value}
        onAdd={(preset) => editor.edit((current) => addPreset(current, preset))}
        onUpdate={(preset) => editor.edit((current) => updatePreset(current, preset))}
        onRemove={(id) => editor.edit((current) => removePreset(current, id))}
      />

      <div className={styles.footer}>
        <output className={styles.status}>{editor.isDirty ? ru.appearance.unsaved : ''}</output>
        <div className={styles.actions}>
          <Button variant="secondary" isDisabled={!editor.isDirty || editor.isSaving} onPress={editor.discard}>
            {ru.appearance.discard}
          </Button>
          <Button isDisabled={!editor.isDirty} isLoading={editor.isSaving} onPress={() => void save()}>
            {ru.appearance.save}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={blocker.status === 'blocked'}
        onOpenChange={(open) => {
          if (!open && blocker.status === 'blocked') blocker.reset();
        }}
        title={ru.appearance.leaveTitle}
        description={ru.appearance.leaveDescription}
        confirmLabel={ru.appearance.leaveConfirm}
        cancelLabel={ru.appearance.leaveCancel}
        onConfirm={() => {
          if (blocker.status === 'blocked') blocker.proceed();
        }}
      />
    </div>
  );
}
