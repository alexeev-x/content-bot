import { Link } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { Button as AriaButton, Dialog, DialogTrigger, Popover } from 'react-aria-components';
import { ru } from '../../shared/lib/ru';
import { isInsideTelegram } from '../../shared/telegram/web-app';
import { ConfirmDialog, Drawer, Icon, Skeleton, useMediaQuery, VisuallyHidden } from '../../shared/ui';
import styles from './AccountMenu.module.css';

type Props = {
  ownerName?: string | undefined;
  /** Without it the menu has no «Выйти» entry (shell rendered outside the auth gate). */
  onLogout?: (() => void) | undefined;
  /** Always the avatar-only trigger, whatever the width (page header tools in the Mini App). */
  iconOnly?: boolean;
  /** The name is still being fetched and none is remembered: a placeholder instead of the word «Владелец». */
  isLoading?: boolean;
  /** Rows between «Настройки» and «Выйти»: system status and theme, built by the layout. */
  children?: ReactNode;
  /** A system problem: marks the avatar, since the status no longer sits in the top bar. */
  alert?: 'warning' | 'danger' | undefined;
};

function Avatar({ name, size, alert }: { name: string; size?: 'lg'; alert?: Props['alert'] }) {
  return (
    <span className={styles.avatar} data-size={size} aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
      {alert ? <span className={styles.alert} data-tone={alert} /> : null}
    </span>
  );
}

/** The one account entry of the top bar: settings, system status, theme and sign-out live inside it. */
export function AccountMenu({ ownerName, onLogout, iconOnly = false, isLoading = false, children, alert }: Props) {
  const wide = useMediaQuery('(min-width: 860px)');
  const [open, setOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  if (isLoading && !ownerName?.trim() && wide && !iconOnly) {
    return <Skeleton width={160} height="var(--size-button)" radius="var(--radius-pill)" />;
  }
  const owner = ownerName?.trim() || ru.shell.ownerFallback;
  const close = () => setOpen(false);
  const content = (
    <>
      <div className={styles.head}>
        <Avatar name={owner} size="lg" />
        <span className={styles.headText}>
          <strong>{owner}</strong>
          <small>{ru.shell.ownerFallback}</small>
        </span>
      </div>
      <Link to="/settings" className={styles.row} onClick={close}>
        <Icon name="settings" size={18} />
        <span className={styles.rowLabel}>{ru.nav.settings}</span>
      </Link>
      {children}
      {onLogout ? (
        <div className={styles.danger}>
          <AriaButton
            className={styles.row}
            onPress={() => {
              close();
              setConfirmLogout(true);
            }}
          >
            <Icon name="log-out" size={18} />
            <span className={styles.rowLabel}>{ru.auth.logout}</span>
          </AriaButton>
        </div>
      ) : null}
    </>
  );
  const trigger = (
    <AriaButton
      className={styles.trigger}
      aria-label={`${ru.auth.ownerMenu}: ${owner}`}
      {...(!wide || isInsideTelegram() ? { onPress: () => setOpen(true) } : {})}
    >
      <Avatar name={owner} alert={alert} />
      {wide && !iconOnly ? <span className={styles.name}>{owner}</span> : null}
      <Icon name="chevron-down" size={16} />
      {alert ? <VisuallyHidden>{ru.systemStatus.title}</VisuallyHidden> : null}
    </AriaButton>
  );

  const logoutDialog = onLogout ? (
    <ConfirmDialog
      isOpen={confirmLogout}
      onOpenChange={setConfirmLogout}
      title="Выйти из админки?"
      description="Вход на этом устройстве будет сброшен. Чтобы вернуться, снова войдите через Telegram. Посты и расписание не изменятся."
      confirmLabel="Да, выйти"
      cancelLabel="Нет"
      onConfirm={() => {
        setConfirmLogout(false);
        onLogout();
      }}
    />
  ) : null;

  // Phones and Telegram get a bottom sheet: an anchored panel would hang off the screen edge there.
  if (!wide || isInsideTelegram()) {
    return (
      <>
        {trigger}
        <Drawer variant="bottom" title={ru.auth.ownerMenu} isOpen={open} onOpenChange={setOpen}>
          <div className={styles.panel}>{content}</div>
        </Drawer>
        {logoutDialog}
      </>
    );
  }
  return (
    <>
      <DialogTrigger isOpen={open} onOpenChange={setOpen}>
        {trigger}
        <Popover placement="bottom end" offset={8} className={styles.popover}>
          <Dialog aria-label={ru.auth.ownerMenu} className={styles.panel}>
            {content}
          </Dialog>
        </Popover>
      </DialogTrigger>
      {logoutDialog}
    </>
  );
}
