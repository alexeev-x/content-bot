import { createMiddleware } from 'hono/factory';
import { authenticateOwner } from '../modules/identity';
import type { AppBindings } from './env';

// Guards every /api/v1/* route that is not explicitly public. It runs before validation and
// handlers, and any failure (including a database error) ends the request: the API fails closed.
export const requireOwner = createMiddleware<AppBindings>(async (c, next) => {
  const container = c.get('container');
  // `sessions` is read lazily, after the header check, so an anonymous request is a plain 401
  // even where the database is not configured.
  const deps = {
    get sessions() {
      return container.sessions;
    },
    ownerTelegramId: c.env.OWNER_TELEGRAM_ID,
    now: container.clock.now()
  };
  const actor = await authenticateOwner(deps, c.req.header('authorization'));
  c.set('actor', actor);
  await next();
});
