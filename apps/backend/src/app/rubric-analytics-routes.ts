import {
  type RubricComments,
  type RubricCompare,
  rubricCommentsQuerySchema,
  rubricCompareQuerySchema,
  type RubricPosts,
  rubricPostsQuerySchema,
  type RubricLearning,
  updateRubricLearningInputSchema
} from '@alexeev/contracts';
import { Hono } from 'hono';
import {
  readRubricComments,
  readRubricCompare,
  readRubricLearning,
  readRubricPosts
} from '../modules/rubric-analytics';
import { AppError } from '../shared/app-error';
import type { Container } from './container';
import type { AppBindings } from './env';
import { rateLimit } from './rate-limit';
import { POOL_RUBRICS } from './rubric-analytics/pool';
import { limitBody, validated } from './validation';

// «Рубрики» → «Аналитика» (rubric scheduler stage 7): how each rubric lands against the channel's usual post, its
// posts and slices, what readers say. Thin handlers over modules/rubric-analytics read models.

const READS_PER_MINUTE = 60;
const MINUTE_MS = 60_000;
/** Comment text is kept 10 days (owner, 31.10.2026: answer 1). */
const TEXT_KEPT_DAYS = 10;
const MAX_BODY_BYTES = 256;

/** Before migration 0121 the reads meet «no such table»: an honest 503, not a 500. */
async function guarded<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof Error && /no such table/i.test(error.message))
      throw new AppError('UNAVAILABLE', 'Rubric analytics tables are missing', { reason: 'MIGRATION_PENDING' });
    throw error;
  }
}

function readDeps(container: Container) {
  const sources = container.rubricAnalyticsSources;
  return {
    scores: container.rubricScores,
    sources,
    now: container.clock.now(),
    url: (messageId: number) => (sources.channel === null ? null : `https://t.me/${sources.channel}/${messageId}`)
  };
}

export const rubricAnalyticsRoutes = new Hono<AppBindings>()
  .use(rateLimit({ name: 'rubric-analytics:read', limit: READS_PER_MINUTE, windowMs: MINUTE_MS }))
  .get('/compare', validated('query', rubricCompareQuerySchema), async (c) => {
    const body = await guarded(() => readRubricCompare(readDeps(c.get('container')), c.req.valid('query').days));
    return c.json(body as RubricCompare);
  })
  .get('/posts', validated('query', rubricPostsQuerySchema), async (c) => {
    const { rubric, days } = c.req.valid('query');
    const body = await guarded(() => readRubricPosts(readDeps(c.get('container')), rubric, days));
    return c.json(body as RubricPosts);
  })
  .get('/comments', validated('query', rubricCommentsQuerySchema), async (c) => {
    const container = c.get('container');
    const { days, rubric } = c.req.valid('query');
    const body = await guarded(async () =>
      readRubricComments(
        {
          ...readDeps(container),
          themes: container.rubricThemes,
          audienceConnected: await container.rubricAnalyticsSources.audienceConnected(),
          textKeptDays: TEXT_KEPT_DAYS
        },
        days,
        rubric
      )
    );
    return c.json(body as RubricComments);
  })
  .get('/learning', async (c) => c.json(await guarded(() => learning(c.get('container')))))
  .put('/learning', limitBody(MAX_BODY_BYTES), validated('json', updateRubricLearningInputSchema), async (c) => {
    const container = c.get('container');
    // Setting the value it already has changes nothing (a conditional update).
    await guarded(() => container.rubricLearning.setApply(c.req.valid('json').applyEnabled, container.clock.now()));
    return c.json(await guarded(() => learning(container)));
  });

async function learning(container: Container): Promise<RubricLearning> {
  return (await readRubricLearning({
    scores: container.rubricScores,
    learning: container.rubricLearning,
    rests: container.rubricLearnedSettings.rests,
    hours: container.rubricLearnedSettings.hours,
    pool: POOL_RUBRICS,
    now: container.clock.now()
  })) as RubricLearning;
}
