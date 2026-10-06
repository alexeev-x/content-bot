import { createMiddleware } from 'hono/factory';
import { AppError } from '../shared/app-error';
import type { AppBindings } from './env';

// CSRF defense of the endpoints that read the refresh cookie. The app origin is the origin of the
// request URL: the Worker serves the SPA, the Mini App and the API from one origin, so a request
// from any other page carries a different `Origin`. Browsers send it on every cross-origin and
// every same-origin POST; a missing header is refused, not trusted.
export const requireAppOrigin = createMiddleware<AppBindings>(async (c, next) => {
  const origin = c.req.header('origin');
  if (origin === undefined || origin !== new URL(c.req.url).origin) {
    throw new AppError('FORBIDDEN', 'Origin not allowed');
  }
  await next();
});
