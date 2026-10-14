import { createFileRoute } from '@tanstack/react-router';
import { readAppEnvironment, showEnvironmentBadge } from '../app/environment';
import { NotFoundPage } from '../pages/NotFoundPage';
import { DashboardPage } from '../pages/DashboardPage';

// DEV-only design trial (owner, 14.10.2026): the widget showcase is never served in production.
export const Route = createFileRoute('/lab')({
  component: function LabRoute() {
    return showEnvironmentBadge(readAppEnvironment()) ? <DashboardPage lab /> : <NotFoundPage />;
  }
});
