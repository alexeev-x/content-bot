import { ru } from '../shared/lib/ru';
import { EmptyState, PageHeader } from '../shared/ui';

type Props = { title: string };

export function InDevelopmentPage({ title }: Props) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState title={ru.inDevelopment.title} description={ru.inDevelopment.description} />
    </>
  );
}
