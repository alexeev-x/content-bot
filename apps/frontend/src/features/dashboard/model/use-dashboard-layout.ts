import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { dashboardLayoutQueryOptions } from '../api/layout-queries';
import { readCachedLayout } from './layout-cache';
import { DEFAULT_LAYOUT, fromServer, type LayoutItem } from './widget-catalog';

/**
 * The layout the owner sees: the server copy once loaded (revision 0 = never saved = the default), meanwhile the
 * cached copy of the last save, otherwise the default. A failed load keeps showing the cached or default layout.
 */
export function useDashboardLayout(): {
  items: readonly LayoutItem[];
  /** The revision a save is based on; undefined until the server has answered. */
  revision: number | undefined;
  isDefault: boolean;
} {
  const query = useQuery(dashboardLayoutQueryOptions());
  const [cached] = useState(readCachedLayout);
  const server = query.data;
  const source = server ?? cached;
  const items = source && source.revision > 0 ? fromServer(source.widgets) : DEFAULT_LAYOUT;
  return { items, revision: server?.revision, isDefault: !source || source.revision === 0 };
}
