import { ru } from '../../shared/lib/ru';
import { Menu, Skeleton, useMediaQuery, type MenuEntry } from '../../shared/ui';

type Props = {
  ownerName?: string | undefined;
  /** Without it the menu has no «Выйти» entry (shell rendered outside the auth gate). */
  onLogout?: (() => void) | undefined;
  /** Always the icon trigger, whatever the width (page header tools in the Mini App). */
  iconOnly?: boolean;
  /** The name is still being fetched and none is remembered: a placeholder instead of the word «Владелец». */
  isLoading?: boolean;
};

/** Owner account menu: sign-out only (the theme has its own button, the look lives in Settings). */
export function OwnerMenu({ ownerName, onLogout, iconOnly = false, isLoading = false }: Props) {
  const wide = useMediaQuery('(min-width: 860px)');
  if (isLoading && !ownerName?.trim() && wide && !iconOnly) {
    return <Skeleton width={120} height="var(--size-button-sm)" radius="var(--radius-2)" />;
  }
  const owner = ownerName?.trim() || ru.shell.ownerFallback;
  const items: MenuEntry[] = [];
  if (onLogout) items.push({ id: 'logout', label: ru.auth.logout, tone: 'danger' });
  return (
    <Menu
      label={`${ru.auth.ownerMenu}: ${owner}`}
      items={items}
      {...(wide && !iconOnly ? { triggerText: owner } : {})}
      onAction={(id) => {
        if (id === 'logout') onLogout?.();
      }}
    />
  );
}
