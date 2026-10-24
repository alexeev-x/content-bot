import { createMiddleware } from 'hono/factory';
import { rateLimitClientKey } from '../platform/rate-limit/client-key';
import { AppError } from '../shared/app-error';
import type { AppBindings } from './env';

// Per client, so a stranger hammering an endpoint cannot lock the owner out. `cf-connecting-ip` is
// set by Cloudflare and cannot be supplied by the caller; without it (local runs) everyone shares a
// bucket. IPv6 clients count by /64 (see rateLimitClientKey).
export function rateLimit(options: {
  name: string;
  /** A number, or one read from the request's environment (a per-environment limit). */
  limit: number | ((env: AppBindings['Bindings']) => number);
  windowMs: number;
}) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const container = c.get('container');
    const decision = await container.rateLimiter.hit({
      name: options.name,
      client: rateLimitClientKey(c.req.header('cf-connecting-ip')),
      limit: typeof options.limit === 'number' ? options.limit : options.limit(c.env),
      windowMs: options.windowMs,
      now: container.clock.now()
    });
    if (!decision.allowed) {
      c.header('retry-after', String(decision.retryAfterSec));
      throw new AppError('RATE_LIMIT', 'Too many attempts, try again later');
    }
    await next();
  });
}
