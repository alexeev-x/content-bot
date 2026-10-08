import { Link, useRouterState, type LinkProps } from '@tanstack/react-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button as AriaButton, Focusable } from 'react-aria-components';
import { ru } from '../../shared/lib/ru';
import { isInsideTelegram } from '../../shared/telegram/web-app';
import { Drawer, Icon, IconButton, PageHeaderTools, Tooltip, VisuallyHidden } from '../../shared/ui';
import { readAppEnvironment, showEnvironmentBadge } from '../environment';
import styles from './AppShell.module.css';
import { NAV_ITEMS, type NavItem } from './nav-items';
import { OwnerMenu } from './OwnerMenu';
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
  /** Opens the command palette. Without it the search entry is a disabled placeholder. */
  onOpenSearch?: () => void;
  /** Slot left of the owner menu in the top bar (the theme toggle); built by the frontend role. */
  topBarTools?: ReactNode;
  /** Prototype only: prefix of every nav target (`/__proto`), so the shell navigates between mock screens. */
  linkBase?: string | undefined;
  /** Prototype only: hides the phone tab bar like the real editor route does. */
  editor?: boolean | undefined;
  /** Prototype only: draws the Mini App variant (no top bar) without Telegram. */
  miniApp?: boolean | undefined;
  /** Extra content under the sections in the «Ещё» sheet (the «Подключённый канал» card). */
  moreExtra?: ReactNode | ((close: () => void) => ReactNode);
  /** Prototype only: a group below the working items and above the pinned Settings link (the «Превью» group). */
  sidebarExtra?: ReactNode;
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

// PAGE_MAP lists routes that the router does not know yet (/publications, /automations): their pages
// are added by the frontend role, until then they resolve to the not-found page.
const target = (item: NavItem, base = '') =>
  (base ? `${base}${item.to === '/' ? '' : item.to}` : item.to) as LinkProps['to'];

function NavLink({
  item,
  incidentsCount,
  onNavigate,
  iconOnly = false,
  base
}: {
  base?: string | undefined;
  item: NavItem;
  incidentsCount: number;
  onNavigate?: () => void;
  /** Collapsed sidebar: the label stays for assistive tech and moves into a tooltip. */
  iconOnly?: boolean;
}) {
  const link = (
    <Link
      to={target(item, base)}
      activeOptions={{ exact: item.exact ?? false }}
      className={styles.link}
      onClick={onNavigate}
    >
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

function SidebarNav({
  incidentsCount,
  collapsed,
  base,
  extra
}: {
  incidentsCount: number;
  collapsed: boolean;
  base?: string | undefined;
  extra?: ReactNode;
}) {
  return (
    <nav aria-label={ru.nav.label} className={styles.nav}>
      {NAV_ITEMS.filter((item) => !item.pinned).map((item) => (
        <NavLink key={item.to} item={item} incidentsCount={incidentsCount} iconOnly={collapsed} base={base} />
      ))}
      {extra}
      <div className={styles.pinned}>
        {NAV_ITEMS.filter((item) => item.pinned).map((item) => (
          <NavLink key={item.to} item={item} incidentsCount={incidentsCount} iconOnly={collapsed} base={base} />
        ))}
      </div>
    </nav>
  );
}

/** Static sidebar for the dev catalog: same classes and nav as the real shell, no sticky positioning. */
export function SidebarPreview({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={styles.preview} data-sidebar={collapsed ? 'collapsed' : 'expanded'}>
      <aside className={styles.side}>
        <SidebarNav incidentsCount={2} collapsed={collapsed} />
      </aside>
    </div>
  );
}

export function AppShell({
  children,
  incidentsCount = 0,
  ownerName,
  ownerLoading = false,
  onLogout,
  onOpenSearch,
  topBarTools,
  linkBase,
  editor,
  miniApp: forcedMiniApp,
  moreExtra,
  sidebarExtra,
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
  const editorOpen = editor ?? /^\/posts\/[^/]+/.test(pathname);
  const primary = NAV_ITEMS.filter((item) => item.primary);
  const secondary = NAV_ITEMS.filter((item) => !item.primary);
  // Telegram draws its own header: the app top bar goes and its tools move into each page header.
  const miniApp = forcedMiniApp ?? isInsideTelegram();
  const tools = miniApp ? (
    <>
      {/* No disabled placeholder in the cramped Telegram header: search appears once it works. */}
      {onOpenSearch ? <IconButton label={ru.shell.searchPlaceholder} icon="search" onPress={onOpenSearch} /> : null}
      {topBarTools}
      <OwnerMenu ownerName={ownerName} onLogout={onLogout} isLoading={ownerLoading} iconOnly />
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
        <SidebarNav incidentsCount={incidentsCount} collapsed={collapsed} base={linkBase} extra={sidebarExtra} />
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
        {miniApp ? null : (
          <header className={styles.top}>
            <div className={styles.topBrand}>
              <span className={styles.logo} aria-hidden="true">
                A
              </span>
              <EnvBadge />
            </div>
            <AriaButton
              className={styles.search}
              isDisabled={!onOpenSearch}
              onPress={onOpenSearch}
              aria-label={ru.shell.searchPlaceholder}
            >
              <Icon name="search" size={18} />
              <span className={styles.searchText}>{ru.shell.searchPlaceholder}</span>
              {onOpenSearch ? <kbd className={styles.kbd}>⌘K</kbd> : null}
            </AriaButton>
            <span className={styles.spacer} />
            {topBarTools}
            <OwnerMenu ownerName={ownerName} onLogout={onLogout} isLoading={ownerLoading} />
          </header>
        )}
        <main id="main" ref={mainRef} tabIndex={-1} className={styles.main}>
          <PageHeaderTools value={tools}>{children}</PageHeaderTools>
        </main>
      </div>

      <nav aria-label={ru.nav.label} className={styles.tabbar}>
        {primary.map((item) => (
          <NavLink key={item.to} item={item} incidentsCount={incidentsCount} base={linkBase} />
        ))}
        <AriaButton
          className={styles.tab}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          onPress={() => setMoreOpen(true)}
        >
          <Icon name="menu" size={22} />
          <span className={styles.linkLabel}>{ru.nav.more}</span>
          {incidentsCount > 0 && secondary.some((item) => item.badge === 'incidents') ? (
            <span className={styles.dot}>
              <VisuallyHidden>{ru.nav.incidentsBadge(incidentsCount)}</VisuallyHidden>
            </span>
          ) : null}
        </AriaButton>
      </nav>

      <Drawer variant="bottom" title={ru.nav.moreTitle} isOpen={moreOpen} onOpenChange={setMoreOpen}>
        <nav aria-label={ru.nav.moreTitle} className={styles.sheetNav}>
          {secondary.map((item) => (
            <NavLink
              key={item.to}
              item={item}
              incidentsCount={incidentsCount}
              onNavigate={() => setMoreOpen(false)}
              base={linkBase}
            />
          ))}
        </nav>
        {typeof moreExtra === 'function' ? moreExtra(() => setMoreOpen(false)) : moreExtra}
      </Drawer>
    </div>
  );
}
