import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { AiEditorPage } from '../pages/ai/AiEditorPage';

const aiSearchSchema = z
  .looseObject({
    tab: z.enum(['drafts', 'learning', 'spend']).optional().catch(undefined),
    /** The draft open in «Черновики». */
    draft: z.uuid().optional().catch(undefined)
  })
  .catch({});

export const Route = createFileRoute('/ai')({ validateSearch: aiSearchSchema, component: AiEditorPage });
