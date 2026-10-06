import type { Container } from './container';

// Cron entry point. Dispatch (reconcile -> claim -> send) arrives with the publishing use cases;
// today a tick only leaves a trace so the trigger is observable.
export async function handleScheduled(
  controller: ScheduledController,
  container: Pick<Container, 'clock' | 'logger'>
): Promise<void> {
  container.logger.info({
    component: 'scheduled',
    operation: 'tick',
    cron: controller.cron,
    at: controller.scheduledTime
  });
}
