import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { LoginPage } from '../pages/LoginPage';

const searchSchema = z.object({ redirect: z.string().max(2048).optional().catch(undefined) });

export const Route = createFileRoute('/login')({
  validateSearch: searchSchema,
  component: LoginRoute
});

function LoginRoute() {
  const { redirect } = Route.useSearch();
  return <LoginPage redirect={redirect} />;
}
