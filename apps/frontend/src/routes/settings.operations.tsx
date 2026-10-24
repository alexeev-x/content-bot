import { createFileRoute, redirect } from '@tanstack/react-router';

// Old address (time zone page): kept so bookmarks and Telegram links still land on the merged page.
export const Route = createFileRoute('/settings/operations')({
  beforeLoad: () => {
    throw redirect({ to: '/settings/general', replace: true });
  }
});
