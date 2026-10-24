import { Link } from '@tanstack/react-router';
import { ru } from '../shared/lib/ru';
import { EmptyState, PageHeader, Panel } from '../shared/ui';

export function NotFoundPage() {
  return (
    <>
      <PageHeader title={ru.pages.notFound} />
      <Panel>
        <EmptyState
          icon="search"
          title={ru.pages.notFound}
          description={ru.notFound.description}
          action={<Link to="/">{ru.notFound.back}</Link>}
        />
      </Panel>
    </>
  );
}
