import { createFileRoute } from '@tanstack/react-router';
import { NotificationsPage } from '../pages/settings/NotificationsPage';

export const Route = createFileRoute('/settings/notifications')({ component: NotificationsPage });
