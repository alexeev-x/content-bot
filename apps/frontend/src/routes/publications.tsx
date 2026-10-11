import { createFileRoute } from '@tanstack/react-router';
import { PublicationsPage } from '../pages/publications/PublicationsPage';
import { publicationsSearchSchema, type PublicationsSearch } from '../pages/publications/search';

export const Route = createFileRoute('/publications')({
  validateSearch: publicationsSearchSchema,
  component: PublicationsRoute
});

function PublicationsRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <PublicationsPage
      search={search}
      onSearchChange={(patch, options) =>
        void navigate({
          search: (previous: PublicationsSearch) => ({ ...previous, ...patch }),
          replace: options?.replace ?? false
        })
      }
      onOpenPosts={() => void navigate({ to: '/posts' })}
    />
  );
}
