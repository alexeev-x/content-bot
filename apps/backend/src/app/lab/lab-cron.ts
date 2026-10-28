import type { BackgroundJob, BackgroundSettings } from '@alexeev/contracts';

/** «Тестирование» → «Фоновые задачи» in the Cron; handleScheduled gets it only from a `__LAB__` build (src/index.ts). */
export type LabCron = {
  /** The master switch: off, the whole tick stops before it touches D1 beyond reading the switch. */
  cronOn: (read: () => Promise<BackgroundSettings>) => Promise<boolean>;
  backgroundOn: (job: BackgroundJob, read: () => Promise<BackgroundSettings>) => Promise<boolean>;
};

// Owner, 25.10.2026: «на дев убрать кроны, чтобы не тратилось»; 28.10.2026: «дев максимально отключить кроны… к базе».
// With the master switch off DEV's Cron does nothing at all; on, publishing, reconcile and cleanup run and a background
// job runs only when its own switch is on. Production has no lab and runs them all.
export const labCron: LabCron = {
  cronOn: async (read) => (await read()).enabled,
  backgroundOn: async (job, read) => {
    const background = await read();
    return background.enabled && background.jobs[job];
  }
};
