import { useNavigate, useSearch } from '@tanstack/react-router';
import { useDocumentTitle } from '../../app/use-document-title';
import { AnalyticsBoard, type AnalyticsView, RefreshAnalyticsButton } from '../../features/content-analytics';
import { useOwnerTimezone } from '../../features/owner-settings';
import { ru } from '../../shared/lib/ru';
import { PageHeader } from '../../shared/ui';

export function AnalyticsPage() {
  useDocumentTitle(ru.pages.analytics);
  const timezone = useOwnerTimezone();
  const search = useSearch({ from: '/analytics' });
  const navigate = useNavigate({ from: '/analytics' });
  const view: AnalyticsView = {
    days: search.days ?? 30,
    platform: search.platform,
    page: search.page ?? 1,
    sort: { column: search.sort ?? 'published', direction: search.dir === 'asc' ? 'ascending' : 'descending' },
    openId: search.id
  };
  const onViewChange = (patch: Partial<AnalyticsView>) =>
    void navigate({
      search: (previous) => {
        const next = { ...view, ...patch };
        return {
          ...previous,
          days: next.days === 30 ? undefined : next.days,
          platform: next.platform,
          page: next.page === 1 ? undefined : next.page,
          sort: next.sort.column === 'published' ? undefined : (next.sort.column as typeof previous.sort),
          dir: next.sort.direction === 'ascending' ? ('asc' as const) : undefined,
          id: next.openId
        };
      },
      // Opening an item is a step back can undo; filters and pages replace the entry.
      replace: !('openId' in patch)
    });
  return (
    <>
      <PageHeader title={ru.pages.analytics} focusHeadingOnMount actions={<RefreshAnalyticsButton />} />
      <AnalyticsBoard timezone={timezone} view={view} onViewChange={onViewChange} />
    </>
  );
}
