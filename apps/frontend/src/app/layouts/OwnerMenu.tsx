import { ru } from '../../shared/lib/ru';
import { Menu, useMediaQuery, type MenuEntry } from '../../shared/ui';

type Props = {
  ownerName?: string | undefined;
  /** Without it the menu has no «Выйти» entry (shell rendered outside the auth gate). */
  onLogout?: (() => void) | undefined;
  /** Always the icon trigger, whatever the width (page header tools in the Mini App). */
  iconOnly?: boolean;
};

/** Owner account menu: sign-out only (the theme has its own button, the look lives in Settings). */
export function OwnerMenu({ ownerName, onLogout, iconOnly = false }: Props) {
  const wide = useMediaQuery('(min-width: 860px)');
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
