import { cloudflare } from '@cloudflare/vite-plugin';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// One build, one deploy: Vite builds the SPA and the Cloudflare plugin bundles the Worker
// from apps/backend, so dev, preview and deploy run the real Worker (API, webhook, Cron).
export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    cloudflare({ configPath: '../backend/wrangler.jsonc' }),
  ],
});
