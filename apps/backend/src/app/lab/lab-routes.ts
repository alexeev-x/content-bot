import { sendRubricSampleInputSchema, sendRubricSampleResponseSchema, sourceEventIdSchema } from '@alexeev/contracts';
import { Hono } from 'hono';
import { z } from 'zod';
import { AppError } from '../../shared/app-error';
import type { AppBindings } from '../env';
import { rateLimit } from '../rate-limit';
import { requestSourceAiDraft } from '../source-ai-draft-request';
import { validated } from '../validation';

// Each press is one queued job: up to five data calls, the AI writer's caption, two drawn pictures and two screenshots
// (of 10 free browser minutes a day).
const SAMPLES_LIMIT = 40;
const SAMPLES_WINDOW_MS = 10 * 60 * 1000;
// Shares the AI writer's budget with «Написать через ИИ» (the same rate-limit name), as the old studio button did.
const AUTOPUBLISH_LIMIT = 10;

/**
 * «Тестирование» (owner, 26.10.2026): every DEV-only tool under one prefix, behind the session guard. Only
 * src/index.ts mounts it, behind the `__LAB__` build constant, so a production build has neither the routes nor the
 * code they reach; there the prefix answers 404 like any unknown route. Built inside the function so nothing runs
 * at import time and the bundler can drop the whole folder.
 */
export function mountLab(app: Hono<AppBindings>): void {
  app.route(
    '/api/v1/lab',
    new Hono<AppBindings>()
      // The pressed rubric, written by the AI with its picture, to the owner's chat. The pictures take minutes, so the
      // job goes through Queue AI_JOBS and the answer only says it is queued.
      .post(
        '/rubrics',
        rateLimit({ name: 'rubric-samples', limit: SAMPLES_LIMIT, windowMs: SAMPLES_WINDOW_MS }),
        validated('json', sendRubricSampleInputSchema),
        async (c) => {
          const container = c.get('container');
          if (container.botToken === null || container.ownerChatId === null) {
            throw new AppError('UNAVAILABLE', 'The bot or the owner chat is not configured', {
              reason: 'BOT_NOT_CONFIGURED'
            });
          }
          const { rubric } = c.req.valid('json');
          await container.aiJobs.send({ id: container.newId(), kind: 'rubric_sample', rubric });
          return c.json(sendRubricSampleResponseSchema.parse({ rubric, queued: true }), 202);
        }
      )
      // A Steam announcement the whole automatic way, as if Cron had just found it (owner, 23.10.2026): written,
      // fact-checked and published without the owner when DEV's automatic publishing is on.
      .post(
        '/autopublish/:id',
        rateLimit({ name: 'source-ai-draft', limit: AUTOPUBLISH_LIMIT, windowMs: SAMPLES_WINDOW_MS }),
        validated('param', z.strictObject({ id: sourceEventIdSchema })),
        async (c) => c.json(await requestSourceAiDraft(c, c.req.valid('param').id, true), 202)
      )
  );
}
