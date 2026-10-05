import { createRouter } from '@tanstack/react-router';
import { RouteError } from './layouts/RouteError';
import { routeTree } from '../routeTree.gen';

export const router = createRouter({ routeTree, defaultPreload: 'intent', defaultErrorComponent: RouteError });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
