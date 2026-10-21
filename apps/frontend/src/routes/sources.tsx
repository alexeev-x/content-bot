import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { SourcesPage } from '../pages/sources/SourcesPage';

const sourcesSearchSchema = z
  .looseObject({
    update: z.string().max(120).optional(),
    view: z.enum(['active', 'hidden', 'past']).optional().catch(undefined),
    page: z.number().int().min(1).max(1000).optional().catch(undefined),
    // The event whose side panel is open.
    open: z.string().max(120).optional().catch(undefined)
  })
  .catch({});

export const Route = createFileRoute('/sources')({ validateSearch: sourcesSearchSchema, component: SourcesPage });
