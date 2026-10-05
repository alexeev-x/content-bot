import { createFileRoute } from '@tanstack/react-router';
import { InDevelopmentPage } from '../../pages/InDevelopmentPage';
import { ru } from '../../shared/lib/ru';

export const Route = createFileRoute('/posts/$id')({
  component: () => <InDevelopmentPage title={ru.pages.postEdit} />
});
