import type { WriterRepository } from '../../modules/ai';
import type { ContentAlertRepository } from '../../modules/content-analytics';

// A writer job whose Worker died after its claim (review 19.10.2026): the claim keeps the model from being called
// twice, so nothing else would ever answer its «Пишу…». Cron tells the owner once, through the content alerts
// (one attempt, `unknown` never resent), so the task can be sent again.

/** Longer than a queue consumer's 15 minutes of wall time: a job still open after this is gone. */
export const LOST_AFTER_MS = 20 * 60 * 1000;
const PER_TICK = 3;
/** One read, an alert and a mark per job. */
export const LOST_JOB_STATEMENTS = 1 + 2 * PER_TICK;

export async function reportLostAiJobs(deps: {
  writer: Pick<WriterRepository, 'lostJobs' | 'markLost'>;
  alerts: Pick<ContentAlertRepository, 'insert'>;
  now: number;
}): Promise<number> {
  let reported = 0;
  for (const job of await deps.writer.lostJobs(deps.now - LOST_AFTER_MS, PER_TICK)) {
    // The alert first: its id dedups a second tick, and a mark without it would hide the job for good.
    await deps.alerts.insert(
      [
        {
          id: `ai-lost:${job.id}`,
          kind: 'item',
          title: 'Черновик не дописался',
          body: 'Сбой на сервере: ответ модели не пришёл. Отправьте задание ещё раз.',
          html: '⚠️ <b>Черновик не дописался</b>\nСбой на сервере: ответ модели не пришёл. Отправьте задание ещё раз.',
          buttons: [],
          linkPath: '/'
        }
      ],
      deps.now
    );
    if (await deps.writer.markLost(job.id, deps.now)) reported += 1;
  }
  return reported;
}
