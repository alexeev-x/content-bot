import { sendRubricSampleInputSchema, sendRubricSampleResponseSchema } from '@alexeev/contracts';
import { Hono } from 'hono';
import { AppError } from '../shared/app-error';
import type { AppBindings } from './env';
import { rateLimit } from './rate-limit';
import { validated } from './validation';

// Each press is one queued job: up to five data calls, the AI writer's caption, two drawn pictures and two screenshots
// (of 10 free browser minutes a day).
const SAMPLES_LIMIT = 40;
const SAMPLES_WINDOW_MS = 10 * 60 * 1000;

export const rubricSamplesRoutes = new Hono<AppBindings>()
  // DEV only (owner, 25.10.2026): the pressed rubric, written by the AI with pictures A and B, to the owner's chat. The
  // pictures take minutes, so the job goes through Queue AI_JOBS and the answer only says it is queued.
  .post(
    '/',
    rateLimit({ name: 'rubric-samples', limit: SAMPLES_LIMIT, windowMs: SAMPLES_WINDOW_MS }),
    validated('json', sendRubricSampleInputSchema),
    async (c) => {
      const container = c.get('container');
      if (container.rubricSamples === null) {
        throw new AppError('FORBIDDEN', 'Rubric samples are off here', { reason: 'RUBRIC_SAMPLES_OFF' });
      }
      if (container.botToken === null || container.ownerChatId === null) {
        throw new AppError('UNAVAILABLE', 'The bot or the owner chat is not configured', {
          reason: 'BOT_NOT_CONFIGURED'
        });
      }
      const { rubric } = c.req.valid('json');
      await container.aiJobs.send({ id: container.newId(), kind: 'rubric_sample', rubric });
      return c.json(sendRubricSampleResponseSchema.parse({ rubric, queued: true }), 202);
    }
  );
