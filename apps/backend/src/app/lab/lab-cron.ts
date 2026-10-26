import type { BackgroundJob, BackgroundSettings } from '@alexeev/contracts';

/** «Тестирование» → «Фоновые задачи» in the Cron; handleScheduled gets it only from a `__LAB__` build (src/index.ts). */
export type LabCron = {
  backgroundOn: (job: BackgroundJob, read: () => Promise<BackgroundSettings>) => Promise<boolean>;
};

// Owner, 25.10.2026: «на дев убрать кроны, чтобы не тратилось». A background job runs only when switched on;
// publishing, reconcile and cleanup never ask. Production has no lab and runs them all.
export const labCron: LabCron = {
  backgroundOn: async (job, read) => {
    const background = await read();
    return background.enabled && background.jobs[job];
  }
};
