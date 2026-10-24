import { createFileRoute } from '@tanstack/react-router';
import { GeneralPage } from '../pages/settings/GeneralPage';

export const Route = createFileRoute('/settings/general')({ component: GeneralPage });
