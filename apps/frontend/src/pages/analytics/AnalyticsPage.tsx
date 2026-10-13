import { useNavigate, useSearch } from '@tanstack/react-router';
import { AnalyticsReport } from '../../features/analytics';
import { useOwnerTimezone } from '../../features/owner-settings';
import type { PublicationsSearch } from '../publications/search';

export function AnalyticsPage() {
  const search = useSearch({ from: '/analytics' });
  const navigate = useNavigate({ from: '/analytics' });
  const timezone = useOwnerTimezone();
  return (
    <AnalyticsReport
      search={search}
      timezone={timezone}
      onSearchChange={(patch, options) =>
        void navigate({
          search: (previous) => ({ ...previous, ...patch }),
          replace: options?.replace ?? false
        })
      }
      onOpenPublication={(id) =>
        void navigate({ to: '/publications', search: (previous: PublicationsSearch) => ({ ...previous, id }) })
      }
      onLogin={() => void navigate({ to: '/login' })}
    />
  );
}
