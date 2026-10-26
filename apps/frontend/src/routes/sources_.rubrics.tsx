import { createFileRoute } from '@tanstack/react-router';
import { RubricSamplesPage } from '../pages/sources/RubricSamplesPage';

export const Route = createFileRoute('/sources_/rubrics')({ component: RubricSamplesPage });
