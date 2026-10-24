import { createFileRoute } from '@tanstack/react-router';
import { AppearancePage } from '../pages/settings/AppearancePage';

export const Route = createFileRoute('/settings/appearance')({ component: AppearancePage });
