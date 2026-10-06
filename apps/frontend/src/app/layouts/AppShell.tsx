import { Link, useRouterState, type LinkProps } from '@tanstack/react-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { ru } from '../../shared/lib/ru';
import { Drawer, Icon, VisuallyHidden } from '../../shared/ui';
import { readAppEnvironment, showEnvironmentBadge } from '../environment';
import styles from './AppShell.module.css';
import { NAV_ITEMS, type NavItem } from './nav-items';
import { OwnerMenu } from './OwnerMenu';

type Props = {
  children: ReactNode;
  /** Open incidents, from the incidents feature. Hidden when 0 or undefined. */
  incidentsCount?: number;
  /** Signed-in owner; the shell never reads the session itself. */
  ownerName?: string;
  /** Signs the owner out; without it the owner menu has no «Выйти». */
  onLogout?: () => void;
  /** Opens the command palette. Without it the search entry is a disabled placeholder. */
  onOpenSearch?: () => void;
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
      <span aria-hidden="true">{count}</span>
      <VisuallyHidden>{ru.nav.incidentsBadge(count)}</VisuallyHidden>
    </span>
  );
}

// PAGE_MAP lists routes that the router does not know yet (/publications, /automations): their pages
// are added by the frontend role, until then they resolve to the not-found page.
const target = (item: NavItem) => item.to as LinkProps['to'];

function NavLink({
  item,
  incidentsCount,
  onNavigate
}: {
  item: NavItem;
  incidentsCount: number;
  onNavigate?: () => void;
}) {
  return (
    <Link to={target(item)} activeOptions={{ exact: item.exact ?? false }} className={styles.link} onClick={onNavigate}>
      <Icon name={item.icon} size={20} />
      <span className={styles.linkLabel}>{item.label}</span>
      {item.badge === 'incidents' && incidentsCount > 0 ? <NavBadge count={incidentsCount} /> : null}
    </Link>
  );
}

export function AppShell({ children, incidentsCount = 0, ownerName, onLogout, onOpenSearch }: Props) {
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

  const primary = NAV_ITEMS.filter((item) => item.primary);
  const secondary = NAV_ITEMS.filter((item) => !item.primary);
  const owner = ownerName?.trim() || ru.shell.ownerFallback;

  return (
    <div className={styles.shell}>
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
        <nav aria-label={ru.nav.label} className={styles.nav}>
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} item={item} incidentsCount={incidentsCount} />
          ))}
        </nav>
        <div className={styles.owner}>
          <span className={styles.avatar} aria-hidden="true">
            {owner.slice(0, 1).toUpperCase()}
          </span>
          <span className={styles.ownerText}>
            <strong>{owner}</strong>
            {ownerName?.trim() ? <small>{ru.shell.ownerRole}</small> : null}
          </span>
        </div>
      </aside>

      <div className={styles.column}>
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
          <OwnerMenu ownerName={ownerName} onLogout={onLogout} />
        </header>
        <main id="main" ref={mainRef} tabIndex={-1} className={styles.main}>
          {children}
        </main>
      </div>

      <nav aria-label={ru.nav.label} className={styles.tabbar}>
        {primary.map((item) => (
          <NavLink key={item.to} item={item} incidentsCount={incidentsCount} />
        ))}
        <AriaButton
          className={styles.tab}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          onPress={() => setMoreOpen(true)}
        >
          <Icon name="menu" size={22} />
          <span className={styles.linkLabel}>{ru.nav.more}</span>
          {incidentsCount > 0 ? (
            <span className={styles.dot}>
              <VisuallyHidden>{ru.nav.incidentsBadge(incidentsCount)}</VisuallyHidden>
            </span>
          ) : null}
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
