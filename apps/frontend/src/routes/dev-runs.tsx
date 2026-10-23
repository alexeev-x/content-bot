import { createFileRoute } from '@tanstack/react-router';
import { DevRunsPage } from '../pages/dev-runs/DevRunsPage';

// DEV only, removed after the check before the release (owner, 23.10.2026).
export const Route = createFileRoute('/dev-runs')({ component: DevRunsPage });
