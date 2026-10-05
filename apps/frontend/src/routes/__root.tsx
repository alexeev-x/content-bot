import { createRootRoute } from '@tanstack/react-router';
import { AppLayout } from '../app/layouts/AppLayout';
import { RouteError } from '../app/layouts/RouteError';
import { NotFoundPage } from '../pages/NotFoundPage';

export const Route = createRootRoute({
  component: AppLayout,
  notFoundComponent: NotFoundPage,
  errorComponent: RouteError
});
