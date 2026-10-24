import type { WriterRepository } from '../../modules/ai';
import type { ContentAlertRepository } from '../../modules/content-analytics';

// A queue job whose Worker died after its claim (review 19.10.2026): the claim keeps the model from being called
// twice, so nothing else would ever finish it. Cron tells the owner once, through the content alerts (one attempt,
// `unknown` never resent). A publishing job (review 24.10.2026: an approved post that never reached the channel) is told
// as such, with its post, since the owner was already told it would go out by itself.

/** Longer than a queue consumer's 15 minutes of wall time: a job still open after this is gone. */
export const LOST_AFTER_MS = 20 * 60 * 1000;
const PER_TICK = 3;
/** One read, an alert and a mark per job. */
export const LOST_JOB_STATEMENTS = 1 + 2 * PER_TICK;

const PUBLISHING_KINDS = new Set(['patch_publish', 'series_publish']);

function lostText(job: { kind: string | null; postId: string | null }): {
  title: string;
  body: string;
  linkPath: string;
} {
  if (job.kind !== null && PUBLISHING_KINDS.has(job.kind))
    return {
      title: 'Пост не ушёл в канал',
      body: 'Сбой на сервере во время публикации: пост одобрен, но в канал не отправлен. Откройте его и опубликуйте.',
      linkPath: job.postId === null ? '/posts' : `/posts/${job.postId}`
    };
  // Pictures of a post the owner approved: the post itself is the owner's to publish.
  if (job.kind === 'source_media')
    return {
      title: 'Картинки из анонса не прикрепились',
      body: 'Сбой на сервере, пока прикреплялись картинки. Добавьте их в студии.',
      linkPath: job.postId === null ? '/posts' : `/posts/${job.postId}`
    };
  if (job.kind === 'series_post')
    return {
      title: 'Серия постов остановилась',
      body: 'Сбой на сервере, пока писался следующий пост серии. Остальные посты сами не выйдут: проверьте серию в студии.',
      linkPath: '/posts'
    };
  if (job.kind === 'source_event' || job.kind === 'treasure_post')
    return {
      title: 'Пост о новости Dota не написался',
      body: 'Сбой на сервере, пока готовился пост. Сам он уже не выйдет: напишите его из «Источников».',
      linkPath: '/sources'
    };
  if (job.kind === 'game_files_post')
    return {
      title: 'Находка в файлах игры не написалась',
      body: 'Сбой на сервере, пока проверялась сборка. Пост о ней сам уже не выйдет.',
      linkPath: '/sources'
    };
  return {
    title: 'Черновик не дописался',
    body: 'Сбой на сервере: ответ модели не пришёл. Отправьте задание ещё раз.',
    linkPath: '/'
  };
}

export async function reportLostAiJobs(deps: {
  writer: Pick<WriterRepository, 'lostJobs' | 'markLost'>;
  alerts: Pick<ContentAlertRepository, 'insert'>;
  now: number;
}): Promise<number> {
  let reported = 0;
  for (const job of await deps.writer.lostJobs(deps.now - LOST_AFTER_MS, PER_TICK)) {
    const text = lostText(job);
    // The alert first: its id dedups a second tick, and a mark without it would hide the job for good.
    await deps.alerts.insert(
      [
        {
          id: `ai-lost:${job.id}`,
          kind: 'item',
          title: text.title,
          body: text.body,
          html: `⚠️ <b>${text.title}</b>\n${text.body}`,
          buttons: [],
          linkPath: text.linkPath
        }
      ],
      deps.now
    );
    if (await deps.writer.markLost(job.id, deps.now)) reported += 1;
  }
  return reported;
}
