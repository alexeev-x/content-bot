import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useDocumentTitle } from '../../app/use-document-title';
import { AnalyticsBoard, type AnalyticsView, contentAnalyticsCopy } from '../../features/content-analytics';
import { useOwnerTimezone } from '../../features/owner-settings';
import { ru } from '../../shared/lib/ru';
import { useToast } from '../../shared/ui';

export function AnalyticsPage() {
  useDocumentTitle(ru.pages.analytics);
  const timezone = useOwnerTimezone();
  const search = useSearch({ from: '/analytics' });
  const navigate = useNavigate({ from: '/analytics' });
  const view: AnalyticsView = {
    tab: search.tab ?? 'overview',
    days: search.days ?? 30,
    platform: search.platform,
    page: search.page ?? 1,
    sort: { column: search.sort ?? 'published', direction: search.dir === 'asc' ? 'ascending' : 'descending' },
    openId: search.id
  };
  const toast = useToast();
  const tiktokResult = search.tiktok;
  // TikTok's redirect lands here once with the outcome: say it, then drop it from the URL so a reload is quiet.
  useEffect(() => {
    if (tiktokResult === undefined) return;
    toast.show({
      tone: tiktokResult === 'connected' ? 'success' : 'error',
      title: contentAnalyticsCopy.tiktok.result[tiktokResult]
    });
    void navigate({ search: (previous) => ({ ...previous, tiktok: undefined }), replace: true, resetScroll: false });
  }, [tiktokResult, toast, navigate]);
  const onViewChange = (patch: Partial<AnalyticsView>) =>
    void navigate({
      search: (previous) => {
        const next = { ...view, ...patch };
        return {
          ...previous,
          tab: next.tab === 'overview' ? undefined : next.tab,
          days: next.days === 30 ? undefined : next.days,
          platform: next.platform,
          page: next.page === 1 ? undefined : next.page,
          sort: next.sort.column === 'published' ? undefined : (next.sort.column as typeof previous.sort),
          dir: next.sort.direction === 'ascending' ? ('asc' as const) : undefined,
          id: next.openId
        };
      },
      // Opening an item is a step back can undo; filters and pages replace the entry.
      replace: !('openId' in patch),
      // Filters, pages and the item panel change the URL, not the page: keep the reader where they are.
      resetScroll: false
    });
  return (
    <>
      <AnalyticsBoard
        timezone={timezone}
        view={view}
        onViewChange={onViewChange}
        onOpenSettings={() => void navigate({ to: '/settings/analytics' })}
      />
    </>
  );
}
