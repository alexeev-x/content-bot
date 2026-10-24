import { createFileRoute, redirect } from '@tanstack/react-router';

// Incidents merged into «Публикации → Ошибки»; keep old bookmarks working.
export const Route = createFileRoute('/incidents')({
  beforeLoad: () => {
    throw redirect({ to: '/publications', search: { view: 'errors' }, replace: true });
  }
});
