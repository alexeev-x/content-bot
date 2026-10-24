import type { AutopublishHeldReason } from '@alexeev/contracts';
import { Api, InlineKeyboard } from 'grammy';
import { approvePost } from '../../modules/content';
import { createPublication, createPublicationSeries } from '../../modules/publishing';
import { getOwnerOperationsSettings } from '../../modules/settings';
import type { WriterDeps } from '../../modules/ai';
import type { SeriesPostRow } from '../../modules/dota';
import { createWriterDeps } from '../bot/writer-deps';
import type { AiJob } from '../bot/ai-job';
import type { Container } from '../container';
import { approveSourceAiDraft, readSourceAiDraft } from './approve-source-ai-draft';
import { AUTOPUBLISH_ACTOR, PICTURES_PER_RUN } from './autopublish-source-event';
import { attachSourceEventImages, type SourceMediaDeps } from './source-event-media';
import { recordAutopublish } from './autopublish-log';
import { kickDispatch } from './dispatch-now';

// An event's series published without the owner (owner, 22.10.2026), like a single news post: only Cron's series
// whose every post was written and found clean by the fact check (the caller checks it), only while the automatic
// publishing is on with an enabled channel and under the daily limit (a series counts once), and only while nobody
// touched it: no post rewritten or edited after its check, none in the studio or published yet (QA 22.10.2026).
// One queue message per post (it becomes an approved studio post with its pictures), then one for the publication:
// each stays inside the Free plan's queries and subrequests. A step that stops tells the owner where the posts are.

const DAY_MS = 24 * 60 * 60 * 1000;
const INTERVAL_MINUTES = 10;
// A persona post shows five; with mirrors each picture may cost a few subrequests of the message's 50.
const MAX_PICTURES = 5;
const TELEGRAM_TIMEOUT_SECONDS = 10;

type Step = Extract<AiJob, { kind: 'series_publish' }>;

/** The post is exactly what its fact check saw: its first version, never rewritten or edited by anyone. */
async function untouched(container: Container, deps: WriterDeps, post: SeriesPostRow): Promise<boolean> {
  if (post.generationId === null || post.postId !== null) return false;
  const draft = await readSourceAiDraft(container, post.generationId);
  if (draft.versionId !== post.generationId) return false;
  const revisions = await deps.writer.revisions(post.generationId);
  return revisions.length > 0 && revisions.every((revision) => revision.provenance === 'AI_DRAFT');
}

/** Never throws: every outcome ends in one message to the owner or in the next step. */
export async function runSeriesPublishStep(
  container: Container,
  step: Step,
  token: string,
  media: (chatId: number) => SourceMediaDeps,
  requestId: string,
  onError: (error: unknown) => void
): Promise<void> {
  // With the chat, so a step whose Worker dies is reported by Cron's lost-job check instead of the chain stopping
  // unseen (the series' «готова» note was already claimed).
  const claimed = await container.aiWriter
    .claimJob(step.id, container.clock.now(), { chatId: step.chatId, messageId: null, kind: 'series_publish' })
    .catch(() => false);
  if (!claimed) return;
  let silent = true;
  const tell = async (text: string, url: string) => {
    if (token === '') return;
    await new Api(token, { timeoutSeconds: TELEGRAM_TIMEOUT_SECONDS })
      .sendMessage(step.chatId, text, {
        disable_notification: silent,
        reply_markup: new InlineKeyboard().webApp('Открыть в студии', url)
      })
      .catch(onError);
  };
  let title = 'серия';
  let eventUrl = `${step.appOrigin}/sources`;
  let studioPostIds: string[] = [];
  // For the studio's «Автопубликация»: the series as one row, linked to its first post.
  const record = (outcome: 'published' | 'held', reason?: AutopublishHeldReason) =>
    recordAutopublish(container, {
      source: 'series',
      title: `Серия «${title}»`,
      outcome,
      ...(reason === undefined ? {} : { reason }),
      postId: studioPostIds[0] ?? null
    });
  try {
    const posts = await container.sourceSeries.posts(step.seriesId);
    const first = posts[0];
    if (first === undefined) return;
    eventUrl = `${step.appOrigin}/sources?open=${encodeURIComponent(`steam_news:${first.externalId}`)}`;
    title = (await container.sourceSeries.latest(first.externalId, container.clock.now()))?.title ?? title;
    const settings = await getOwnerOperationsSettings({
      repo: container.settings,
      logger: container.logger,
      requestId
    });
    const { enabled, destinationId, dailyLimit } = settings.autopublish;
    silent = enabled;
    const channel = destinationId === null ? null : await container.destinations.findById(destinationId);
    const on = enabled && channel !== null && channel.enabled;
    const deps = await createWriterDeps(container, requestId);

    // A later message of the same post (its next pictures) is past this check: the post is approved by now.
    if (step.position === 1 && step.from === undefined) {
      // Checked before anything is approved: refused here, the owner simply gets the series to approve.
      const used = await container.publications.countCreatedBy(AUTOPUBLISH_ACTOR, container.clock.now() - DAY_MS);
      let pristine = true;
      for (const post of posts) pristine = pristine && (await untouched(container, deps, post));
      if (!on || used >= dailyLimit || !pristine) {
        if (!on || used >= dailyLimit) await record('held', !on ? 'off' : 'limit');
        await tell(`Серия постов «${title}» готова: ${posts.length}. Посмотрите и одобрите в студии.`, eventUrl);
        return;
      }
    }

    if (step.position > posts.length) {
      // The publication step: the posts approved by the steps before, still unpublished, still allowed.
      studioPostIds = posts.map((post) => post.postId).filter((id): id is string => id !== null);
      if (studioPostIds.length !== posts.length || destinationId === null || !on) {
        await record('held', !on || destinationId === null ? 'off' : 'failed');
        return void (await tell(`Серия «${title}» не опубликована без вас. Посты ждут в студии.`, eventUrl));
      }
      // Counted again: other sources may have published while the series was written (review 24.10.2026).
      if (
        (await container.publications.countCreatedBy(AUTOPUBLISH_ACTOR, container.clock.now() - DAY_MS)) >= dailyLimit
      ) {
        await record('held', 'limit');
        return void (await tell(
          `Серия «${title}» не опубликована без вас: дневной лимит автопубликаций исчерпан. Посты ждут в студии.`,
          eventUrl
        ));
      }
      if (await container.publications.hasAnyPublication(studioPostIds))
        return void (await tell(
          `Серия «${title}» не опубликована без вас: пост уже публиковали. Посты ждут в студии.`,
          eventUrl
        ));
      const items = [];
      for (const id of studioPostIds) {
        const approved = await container.posts.findById(id);
        if (approved === null || approved.status !== 'approved') throw new Error('A series post is not approved');
        items.push({ postId: approved.id, revision: approved.revision });
      }
      const publishing = {
        publications: container.publications,
        destinations: container.destinations,
        posts: container.postSource,
        idempotency: container.idempotency,
        notifier: { scheduled: () => undefined, rescheduled: () => undefined, cancelled: () => undefined },
        now: container.clock.now(),
        newId: container.newId
      };
      const scheduledAt = new Date(container.clock.now()).toISOString();
      const only = items.length === 1 ? items[0] : undefined;
      // A series is two posts or more: a one-post plan goes out as a single publication.
      const firstId =
        only !== undefined
          ? (
              await createPublication(publishing, {
                actor: AUTOPUBLISH_ACTOR,
                idempotencyKey: `autopublish-series:${step.seriesId}`,
                input: { ...only, destinationId, scheduledAt, timezone: settings.timezone }
              })
            ).id
          : (
              await createPublicationSeries(publishing, {
                actor: AUTOPUBLISH_ACTOR,
                idempotencyKey: `autopublish-series:${step.seriesId}`,
                input: {
                  items,
                  destinationId,
                  scheduledAt,
                  timezone: settings.timezone,
                  intervalMinutes: INTERVAL_MINUTES
                }
              })
            ).publications[0]?.id;
      await kickDispatch(container);
      await record('published');
      await tell(
        only !== undefined
          ? `Опубликовано без вас: «${title}».`
          : `Опубликовано без вас: серия «${title}» — ${items.length} поста, по одному каждые ${INTERVAL_MINUTES} минут.`,
        `${step.appOrigin}/publications?id=${encodeURIComponent(firstId ?? '')}`
      );
      return;
    }

    const post = posts.find((item) => item.position === step.position);
    if (post === undefined || post.generationId === null) throw new Error('The series post is gone');
    let postId: string;
    if (step.from === undefined) {
      // Nobody may have rewritten, edited or taken this post since step 1 checked it.
      if (!on || !(await untouched(container, deps, post)))
        return void (await tell(`Серия «${title}» не опубликована без вас. Посты ждут в студии.`, eventUrl));
      ({ postId } = await approveSourceAiDraft(container, deps, {
        rootId: post.generationId,
        versionId: post.generationId,
        actor: AUTOPUBLISH_ACTOR,
        provenance: 'OWNER_PREAPPROVED',
        linkToEvent: false
      }));
      await container.sourceSeries.setPost({ id: post.id, postId });
      // An owner edit that landed between the check and the approval is approved as the text: then the owner decides.
      const approvedRevisions = await deps.writer.revisions(post.generationId);
      if (
        approvedRevisions.some(
          (revision) => revision.provenance === 'OWNER_EDITED' || revision.provenance === 'OWNER_APPROVED'
        )
      )
        return void (await tell(`Серия «${title}» не опубликована без вас. Посты ждут в студии.`, eventUrl));
    } else {
      // The same post's next pictures (QA 23.10.2026): approved and checked by the message that began it.
      if (post.postId === null) throw new Error('The series post is not approved');
      postId = post.postId;
    }
    const from = step.from ?? 0;
    const { found, remaining } = await attachSourceEventImages(media(step.chatId), {
      postId,
      externalId: post.externalId,
      urls: post.media,
      max: MAX_PICTURES,
      from,
      count: PICTURES_PER_RUN
    });
    // Two pictures per message keep it inside the Free plan's 50 D1 statements; the rest go on in the next one.
    if (remaining > 0)
      return void (await container.aiJobs.send({ ...step, id: container.newId(), from: from + PICTURES_PER_RUN }));
    const attached = (await container.posts.findById(postId))?.media?.length ?? 0;
    if (found > 0 && attached === 0) {
      await record('held', 'no_images');
      await tell(
        `Серия «${title}» не опубликована без вас: к посту ${post.position} не загрузились картинки. Посты ждут в студии.`,
        eventUrl
      );
      return;
    }
    const current = await container.posts.findById(postId);
    if (current === null) throw new Error('The approved post is gone');
    if (current.status !== 'approved')
      await approvePost(
        { repo: container.posts, now: container.clock.now() },
        { actor: AUTOPUBLISH_ACTOR, id: postId, input: { revision: current.revision } }
      );
    const { from: _done, ...next } = step;
    await container.aiJobs.send({ ...next, id: container.newId(), position: step.position + 1 });
  } catch (error) {
    onError(error);
    // The series' write may have committed and lost its answer: never «not published» about posts that go out.
    const out =
      studioPostIds.length > 0 && (await container.publications.hasAnyPublication(studioPostIds).catch(() => false));
    await record(out ? 'published' : 'held', 'failed');
    await tell(
      out
        ? `Опубликовано без вас: серия «${title}».`
        : `Серия «${title}» не опубликована без вас: не получилось. Посты ждут в студии.`,
      eventUrl
    );
  } finally {
    await container.aiWriter.finishJob(step.id, container.clock.now()).catch(onError);
  }
}
