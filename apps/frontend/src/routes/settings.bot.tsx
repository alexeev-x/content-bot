import { createFileRoute } from '@tanstack/react-router';
import { BotPage } from '../pages/settings/BotPage';

export const Route = createFileRoute('/settings/bot')({ component: BotPage });
