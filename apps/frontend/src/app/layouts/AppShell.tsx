import { Link, useRouterState, type LinkProps } from '@tanstack/react-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button as AriaButton, Focusable } from 'react-aria-components';
import { ru } from '../../shared/lib/ru';
import { isInsideTelegram } from '../../shared/telegram/web-app';
import { Drawer, Icon, IconButton, PageHeaderTools, Tooltip, VisuallyHidden } from '../../shared/ui';
import { readAppEnvironment, showEnvironmentBadge } from '../environment';
import styles from './AppShell.module.css';
import { NAV_ITEMS, type NavItem } from './nav-items';
import { AccountMenu } from './AccountMenu';
import { useSidebarCollapsed } from './use-sidebar-collapsed';

type Props = {
  children: ReactNode;
  /** Open incidents, from the incidents feature. Hidden when 0 or undefined. */
  incidentsCount?: number;
  /** Signed-in owner; the shell never reads the session itself. */
  ownerName?: string | undefined;
  /** The owner name is still loading: the menu shows a placeholder, not «Владелец». */
  ownerLoading?: boolean;
  /** Signs the owner out; without it the owner menu has no «Выйти». */
  onLogout?: () => void;
  /** Opens the command palette; the entry is hidden until real search is available. */
  onOpenSearch?: () => void;
  /** Rows of the account menu between «Настройки» and «Выйти» (system status, theme); built by the layout. */
  accountRows?: ReactNode;
  /** A system problem: marks the account avatar. */
  accountAlert?: 'warning' | 'danger' | undefined;
  /** Hides the top bar; search, theme toggle and owner menu move into each page header (as in the Mini App). Default: on for the post editor routes (`/posts/new`, `/posts/$id`, `/posts/$id/publish`), off elsewhere. */
  focused?: boolean | undefined;
  /** Card above the collapse control (the «Подключённый канал» card); receives the rail state. */
  sidebarFooter?: ReactNode | ((collapsed: boolean) => ReactNode);
};

function EnvBadge() {
  const environment = readAppEnvironment();
  if (!showEnvironmentBadge(environment)) return null;
  return (
    <span className={styles.env}>
      <span aria-hidden="true">{ru.shell.envBadge}</span>
      <VisuallyHidden>{ru.shell.envLabel}</VisuallyHidden>
    </span>
  );
}

function NavBadge({ count }: { count: number }) {
  return (
    <span className={styles.count}>
      <span aria-hidden="true">{count >= 99 ? '99+' : count}</span>
      <VisuallyHidden>{ru.nav.incidentsBadge(count)}</VisuallyHidden>
    </span>
  );
}

const target = (item: NavItem) => item.to as LinkProps['to'];

function NavLink({
  item,
  incidentsCount,
  onNavigate,
  iconOnly = false
}: {
  item: NavItem;
  incidentsCount: number;
  onNavigate?: () => void;
  /** Collapsed sidebar: the label stays for assistive tech and moves into a tooltip. */
  iconOnly?: boolean;
}) {
  const link = (
    <Link to={target(item)} activeOptions={{ exact: item.exact ?? false }} className={styles.link} onClick={onNavigate}>
      <Icon name={item.icon} size={20} />
      <span className={iconOnly ? styles.linkLabelHidden : styles.linkLabel}>{item.label}</span>
      {item.badge === 'incidents' && incidentsCount > 0 ? <NavBadge count={incidentsCount} /> : null}
    </Link>
  );
  return iconOnly ? (
    <Tooltip content={item.label}>
      <Focusable>{link}</Focusable>
    </Tooltip>
  ) : (
    link
  );
}

function SidebarNav({ incidentsCount, collapsed }: { incidentsCount: number; collapsed: boolean }) {
  return (
    <nav aria-label={ru.nav.label} className={styles.nav}>
      {NAV_ITEMS.filter((item) => !item.pinned).map((item) => (
        <NavLink key={item.to} item={item} incidentsCount={incidentsCount} iconOnly={collapsed} />
      ))}
      <div className={styles.pinned}>
        {NAV_ITEMS.filter((item) => item.pinned).map((item) => (
          <NavLink key={item.to} item={item} incidentsCount={incidentsCount} iconOnly={collapsed} />
        ))}
      </div>
    </nav>
  );
}

export function AppShell({
  children,
  incidentsCount = 0,
  ownerName,
  ownerLoading = false,
  onLogout,
  onOpenSearch,
  accountRows,
  accountAlert,
  focused: forcedFocused,
  sidebarFooter
}: Props) {
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const [moreOpen, setMoreOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const firstPath = useRef(pathname);

  // A route change moves focus to the content (WCAG 2.4.3); the first render keeps the browser's default.
  useEffect(() => {
    if (firstPath.current === pathname) return;
    firstPath.current = pathname;
    mainRef.current?.focus();
  }, [pathname]);

  useEffect(() => {
    if (!onOpenSearch) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpenSearch]);

  // The post editor owns the bottom edge on phones (its sticky action bar), so the tab bar steps aside there.
  // The chrome follows the page on screen, not the pending URL: switching on `location` hid the top and tab bars
  // while the previous page was still shown and the editor chunk loaded, so «+» blinked and felt slow.
  const shownPath = useRouterState({ select: (state) => state.resolvedLocation?.pathname ?? state.location.pathname });
  const editorOpen = /^\/posts\/[^/]+/.test(shownPath);
  const primary = NAV_ITEMS.filter((item) => item.primary);
  const secondary = NAV_ITEMS.filter((item) => !item.primary);
  const moreActive = secondary.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
  // Telegram draws its own header: the app top bar goes and its tools move into each page header.
  const miniApp = isInsideTelegram();
  const focused = forcedFocused ?? editorOpen;
  const hideTopBar = miniApp || focused;
  const tools = hideTopBar ? (
    <>
      {/* No disabled placeholder in the cramped Telegram header: search appears once it works. */}
      {onOpenSearch ? <IconButton label={ru.shell.searchPlaceholder} icon="search" onPress={onOpenSearch} /> : null}
      <AccountMenu ownerName={ownerName} onLogout={onLogout} isLoading={ownerLoading} alert={accountAlert} iconOnly>
        {accountRows}
      </AccountMenu>
    </>
  ) : null;

  return (
    <div
      className={styles.shell}
      data-mini-app={miniApp || undefined}
      data-editor={editorOpen || undefined}
      data-sidebar={collapsed ? 'collapsed' : 'expanded'}
    >
      <a
        className={styles.skip}
        href="#main"
        onClick={(event) => {
          // A hash link would hand the URL to the router; move focus instead.
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        {ru.shell.skipLink}
      </a>

      <aside className={styles.side}>
        <div className={styles.brand}>
          <span className={styles.logo} aria-hidden="true">
            A
          </span>
          <span className={styles.brandText}>
            <strong>ALEXEEV</strong>
            <small>Studio</small>
          </span>
          <EnvBadge />
        </div>
        <SidebarNav incidentsCount={incidentsCount} collapsed={collapsed} />
        {sidebarFooter ? (
          <div className={styles.sideFooter}>
            {typeof sidebarFooter === 'function' ? sidebarFooter(collapsed) : sidebarFooter}
          </div>
        ) : null}
        <div className={styles.collapse}>
          <IconButton
            size="sm"
            label={collapsed ? ru.nav.expand : ru.nav.collapse}
            icon={collapsed ? 'chevron-right' : 'chevron-left'}
            onPress={toggleCollapsed}
          />
        </div>
      </aside>

      <div className={styles.column}>
        {hideTopBar ? null : (
          <header className={styles.top}>
            <div className={styles.topBrand}>
              <span className={styles.logo} aria-hidden="true">
                A
              </span>
              <EnvBadge />
            </div>
            <AriaButton
              className={styles.search}
              hidden={!onOpenSearch}
              isDisabled={!onOpenSearch}
              onPress={onOpenSearch}
              aria-label={ru.shell.searchPlaceholder}
            >
              <Icon name="search" size={18} />
              <span className={styles.searchText}>{ru.shell.searchPlaceholder}</span>
              {onOpenSearch ? <kbd className={styles.kbd}>⌘K</kbd> : null}
            </AriaButton>
            <span className={styles.spacer} />
            <AccountMenu ownerName={ownerName} onLogout={onLogout} isLoading={ownerLoading} alert={accountAlert}>
              {accountRows}
            </AccountMenu>
          </header>
        )}
        <main id="main" ref={mainRef} tabIndex={-1} className={styles.main}>
          <PageHeaderTools value={tools}>{children}</PageHeaderTools>
        </main>
      </div>

      <nav aria-label={ru.nav.label} className={styles.tabbar}>
        {primary.slice(0, 2).map((item) => (
          <NavLink key={item.to} item={item} incidentsCount={incidentsCount} />
        ))}
        <Link to="/posts/new" className={styles.tabCreate} aria-label={ru.nav.newPost}>
          <span className={styles.tabCreateIcon}>
            <Icon name="plus" size={22} />
          </span>
        </Link>
        {primary.slice(2).map((item) => (
          <NavLink key={item.to} item={item} incidentsCount={incidentsCount} />
        ))}
        <AriaButton
          className={styles.tab}
          data-current={moreActive || undefined}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          onPress={() => setMoreOpen(true)}
        >
          <Icon name="menu" size={22} />
          <span className={styles.linkLabel}>{ru.nav.more}</span>
        </AriaButton>
      </nav>

      <Drawer variant="bottom" title={ru.nav.moreTitle} isOpen={moreOpen} onOpenChange={setMoreOpen}>
        <nav aria-label={ru.nav.moreTitle} className={styles.sheetNav}>
          {secondary.map((item) => (
            <NavLink key={item.to} item={item} incidentsCount={incidentsCount} onNavigate={() => setMoreOpen(false)} />
          ))}
        </nav>
      </Drawer>
    </div>
  );
}
