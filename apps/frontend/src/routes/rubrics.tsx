import { createFileRoute } from '@tanstack/react-router';
import { RubricsPage } from '../pages/rubrics/RubricsPage';

export const Route = createFileRoute('/rubrics')({ component: RubricsPage });
