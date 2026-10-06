import { env } from 'cloudflare:workers';

export function testDb(): D1Database {
  if (env.DB === undefined) throw new Error('The test D1 binding is missing');
  return env.DB;
}
