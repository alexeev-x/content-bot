import { createFileRoute, redirect } from '@tanstack/react-router';

// Old address (notifications page): merged into «Общие».
export const Route = createFileRoute('/settings/notifications')({
  beforeLoad: () => {
    throw redirect({ to: '/settings/general', replace: true });
  }
});
