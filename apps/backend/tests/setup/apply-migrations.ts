import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { testDb, testStatsDb } from '../helpers/db';

await applyD1Migrations(testDb(), env.TEST_MIGRATIONS);
await applyD1Migrations(testStatsDb(), env.TEST_STATS_MIGRATIONS);
