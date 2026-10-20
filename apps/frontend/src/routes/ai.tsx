import { AI_WRITER_FORMATS } from '@alexeev/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { AiEditorPage } from '../pages/ai/AiEditorPage';

const aiSearchSchema = z
  .looseObject({
    tab: z.enum(['drafts', 'learning', 'spend']).optional().catch(undefined),
    /** The draft open in «Черновики». */
    draft: z.uuid().optional().catch(undefined),
    // «Черновики» table: defaults are left out of the URL (source=bot, sort by date, newest first, page 1).
    q: z.string().trim().min(1).max(100).optional().catch(undefined),
    source: z.enum(['studio', 'all']).optional().catch(undefined),
    format: z.enum(AI_WRITER_FORMATS).optional().catch(undefined),
    outcome: z.enum(['approved', 'edited', 'open', 'feedback']).optional().catch(undefined),
    sort: z.enum(['cost', 'versions']).optional().catch(undefined),
    dir: z.literal('asc').optional().catch(undefined),
    page: z.number().int().min(2).max(1000).optional().catch(undefined)
  })
  .catch({});

export const Route = createFileRoute('/ai')({ validateSearch: aiSearchSchema, component: AiEditorPage });
