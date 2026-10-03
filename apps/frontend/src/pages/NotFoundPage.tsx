import { Link } from '@tanstack/react-router';
import { ru } from '../shared/lib/ru';
import { EmptyState, PageHeader } from '../shared/ui';

export function NotFoundPage() {
  return (
    <>
      <PageHeader title={ru.pages.notFound} />
      <EmptyState
        title={ru.pages.notFound}
        description={ru.notFound.description}
        action={<Link to="/">{ru.notFound.back}</Link>}
      />
    </>
  );
}
