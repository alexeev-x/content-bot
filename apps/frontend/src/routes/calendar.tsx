import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { CalendarPage } from '../pages/calendar/CalendarPage';

const searchSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  view: z.enum(['day', 'week', 'month']).optional().catch(undefined),
  destination: z
    .union([z.literal('all'), z.string().uuid()])
    .optional()
    .catch(undefined),
  id: z.string().uuid().optional().catch(undefined)
});

export const Route = createFileRoute('/calendar')({
  validateSearch: searchSchema,
  component: CalendarRoute
});

function CalendarRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <CalendarPage
      search={search}
      onSearchChange={(patch, replace) => void navigate({ search: (previous) => ({ ...previous, ...patch }), replace })}
    />
  );
}
