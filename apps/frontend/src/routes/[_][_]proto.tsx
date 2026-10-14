import { createFileRoute, notFound } from '@tanstack/react-router';
import { ProtoApp } from '../pages/prototypes/ProtoApp';

const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
const calendarDate = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value ? undefined : value;
};
const calendarDestination = (value: unknown) =>
  typeof value === 'string' &&
  value.length <= 80 &&
  [...value].every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
    ? value
    : undefined;
const page = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 100 ? String(parsed) : undefined;
};

// Dev-only clickable prototype on mock data (docs/design/UX_SPEC.md §6): absent in production, no network, no auth.
// This layout stays mounted across the child routes, so the in-memory mock state survives navigation.
export const Route = createFileRoute('/__proto')({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  validateSearch: (search: Record<string, unknown>) => ({
    state: text(search['state']),
    view: text(search['view']),
    id: text(search['id']),
    date: calendarDate(search['date']),
    destination: calendarDestination(search['destination']),
    update: text(search['update']),
    page: page(search['page']),
    mini: text(search['mini'])
  }),
  component: ProtoApp
});
