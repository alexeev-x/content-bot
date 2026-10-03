import { createApp } from './app/create-app';
import { handleScheduled } from './app/scheduled';

const app = createApp();

export default {
  fetch: app.fetch,
  scheduled: (controller) => handleScheduled(controller),
} satisfies ExportedHandler<Env>;
