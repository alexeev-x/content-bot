import { Hono } from 'hono';
import type { AppEnv } from 'src/types/env';

/** Роутер модуля. Единственный корневой app собирается в src/index.ts. */
export const createRouter = () => new Hono<AppEnv>();
