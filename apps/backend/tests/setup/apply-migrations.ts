import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { testDb } from '../helpers/db';

await applyD1Migrations(testDb(), env.TEST_MIGRATIONS);
