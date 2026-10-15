import { createFileRoute } from '@tanstack/react-router';
import { AnalyticsSourcesPage } from '../pages/settings/AnalyticsSourcesPage';

export const Route = createFileRoute('/settings/analytics')({ component: AnalyticsSourcesPage });
