import type { DashboardWidget } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { dashboardLayoutQueryOptions } from '../api/layout-queries';
import { DEFAULT_WIDGETS } from './default-layout';
import { readCachedLayout } from './layout-cache';

/** The layout to draw before the server answers (and when it cannot): the cached copy, otherwise the default. */
export function initialWidgets(): readonly DashboardWidget[] {
  return readCachedLayout()?.widgets ?? DEFAULT_WIDGETS;
}

/**
 * The layout the owner sees: the server copy once loaded (revision 0 = never saved = the default), meanwhile the
 * cached copy, otherwise the default. A failed load keeps showing the cached or default layout.
 */
export function useDashboardLayout() {
  const query = useQuery(dashboardLayoutQueryOptions());
  const [cached] = useState(readCachedLayout);
  const server = query.data;
  const widgets = server
    ? server.revision === 0
      ? DEFAULT_WIDGETS
      : server.widgets
    : (cached?.widgets ?? DEFAULT_WIDGETS);
  return {
    query,
    widgets,
    /**
     * The layout is known well enough to start reading widget data: the server answered, a cached copy exists,
     * or the load failed and the default stands in. Before that the default is only a guess, so nothing is requested
     * for it (queries run only for the widgets that are really on the page).
     */
    settled: server !== undefined || cached !== null || query.isError,
    /** The revision a save is based on; undefined until the server has answered. */
    revision: server?.revision
  };
}
