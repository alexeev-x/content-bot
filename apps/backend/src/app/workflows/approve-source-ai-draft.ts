import type { SourceEventAiDraftDto } from '@alexeev/contracts';
import {
  approveDraft,
  approvedRevision,
  attachPost,
  publishableText,
  readDraftChain,
  type GenerationRow,
  type WriterDeps
} from '../../modules/ai';
import { createPost } from '../../modules/content';
import { AppError } from '../../shared/app-error';
import { aiPostText, draftFromMessageText } from '../bot/draft-from-message';
import { aiRichHtml } from '../bot/rich-post';

const richOf = (text: string): { richHtml?: string } => {
  // Only a source's drafts are approved here, so the text always may take the rich sample.
  const richHtml = aiRichHtml(text, true);
  return richHtml === null ? {} : { richHtml };
};
import type { Container } from '../container';
import { queuePictureJob } from './picture-jobs';

// An event's AI draft seen and approved in the studio (owner, 21.10.2026: «почему в админке не видно черновик»), the
// same approval as the bot's: the approved revision becomes a studio post, linked to its event, with its images.

/** Rewrites and a facts answer are child drafts: a source event knows only the first one. */
const LINEAGE_MAX = 12;

export async function lineage(deps: Pick<WriterDeps, 'writer'>, generation: GenerationRow): Promise<string[]> {
  const ids = [generation.id];
  let parent = generation.parentGenerationId;
  while (parent !== null && ids.length < LINEAGE_MAX) {
    ids.push(parent);
    parent = (await deps.writer.findGeneration(parent))?.parentGenerationId ?? null;
  }
  return ids;
}

/** The approved post becomes its event's post; an event post always carries the announcement's images. */
export async function linkApprovedSourcePost(
  container: Container,
  generationIds: readonly string[],
  postId: string,
  /** False when the caller attaches the pictures itself (the automatic publishing): no second download. */
  queueMedia = true
): Promise<void> {
  const externalId = await container.dotaRepository.linkAiPost({ generationIds, postId, now: container.clock.now() });
  const chatId = Number(container.ownerChatId);
  if (!queueMedia || externalId === null || container.ownerChatId === null || !Number.isSafeInteger(chatId)) return;
  await queuePictureJob(container, { id: container.newId(), kind: 'source_media', chatId, postId, externalId });
}

/** The newest version of the event's AI draft: its text, a question instead, or the failure. */
export async function readSourceAiDraft(container: Container, rootId: string): Promise<SourceEventAiDraftDto> {
  const chain = await readDraftChain(container.aiDraftHistory, rootId);
  const version = chain.versions.at(-1);
  if (version === undefined) throw new AppError('NOT_FOUND', 'No AI draft');
  const text = version.texts.at(-1) ?? null;
  return {
    versionId: version.id,
    status:
      version.status === 'pending'
        ? 'writing'
        : version.status === 'failed'
          ? 'failed'
          : version.result === 'needs_facts'
            ? 'question'
            : 'ready',
    text: text?.text ?? null,
    question: version.question,
    postId: chain.versions.flatMap((item) => item.texts).find((item) => item.postId !== null)?.postId ?? null
  };
}

/** Approves exactly the version the owner saw; a second approval returns the same post. */
export async function approveSourceAiDraft(
  container: Container,
  deps: WriterDeps,
  /** `linkToEvent`: false for a series post, which keeps its own post and media (`source_series_posts`). */
  input: {
    rootId: string;
    versionId: string;
    actor: string;
    linkToEvent?: boolean;
    /** OWNER_PREAPPROVED for a text the automatic publishing sent without the owner (owner, 21.10.2026). */
    provenance?: 'OWNER_APPROVED' | 'OWNER_PREAPPROVED';
    /** False: the event's pictures are not queued (the caller attaches them). */
    queueMedia?: boolean;
  }
): Promise<{ postId: string; created: boolean }> {
  const chain = await readDraftChain(container.aiDraftHistory, input.rootId);
  if (!chain.versions.some((version) => version.id === input.versionId))
    throw new AppError('NOT_FOUND', 'Not a version of this draft');
  const generation = await deps.writer.findGeneration(input.versionId);
  if (generation === null || generation.format !== 'telegram') throw new AppError('NOT_FOUND', 'The draft is gone');
  const revisions = await deps.writer.revisions(input.versionId);
  const current = revisions.at(-1);
  // Checked before approving: an approved text can no longer be edited, so it must already fit a post.
  if (approvedRevision(revisions) === null && (current === undefined || !draftFromMessageText(current.text).ok))
    throw new AppError('CONFLICT', 'The text does not fit a post', { reason: 'NOT_A_POST' });
  await approveDraft(deps, input.versionId, input.provenance);
  const approved = await publishableText(deps, input.versionId);
  if (approved.postId !== null) return { postId: approved.postId, created: false };
  const linked = aiPostText(approved.text);
  const post = draftFromMessageText(linked.text, linked.entities);
  if (!post.ok) throw new AppError('CONFLICT', 'The text does not fit a post', { reason: 'NOT_A_POST' });
  // Keyed by the approved revision, as in the bot: a repeated approval anywhere returns the same post.
  const created = await createPost(
    { repo: container.posts, idempotency: container.idempotency, now: container.clock.now(), newId: container.newId },
    {
      actor: input.actor,
      idempotencyKey: `ai:${approved.id}`,
      input: post.input,
      // The approved rich sample when the text has its structure (owner, 23.10.2026); else the classic post.
      ...richOf(approved.text)
    }
  );
  await attachPost(deps, approved.id, created.id);
  if (input.linkToEvent === false) return { postId: created.id, created: true };
  await linkApprovedSourcePost(container, await lineage(deps, generation), created.id, input.queueMedia).catch(
    (error: unknown) =>
      container.logger.warn({
        component: 'sources',
        operation: 'link_ai_post',
        status: 'failed',
        errorCode: error instanceof Error ? error.name : 'unknown'
      })
  );
  return { postId: created.id, created: true };
}
