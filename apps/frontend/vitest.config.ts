import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Component tests run in jsdom without the Cloudflare plugin; the API is mocked with MSW.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    // jsdom workers are memory-heavy; the default (one per core) overloads a 16 GB laptop.
    maxWorkers: process.env.CI ? undefined : 4
  }
});
