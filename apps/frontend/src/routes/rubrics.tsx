import { rubricKeySchema } from '@alexeev/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { RubricsPage } from '../pages/rubrics/RubricsPage';

// `rubric` opens that rubric's drawer (a link from «Публикации»).
const rubricsSearchSchema = z.object({ rubric: rubricKeySchema.optional().catch(undefined) }).catch({});

export const Route = createFileRoute('/rubrics')({ validateSearch: rubricsSearchSchema, component: RubricsPage });
