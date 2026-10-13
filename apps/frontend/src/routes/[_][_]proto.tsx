import { createFileRoute, notFound } from '@tanstack/react-router';
import { ProtoApp } from '../pages/prototypes/ProtoApp';

const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
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
    update: text(search['update']),
    page: page(search['page']),
    mini: text(search['mini'])
  }),
  component: ProtoApp
});
