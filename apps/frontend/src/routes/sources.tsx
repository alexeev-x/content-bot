import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { SourcesPage } from '../pages/sources/SourcesPage';

const sourcesSearchSchema = z
  .looseObject({
    update: z.string().max(120).optional(),
    tab: z.enum(['updates', 'sources', 'heroes']).optional().catch(undefined)
  })
  .catch({});

export const Route = createFileRoute('/sources')({ validateSearch: sourcesSearchSchema, component: SourcesPage });
