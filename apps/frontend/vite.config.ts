import { cloudflare } from '@cloudflare/vite-plugin';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Telegram Login Widget bot per environment (public usernames, not secrets). The single mapping lives here:
// CLOUDFLARE_ENV=production uses the production bot; `dev` and a local run without CLOUDFLARE_ENV use the dev bot.
const TELEGRAM_BOT_USERNAMES = { dev: 'dota_content_dev_bot', production: 'dota_content_bot' } as const;
const telegramBotUsername =
  process.env['CLOUDFLARE_ENV'] === 'production' ? TELEGRAM_BOT_USERNAMES.production : TELEGRAM_BOT_USERNAMES.dev;

// One build, one deploy: Vite builds the SPA and the Cloudflare plugin bundles the Worker
// from apps/backend, so dev, preview and deploy run the real Worker (API, webhook, Cron).
export default defineConfig({
  // The DEV badge reads this (src/app/environment.ts): CI exports CLOUDFLARE_ENV=production|dev for the build.
  define: {
    __APP_ENV__: JSON.stringify(process.env['CLOUDFLARE_ENV'] ?? ''),
    __TELEGRAM_BOT_USERNAME__: JSON.stringify(telegramBotUsername)
  },
  // Small font subsets would be inlined as `data:` URLs, which the CSP (`public/_headers`, no font-src) blocks.
  // Keep fonts as same-origin files instead of loosening the policy.
  build: { assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined) },
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    cloudflare({ configPath: '../backend/wrangler.jsonc' })
  ]
});
