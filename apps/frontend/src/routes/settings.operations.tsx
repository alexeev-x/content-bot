import { createFileRoute } from '@tanstack/react-router';
import { OperationsPage } from '../pages/settings/OperationsPage';

export const Route = createFileRoute('/settings/operations')({ component: OperationsPage });
