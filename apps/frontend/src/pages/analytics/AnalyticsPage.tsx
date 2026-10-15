import { useNavigate, useSearch } from '@tanstack/react-router';
import { useDocumentTitle } from '../../app/use-document-title';
import { AnalyticsBoard, RefreshAnalyticsButton } from '../../features/content-analytics';
import { useOwnerTimezone } from '../../features/owner-settings';
import { ru } from '../../shared/lib/ru';
import { PageHeader } from '../../shared/ui';

export function AnalyticsPage() {
  useDocumentTitle(ru.pages.analytics);
  const timezone = useOwnerTimezone();
  const search = useSearch({ from: '/analytics' });
  const navigate = useNavigate({ from: '/analytics' });
  return (
    <>
      <PageHeader title={ru.pages.analytics} focusHeadingOnMount actions={<RefreshAnalyticsButton />} />
      <AnalyticsBoard
        timezone={timezone}
        platform={search.platform}
        onPlatformChange={(platform) =>
          void navigate({ search: (previous) => ({ ...previous, platform }), replace: true })
        }
        openId={search.id}
        onOpenChange={(id) => void navigate({ search: (previous) => ({ ...previous, id }) })}
      />
    </>
  );
}
