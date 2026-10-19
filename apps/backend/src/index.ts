import { handleAiQueue } from './app/ai-queue';
import { createApp } from './app/create-app';
import { createContainer } from './app/container';
import type { AppEnv } from './app/env';
import { mountLocalSignIn } from './app/local-sign-in-route';
import { handleScheduled } from './app/scheduled';

// True only under `vite serve` (apps/frontend/vite.config.ts). A build gets the literal `false`, so the bundler
// drops the local sign-in module; `wrangler dev` and tests have no constant at all.
declare const __LOCAL_SIGN_IN__: boolean | undefined;

const app = createApp(
  typeof __LOCAL_SIGN_IN__ === 'boolean' && __LOCAL_SIGN_IN__ ? { mountBeforeGuard: mountLocalSignIn } : {}
);

export default {
  fetch: app.fetch,
  scheduled: (controller, env) => handleScheduled(controller, createContainer(env)),
  queue: (batch, env) => handleAiQueue(batch, createContainer(env), env.TELEGRAM_BOT_TOKEN?.trim() ?? '')
} satisfies ExportedHandler<AppEnv>;
