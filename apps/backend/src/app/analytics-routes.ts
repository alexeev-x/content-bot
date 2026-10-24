import {
  eligibleObservationPublicationsPageSchema,
  eligibleObservationPublicationsQuerySchema,
  manualObservationInputSchema,
  manualObservationQuerySchema,
  manualObservationSchema,
  manualObservationsPageSchema,
  publicationAnalyticsQuerySchema
} from '@alexeev/contracts';
import { Hono } from 'hono';
import { z } from 'zod';
import { createManualObservation, readPublicationAnalytics } from '../modules/publishing';
import { AppError } from '../shared/app-error';
import type { AppBindings } from './env';
import { limitBody, validated } from './validation';

const idempotencyHeaderSchema = z.object({ 'idempotency-key': z.string().trim().min(1).max(128) });

export const analyticsRoutes = new Hono<AppBindings>()
  .get('/eligible-publications', validated('query', eligibleObservationPublicationsQuerySchema), async (c) => {
    const container = c.get('container');
    return c.json(
      eligibleObservationPublicationsPageSchema.parse(
        await container.publicationAnalytics.listEligiblePublications(c.req.valid('query'))
      )
    );
  })
  .get('/observations', validated('query', manualObservationQuerySchema), async (c) => {
    const container = c.get('container');
    return c.json(
      manualObservationsPageSchema.parse(await container.publicationAnalytics.listObservations(c.req.valid('query')))
    );
  })
  .post(
    '/observations',
    limitBody(4096),
    validated('header', idempotencyHeaderSchema),
    validated('json', manualObservationInputSchema),
    async (c) => {
      const container = c.get('container');
      const db = c.env.DB;
      if (db === undefined) throw new AppError('UNAVAILABLE', 'Database is not configured');
      const observation = await createManualObservation(
        {
          repo: container.publicationAnalytics,
          idempotency: container.idempotency,
          now: container.clock.now(),
          newId: container.newId
        },
        {
          actor: c.get('actor').telegramId,
          idempotencyKey: c.req.valid('header')['idempotency-key'],
          input: c.req.valid('json')
        }
      );
      return c.json(manualObservationSchema.parse(observation), 201);
    }
  )
  .get('/publications', validated('query', publicationAnalyticsQuerySchema), async (c) => {
    const container = c.get('container');
    return c.json(
      await readPublicationAnalytics(
        { repo: container.publicationAnalytics, now: container.clock.now() },
        c.req.valid('query')
      )
    );
  });
