import { createApp } from './app/create-app';
import { createContainer } from './app/container';
import { handleScheduled } from './app/scheduled';

const app = createApp();

export default {
  fetch: app.fetch,
  scheduled: (controller, env) => handleScheduled(controller, createContainer(env))
} satisfies ExportedHandler<Env>;
