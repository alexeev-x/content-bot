import { NAV_ITEMS } from './layouts/nav-items';

const TAB_ROOTS: ReadonlySet<string> = new Set(NAV_ITEMS.map((item) => item.to));

const normalize = (pathname: string) => (pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname);

/** A top-level destination from the navigation: Telegram's BackButton is hidden there. */
export function isTabRoot(pathname: string): boolean {
  return TAB_ROOTS.has(normalize(pathname));
}

/** The route one level up (`/posts/new` → `/posts`), used when there is no in-app history to go back to. */
export function parentPath(pathname: string): string {
  const path = normalize(pathname);
  const cut = path.lastIndexOf('/');
  return cut <= 0 ? '/' : path.slice(0, cut);
}
