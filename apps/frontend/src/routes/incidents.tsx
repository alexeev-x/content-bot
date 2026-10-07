import { createFileRoute } from '@tanstack/react-router';
import { IncidentsPage } from '../pages/incidents/IncidentsPage';
import { incidentsSearchSchema } from '../pages/incidents/search';

export const Route = createFileRoute('/incidents')({
  validateSearch: incidentsSearchSchema,
  component: IncidentsRoute
});

function IncidentsRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <IncidentsPage
      search={search}
      onSearchChange={(patch) => void navigate({ search: (previous) => ({ ...previous, ...patch }) })}
      onOpenPublication={(id) => void navigate({ to: '/publications', search: { id } })}
      onOpenPublications={() => void navigate({ to: '/publications' })}
    />
  );
}
