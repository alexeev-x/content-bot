import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { DEFAULT_CUSTOM_COLOR, statusHueWarning, THEME_PRESET_IDS, type AccentChoice } from '../../../shared/lib/color';
import { ru } from '../../../shared/lib/ru';
import {
  Banner,
  ColorPicker,
  ErrorState,
  Panel,
  SegmentedControl,
  Skeleton,
  useMediaQuery,
  useToast,
  VisuallyHidden
} from '../../../shared/ui';
import { appearanceQueryOptions } from '../api/appearance-queries';
import type { ThemeMode } from '@alexeev/contracts';
import { toValue, type AppearanceValue } from '../model/appearance-value';
import { useAppearanceSaver } from '../model/use-appearance-saver';
import { useScreenTheme } from '../model/use-screen-theme';
import styles from './AppearanceEditor.module.css';
import { ThemeCards } from './ThemeCards';

type Props = {
  /** Applies a value to the document without persisting it; must be a stable function. */
  preview: (value: AppearanceValue) => void;
};

const MODE_OPTIONS = [
  { id: 'light', label: ru.appearance.themes.light, icon: 'sun' },
  { id: 'dark', label: ru.appearance.themes.dark, icon: 'moon' },
  { id: 'system', label: ru.appearance.modeAuto, icon: 'monitor' }
] as const;
const isMode = (id: string): id is ThemeMode => id === 'light' || id === 'dark' || id === 'system';

/** The theme panel with its real title and the height its controls fill, no request: also the route skeleton. */
export function AppearanceSkeleton() {
  return (
    <div aria-busy="true" className={styles.grid}>
      <VisuallyHidden>{ru.ui.loading}</VisuallyHidden>
      <Panel title={ru.appearance.themeTitle} note={ru.appearance.themeNote} reserveRows={7.25} reservePhoneRows={14}>
        <div className={styles.body}>
          <Skeleton lines={3} height={20} />
        </div>
      </Panel>
    </div>
  );
}

/** Every choice applies at once and is saved right away; there is no Save button. */
export function AppearanceEditor({ preview }: Props) {
  const query = useQuery(appearanceQueryOptions());
  const toast = useToast();
  const screen = useScreenTheme();
  // On a phone the three modes share the row; on a wide screen the control keeps its natural width.
  const phone = useMediaQuery('(max-width: 859px)');
  // The colour being dragged: the server value only arrives after the debounced save.
  const [draftColor, setDraftColor] = useState<string | null>(null);
  const onFailure = useCallback(() => {
    setDraftColor(null);
    toast.show({ tone: 'error', title: ru.appearance.saveFailed });
  }, [toast]);
  const { choose, chooseSoon } = useAppearanceSaver({ preview, onFailure });

  if (query.isPending) return <AppearanceSkeleton />;
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
  const customColor = draftColor ?? value.customColor ?? DEFAULT_CUSTOM_COLOR;
  const warning = statusHueWarning(customColor);
  const chooseAccent = (accent: AccentChoice) => choose(accent === 'custom' ? { accent, customColor } : { accent });
  return (
    <div className={styles.grid}>
      <Panel title={ru.appearance.themeTitle} note={ru.appearance.themeNote}>
        <div className={`${styles.body} ${styles.themeBody}`}>
          <SegmentedControl
            label={ru.appearance.modeLabel}
            fullWidth={phone}
            options={MODE_OPTIONS}
            value={value.themeMode}
            onChange={(id) => {
              if (isMode(id)) choose({ themeMode: id });
            }}
          />
          <ThemeCards ids={THEME_PRESET_IDS} theme={screen} value={value.accent} onChange={chooseAccent} />
          {value.accent === 'custom' ? (
            <div className={styles.custom}>
              <h3 className={styles.customTitle}>{ru.appearance.customTitle}</h3>
              <p className={styles.customNote}>{ru.appearance.customNote}</p>
              <ColorPicker
                value={customColor}
                onChange={(hex) => {
                  setDraftColor(hex);
                  chooseSoon({ accent: 'custom', customColor: hex });
                }}
              />
              {warning ? (
                <Banner tone="warning" title={ru.appearance.customWarnTitle}>
                  {warning === 'failed' ? ru.appearance.customWarnFailed : ru.appearance.customWarnUnknown}
                </Banner>
              ) : null}
            </div>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
