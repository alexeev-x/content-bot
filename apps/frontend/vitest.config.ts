import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Component tests run in jsdom without the Cloudflare plugin; the API is mocked with MSW.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}']
  }
});
