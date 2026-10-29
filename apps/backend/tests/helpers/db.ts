import { env } from 'cloudflare:workers';

export function testStatsDb(): D1Database {
  if (env.STATS_DB === undefined) throw new Error('The test statistics D1 binding is missing');
  return env.STATS_DB;
}

export function testDb(): D1Database {
  if (env.DB === undefined) throw new Error('The test D1 binding is missing');
  return env.DB;
}
