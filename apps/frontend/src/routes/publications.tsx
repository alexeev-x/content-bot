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
          // Any filter change starts again from page 1; opening a row or paging keeps the page.
          search: (previous: PublicationsSearch) => ({
            ...previous,
            ...(Object.keys(patch).some((key) => key !== 'id' && key !== 'page') ? { page: undefined } : {}),
            ...patch
          }),
          replace: options?.replace ?? false
        })
      }
      onOpenPosts={() => void navigate({ to: '/posts' })}
    />
  );
}
