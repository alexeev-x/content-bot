import { createFileRoute, notFound } from '@tanstack/react-router';
import { CatalogPage } from '../pages/CatalogPage';

// Dev-only token catalog: screenshots and axe check it. Not linked from the navigation and absent in production.
export const Route = createFileRoute('/__catalog')({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: CatalogPage
});
