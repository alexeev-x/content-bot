import { createFileRoute, redirect } from '@tanstack/react-router';

// The old «Редкие состояния» page: its content moved into «Рубрики».
export const Route = createFileRoute('/lab/states')({
  beforeLoad: () => {
    throw redirect({ to: '/lab/rubrics', replace: true });
  }
});
