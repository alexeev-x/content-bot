import { createFileRoute } from '@tanstack/react-router';
import { InDevelopmentPage } from '../pages/InDevelopmentPage';
import { ru } from '../shared/lib/ru';

export const Route = createFileRoute('/media')({
  component: () => <InDevelopmentPage title={ru.pages.media} />,
});
