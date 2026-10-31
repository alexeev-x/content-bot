import { createFileRoute, redirect } from '@tanstack/react-router';

// `/lab` opens its first page.
export const Route = createFileRoute('/lab/')({
  beforeLoad: () => {
    throw redirect({ to: '/lab/rubrics', replace: true });
  }
});
