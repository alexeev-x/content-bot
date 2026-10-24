import { createFileRoute } from '@tanstack/react-router';
import { AiSettingsPage } from '../features/ai-settings';

export const Route = createFileRoute('/settings/ai')({ component: AiSettingsPage });
