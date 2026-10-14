import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { ACCENT_IDS, type AccentId } from '../../../shared/lib/color';
import { ru } from '../../../shared/lib/ru';
import { ErrorState, Panel, SegmentedControl, Skeleton, useToast, VisuallyHidden } from '../../../shared/ui';
import { appearanceQueryOptions } from '../api/appearance-queries';
import { toValue, type AppearanceValue } from '../model/appearance-value';
import { useAppearanceSaver } from '../model/use-appearance-saver';
import { useScreenTheme } from '../model/use-screen-theme';
import { AccentTiles } from './AccentTiles';
import styles from './AppearanceEditor.module.css';
import { PreviewPanel } from './PreviewPanel';
import { ThemeTiles } from './ThemeTiles';

export type Density = 'normal' | 'compact';

type Props = {
  /** Applies a value to the document without persisting it; must be a stable function. */
  preview: (value: AppearanceValue) => void;
  /** Density is a per-device setting kept by the app (localStorage), not by the server. */
  density: Density;
  onDensityChange: (density: Density) => void;
};

const DENSITY_OPTIONS = [
  { id: 'normal', label: ru.appearance.density.normal },
  { id: 'compact', label: ru.appearance.density.compact }
] as const;

function Loading() {
  return (
    <div aria-busy="true" className={styles.grid}>
      <VisuallyHidden>{ru.ui.loading}</VisuallyHidden>
      <Skeleton height={150} radius="var(--radius-2)" />
      <Skeleton height={230} radius="var(--radius-2)" />
    </div>
  );
}

/** Every choice applies at once and is saved right away; there is no Save button. */
export function AppearanceEditor({ preview, density, onDensityChange }: Props) {
  const query = useQuery(appearanceQueryOptions());
  const toast = useToast();
  const screen = useScreenTheme();
  const onFailure = useCallback(() => toast.show({ tone: 'error', title: ru.appearance.saveFailed }), [toast]);
  const { choose } = useAppearanceSaver({ preview, onFailure });

  if (query.isPending) return <Loading />;
  if (query.isError || !query.data) {
    const error = query.error;
    return (
      <ErrorState
        title={ru.appearance.loadErrorTitle}
        message={ru.appearance.loadErrorMessage}
        {...(error instanceof ApiError && error.requestId ? { requestId: error.requestId } : {})}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const value = toValue(query.data);
  return (
    <div className={styles.grid}>
      <Panel title={ru.appearance.themeTitle}>
        <div className={styles.body}>
          <ThemeTiles value={value.themeMode} onChange={(themeMode) => choose({ themeMode })} />
        </div>
      </Panel>
      <div className={styles.accentRow}>
        <Panel title={ru.appearance.accentTitle}>
          <div className={styles.body}>
            <AccentTiles
              ids={ACCENT_IDS}
              theme={screen}
              value={value.accent}
              onChange={(accent: AccentId) => choose({ accent })}
            />
          </div>
        </Panel>
        <PreviewPanel />
      </div>
      <Panel title={ru.appearance.densityTitle} note={ru.appearance.densityNote}>
        <div className={styles.body}>
          <SegmentedControl
            label={ru.appearance.densityLabel}
            options={DENSITY_OPTIONS}
            value={density}
            onChange={(id) => onDensityChange(id === 'compact' ? 'compact' : 'normal')}
          />
        </div>
      </Panel>
    </div>
  );
}
