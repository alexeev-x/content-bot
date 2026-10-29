import { handleAiQueue } from './app/ai-queue';
import { createApp } from './app/create-app';
import { createContainer } from './app/container';
import type { AppEnv } from './app/env';
import { createLabQueue, labCron, mountLab } from './app/lab';
import { mountLocalSignIn } from './app/local-sign-in-route';
import { handleScheduled } from './app/scheduled';

// The nightly hero statistics (wrangler.jsonc `workflows`): the runtime finds the class by this export.
export { StatsSnapshotWorkflow } from './app/workflows/hero-stats-snapshot';

// True only under `vite serve` (apps/frontend/vite.config.ts). A build gets the literal `false`, so the bundler
// drops the local sign-in module; `wrangler dev` and tests have no constant at all.
declare const __LOCAL_SIGN_IN__: boolean | undefined;
// «Тестирование» (owner, 26.10.2026): true under Vite unless CLOUDFLARE_ENV=production, which gets the literal
// `false`, so the bundler drops app/lab and what only it reaches (CI checks the production bundle for it).
// `wrangler dev` and tests have no constant, so no lab.
declare const __LAB__: boolean | undefined;

const app = createApp({
  ...(typeof __LOCAL_SIGN_IN__ === 'boolean' && __LOCAL_SIGN_IN__ ? { mountBeforeGuard: mountLocalSignIn } : {}),
  ...(typeof __LAB__ === 'boolean' && __LAB__ ? { mountLab } : {})
});

export default {
  fetch: app.fetch,
  scheduled: (controller, env) =>
    handleScheduled(controller, createContainer(env), typeof __LAB__ === 'boolean' && __LAB__ ? labCron : null),
  queue: (batch, env) =>
    handleAiQueue(
      batch,
      createContainer(env),
      env.TELEGRAM_BOT_TOKEN?.trim() ?? '',
      typeof __LAB__ === 'boolean' && __LAB__ ? createLabQueue(env) : null
    )
} satisfies ExportedHandler<AppEnv>;
