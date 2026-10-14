import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { DashboardPage } from '../pages/DashboardPage';

// `id` opens a publication's panel over Обзор, so Back closes it and the link can be shared.
const searchSchema = z.object({ id: z.uuid().optional().catch(undefined) });

export const Route = createFileRoute('/')({
  validateSearch: searchSchema,
  component: DashboardRoute
});

function DashboardRoute() {
  const { id } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <DashboardPage
      openPublicationId={id}
      onOpenPublicationChange={(next) => void navigate({ search: { id: next }, replace: next === undefined })}
    />
  );
}
