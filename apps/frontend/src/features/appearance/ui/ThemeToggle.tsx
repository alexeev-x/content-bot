import { ru } from '../../../shared/lib/ru';
import { Button as AriaButton } from 'react-aria-components';
import { Icon, IconButton, useToast, VisuallyHidden } from '../../../shared/ui';
import { useCallback, useEffect, useRef } from 'react';
import type { AppearanceValue } from '../model/appearance-value';
import { useThemeToggle } from '../model/use-theme-toggle';

type Props = {
  /** Applies a value to the document without persisting it; must be a stable function. */
  preview: (value: AppearanceValue) => void;
  /** A full-width menu row (account menu) instead of the icon button; the caller styles it. */
  row?: { className?: string | undefined; labelClassName?: string | undefined; valueClassName?: string | undefined };
};

/** Top-bar button: one press flips light and dark, applies it at once and saves it. */
export function ThemeToggle({ preview, row }: Props) {
  const toast = useToast();
  // After a failure the screen is back on the saved theme, so repeating the press repeats the same toggle.
  const retry = useRef<() => void>(() => undefined);
  const onFailure = useCallback(
    () =>
      toast.show({
        tone: 'error',
        title: ru.theme.saveFailed,
        action: { label: ru.theme.retry, onPress: () => retry.current() }
      }),
    [toast]
  );
  const { screen, toggle, announced, isReady, loadFailed } = useThemeToggle({ preview, onFailure });
  useEffect(() => {
    retry.current = toggle;
  }, [toggle]);
  const dark = screen === 'dark';
  const label = loadFailed ? ru.theme.loadFailed : dark ? ru.theme.toLight : ru.theme.toDark;
  return (
    <>
      {row ? (
        <AriaButton className={row.className} aria-label={label} isDisabled={!isReady} onPress={toggle}>
          <Icon name={dark ? 'moon' : 'sun'} size={18} />
          <span className={row.labelClassName}>{ru.theme.rowLabel}</span>
          <span className={row.valueClassName}>{dark ? ru.theme.nowDark : ru.theme.nowLight}</span>
        </AriaButton>
      ) : (
        <IconButton label={label} icon={dark ? 'sun' : 'moon'} isDisabled={!isReady} onPress={toggle} />
      )}
      <VisuallyHidden>
        <output>{announced ? (announced === 'dark' ? ru.theme.nowDark : ru.theme.nowLight) : ''}</output>
      </VisuallyHidden>
    </>
  );
}
