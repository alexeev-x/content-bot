import { createFileRoute, notFound } from '@tanstack/react-router';
import { ProtoApp } from '../pages/prototypes/ProtoApp';

const text = (value: unknown) => (typeof value === 'string' ? value : undefined);

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
    mini: text(search['mini'])
  }),
  component: ProtoApp
});
