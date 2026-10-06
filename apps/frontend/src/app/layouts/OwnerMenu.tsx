import { useNavigate } from '@tanstack/react-router';
import { ru } from '../../shared/lib/ru';
import { Menu, useMediaQuery, type MenuEntry } from '../../shared/ui';

type Props = {
  ownerName?: string | undefined;
  /** Without it the menu has no «Выйти» entry (shell rendered outside the auth gate). */
  onLogout?: (() => void) | undefined;
};

/** Owner account menu: appearance and sign-out. The name is the trigger on wide screens, an icon on narrow ones. */
export function OwnerMenu({ ownerName, onLogout }: Props) {
  const navigate = useNavigate();
  const wide = useMediaQuery('(min-width: 860px)');
  const owner = ownerName?.trim() || ru.shell.ownerFallback;
  const items: MenuEntry[] = [{ id: 'appearance', label: ru.auth.appearance }];
  if (onLogout) items.push({ id: 'logout', label: ru.auth.logout, tone: 'danger' });
  return (
    <Menu
      label={`${ru.auth.ownerMenu}: ${owner}`}
      items={items}
      {...(wide ? { triggerText: owner } : {})}
      onAction={(id) => {
        if (id === 'appearance') void navigate({ to: '/settings/appearance' });
        else if (id === 'logout') onLogout?.();
      }}
    />
  );
}
