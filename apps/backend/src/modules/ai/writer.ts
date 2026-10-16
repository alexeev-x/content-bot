import type { PostOriginDto } from '@alexeev/contracts';
import type { Clock } from '../../platform/clock';
import { AppError } from '../../shared/app-error';
import { readAuthorProfile } from './author-profile';
import type { AiRepository } from './d1-ai-repository';
import type { AuthorProfileRepository } from './d1-author-repository';
import type { ChatTurn, FeedbackKind, GenerationRow, RevisionRow, WriterRepository } from './d1-writer-repository';
import { type AiTextProvider, AiProviderError } from './ports';
import { assertAiReady, type BudgetEvent, readAiSettings, recordAiUsage } from './service';
import { changedParts, checkDraft, editRatio } from './writer-checks';
import { buildFreePrompt, buildWriterPrompt, packRevision, repeatsRecentTopic } from './writer-prompt';
import { type DraftFacets, parseWriterAnswer, WRITER_ANSWER_JSON_SCHEMA } from './writer-answer';
import type { WriterFormat, WriterMode } from './writer-types';

// The AI writer (docs/ai/architecture.md items 2, 4, 7, 9, 20): a draft is stored as AI_DRAFT, the owner's
// edits as OWNER_EDITED, and only an approval (OWNER_APPROVED / OWNER_PREAPPROVED) makes a text publishable.
const MAX_OUTPUT_TOKENS = 2500;
const MAX_TASK = 4000;
const MAX_TEXT = 8000;
/** The model asked for the owner's experience instead of writing (see `call`). */
export const NEEDS_FACTS = 'NEEDS_FACTS';
/** Drafts of the same format whose topic, device and ending the next prompt lists (antirepeat). */
const RECENT_FACETS = 15;

export interface WriterDeps {
  repo: AiRepository;
  writer: WriterRepository;
  /** «Обо мне»: sent with every request. */
  profiles: AuthorProfileRepository;
  clock: Clock;
  timezone: string;
  newId: () => string;
  provider: AiTextProvider | null;
}

export interface WriterResult {
  generation: GenerationRow;
  /** The draft's current text; null when the model failed (generation.errorCode says why). */
  text: string | null;
  budgetEvents: BudgetEvent[];
}

export interface Approval {
  revision: RevisionRow;
  /** False when the draft was approved before (a repeated tap): the caller must not create a second post. */
  created: boolean;
}

const author = async (deps: Pick<WriterDeps, 'profiles'>) => (await readAuthorProfile(deps.profiles)).promptText;

/** The text the owner sees now: the newest revision. */
export function currentRevision(revisions: readonly RevisionRow[]): RevisionRow | null {
  return revisions.at(-1) ?? null;
}

/** The approval of a draft, if any: the only revision a publication may be created from. */
export function approvedRevision(revisions: readonly RevisionRow[]): RevisionRow | null {
  return (
    revisions.find(
      (revision) => revision.provenance === 'OWNER_APPROVED' || revision.provenance === 'OWNER_PREAPPROVED'
    ) ?? null
  );
}

type NewGeneration = Pick<
  GenerationRow,
  | 'id'
  | 'kind'
  | 'format'
  | 'mode'
  | 'source'
  | 'task'
  | 'parentGenerationId'
  | 'preApprovedPublishAt'
  | 'hooks'
  | 'createdAt'
>;

async function call(
  deps: WriterDeps,
  row: NewGeneration,
  prompt: { instructions: string; input: string },
  signal: AbortSignal,
  /** Facets of the latest drafts of the format, to flag a repeated topic. */
  recent: readonly DraftFacets[] = []
): Promise<WriterResult> {
  const settings = await readAiSettings(deps.repo);
  // Refused before a row exists when AI cannot run: nothing pending is left behind.
  const { provider, model } = await assertAiReady(deps, settings, settings.draftModel ?? settings.cheapModel);
  await deps.writer.createGeneration({ ...row, packRevision: packRevision() });
  const generation: GenerationRow = {
    ...row,
    status: 'pending',
    errorCode: null,
    model: null,
    warnings: [],
    chatMessageId: null,
    result: null,
    question: null,
    ideas: []
  };
  try {
    const result = await provider.complete({
      model,
      ...prompt,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      jsonSchema: WRITER_ANSWER_JSON_SCHEMA,
      signal
    });
    const usageId = deps.newId();
    const budgetEvents = await recordAiUsage(deps, {
      id: usageId,
      kind: generation.kind,
      provider: provider.provider,
      model: result.model,
      usage: result.usage,
      settings
    });
    const answer = parseWriterAnswer(result.text);
    const now = deps.clock.now();
    if (answer === null) {
      // Paid and recorded, but not the agreed shape: never guessed into a draft.
      await deps.writer.finishGeneration({
        id: generation.id,
        now,
        status: 'failed',
        errorCode: 'AI_BAD_FORMAT',
        model: result.model,
        usageId
      });
      return { generation: { ...generation, status: 'failed', errorCode: 'AI_BAD_FORMAT' }, text: null, budgetEvents };
    }
    if (answer.kind === 'needs_facts') {
      // The model asks for the owner's experience (pack/output.md): no AI_DRAFT, nothing to check or approve;
      // the owner's answer starts a new draft.
      await deps.writer.finishGeneration({
        id: generation.id,
        now,
        status: 'ready',
        model: result.model,
        usageId,
        result: 'needs_facts',
        question: answer.question,
        ideas: answer.ideas
      });
      return {
        generation: {
          ...generation,
          status: 'ready',
          model: result.model,
          result: 'needs_facts',
          question: answer.question,
          ideas: answer.ideas
        },
        text: null,
        budgetEvents
      };
    }
    const text = answer.text.slice(0, MAX_TEXT);
    const warnings = checkDraft(generation.format, generation.mode, text);
    if (recent.length > 0 && repeatsRecentTopic(answer.facets.topic, recent)) warnings.push('TOPIC_REPEATED');
    // A rewrite keeps the parent's hooks unless the model sent new ones.
    const hooks = answer.hooks.length > 0 ? answer.hooks : generation.hooks;
    await deps.writer.addRevision({
      id: deps.newId(),
      generationId: generation.id,
      parentId: null,
      provenance: 'AI_DRAFT',
      text,
      editRatio: null,
      createdAt: now
    });
    await deps.writer.finishGeneration({
      id: generation.id,
      now,
      status: 'ready',
      model: result.model,
      usageId,
      hooks,
      warnings,
      result: 'draft',
      facets: answer.facets
    });
    return {
      generation: { ...generation, status: 'ready', model: result.model, hooks, warnings, result: 'draft' },
      text,
      budgetEvents
    };
  } catch (error) {
    if (!(error instanceof AiProviderError)) {
      // Never left pending: the row ends failed, the error still reaches the caller's log.
      await deps.writer
        .finishGeneration({ id: generation.id, now: deps.clock.now(), status: 'failed', errorCode: 'INTERNAL', model })
        .catch(() => undefined);
      throw error;
    }
    await deps.writer.finishGeneration({
      id: generation.id,
      now: deps.clock.now(),
      status: 'failed',
      errorCode: error.code,
      model
    });
    return { generation: { ...generation, status: 'failed', errorCode: error.code }, text: null, budgetEvents: [] };
  }
}

/** A first draft from the owner's words (direct) or a news item's facts (automatic). */
export async function generateDraft(
  deps: WriterDeps,
  input: {
    format: WriterFormat;
    mode: WriterMode;
    source: 'bot' | 'studio';
    task: string;
    preApprovedPublishAt?: number | null;
    /** Reels example ids kept out of the prompt (control run). */
    holdOut?: readonly string[];
    signal: AbortSignal;
  }
): Promise<WriterResult> {
  const task = input.task.trim().slice(0, MAX_TASK);
  if (task === '') throw new AppError('VALIDATION_ERROR', 'The task is empty');
  const now = deps.clock.now();
  const row: NewGeneration = {
    id: deps.newId(),
    kind: 'draft',
    format: input.format,
    mode: input.mode,
    source: input.source,
    task,
    parentGenerationId: null,
    preApprovedPublishAt: input.preApprovedPublishAt ?? null,
    hooks: [],
    createdAt: now
  };
  const recent = await deps.writer.recentFacets(input.format, RECENT_FACETS);
  return call(
    deps,
    row,
    buildWriterPrompt({
      format: input.format,
      mode: input.mode,
      task,
      holdOut: input.holdOut ?? [],
      author: await author(deps),
      ownerTexts: await deps.writer.ownerExamples({ format: input.format, limit: 2 }),
      recent
    }),
    input.signal,
    recent
  );
}

/** A new version of a draft by the owner's instruction («короче», «смешнее», «ещё вариант»). */
export async function rewriteDraft(
  deps: WriterDeps,
  input: { generationId: string; instruction: string; signal: AbortSignal }
): Promise<WriterResult> {
  const parent = await deps.writer.findGeneration(input.generationId);
  if (parent !== null) refuseRequestForFacts(parent);
  if (parent === null) throw new AppError('NOT_FOUND', 'The draft is gone');
  const current = currentRevision(await deps.writer.revisions(parent.id));
  if (current === null) throw new AppError('CONFLICT', 'The draft has no text', { reason: 'NO_TEXT' });
  const instruction = input.instruction.trim().slice(0, 500);
  if (instruction === '') throw new AppError('VALIDATION_ERROR', 'The instruction is empty');
  const row: NewGeneration = {
    id: deps.newId(),
    kind: 'rewrite',
    format: parent.format,
    mode: parent.mode,
    source: parent.source,
    // The original topic or facts, so a rewrite of a rewrite still knows what the text is about.
    task: parent.task,
    parentGenerationId: parent.id,
    preApprovedPublishAt: parent.preApprovedPublishAt,
    hooks: parent.hooks,
    createdAt: deps.clock.now()
  };
  const prompt = buildWriterPrompt({
    format: parent.format,
    mode: parent.mode,
    task: parent.task,
    rewrite: { text: current.text, instruction },
    author: await author(deps),
    ownerTexts: await deps.writer.ownerExamples({ format: parent.format, limit: 2 })
  });
  return call(deps, row, prompt, input.signal);
}

/** The opening replaced by the chosen hook (the script starts with its best hook). Stays AI text. */
export async function chooseHook(deps: WriterDeps, generationId: string, index: number): Promise<string> {
  const generation = await deps.writer.findGeneration(generationId);
  const hook = generation?.hooks[index];
  if (generation === null || hook === undefined) throw new AppError('NOT_FOUND', 'The hook is gone');
  refuseRequestForFacts(generation);
  const revisions = await deps.writer.revisions(generationId);
  const current = currentRevision(revisions);
  if (current === null) throw new AppError('CONFLICT', 'The draft has no text', { reason: 'NO_TEXT' });
  if (approvedRevision(revisions) !== null)
    throw new AppError('CONFLICT', 'The draft is approved', { reason: 'APPROVED' });
  const used = generation.hooks.find((candidate) => current.text.startsWith(candidate));
  const rest = used !== undefined ? current.text.slice(used.length) : current.text.replace(/^[^\n]*(\n|$)/, '\n');
  const text = `${hook}${rest}`.trim().slice(0, MAX_TEXT);
  await deps.writer.addRevision({
    id: deps.newId(),
    generationId,
    parentId: current.id,
    // Words picked by the owner but written by the model: still an AI draft, never style evidence.
    provenance: current.provenance === 'OWNER_EDITED' ? 'OWNER_EDITED' : 'AI_DRAFT',
    text,
    editRatio: null,
    createdAt: deps.clock.now()
  });
  return text;
}

/** The owner's own version of the text (a reply to the draft in the bot, or an edit in the studio). */
export async function saveOwnerEdit(deps: WriterDeps, generationId: string, text: string): Promise<RevisionRow> {
  await assertDraft(deps, generationId);
  const clean = text.trim();
  if (clean === '' || clean.length > MAX_TEXT) throw new AppError('VALIDATION_ERROR', 'The text is empty or too long');
  const revisions = await deps.writer.revisions(generationId);
  if (revisions.length === 0) throw new AppError('NOT_FOUND', 'The draft is gone');
  if (approvedRevision(revisions) !== null)
    throw new AppError('CONFLICT', 'The draft is approved', { reason: 'APPROVED' });
  const revision: RevisionRow = {
    id: deps.newId(),
    generationId,
    provenance: 'OWNER_EDITED',
    text: clean,
    editRatio: null,
    postId: null,
    createdAt: deps.clock.now()
  };
  await deps.writer.addRevision({ ...revision, parentId: currentRevision(revisions)?.id ?? null });
  return revision;
}

/**
 * The owner's approval of the current text, with the edit ratio against the first AI draft. Once per draft:
 * a repeated tap returns the existing approval with `created: false`.
 */
export async function approveDraft(
  deps: WriterDeps,
  generationId: string,
  provenance: 'OWNER_APPROVED' | 'OWNER_PREAPPROVED' = 'OWNER_APPROVED'
): Promise<Approval> {
  await assertDraft(deps, generationId);
  const revisions = await deps.writer.revisions(generationId);
  const existing = approvedRevision(revisions);
  if (existing !== null) return { revision: existing, created: false };
  const current = currentRevision(revisions);
  if (current === null) throw new AppError('NOT_FOUND', 'The draft is gone');
  const firstDraft = revisions.find((revision) => revision.provenance === 'AI_DRAFT') ?? current;
  const revision: RevisionRow = {
    id: deps.newId(),
    generationId,
    provenance,
    text: current.text,
    editRatio: editRatio(firstDraft.text, current.text),
    postId: null,
    createdAt: deps.clock.now()
  };
  const parts = changedParts(firstDraft.text, current.text);
  if (await deps.writer.addApproval({ ...revision, parentId: current.id, changedParts: parts })) {
    return { revision, created: true };
  }
  // Another tap won the race: its approval is the one.
  const winner = approvedRevision(await deps.writer.revisions(generationId));
  if (winner === null) throw new AppError('CONFLICT', 'The approval was not saved', { reason: 'APPROVAL_LOST' });
  return { revision: winner, created: false };
}

/**
 * The server-side guard (architecture item 20): the text a publication may be created from. Throws unless the
 * draft is approved, so an AI_DRAFT or an owner edit without approval never reaches a channel.
 */
export async function publishableText(deps: Pick<WriterDeps, 'writer'>, generationId: string): Promise<RevisionRow> {
  await assertDraft(deps, generationId);
  const approved = approvedRevision(await deps.writer.revisions(generationId));
  if (approved === null) throw new AppError('CONFLICT', 'The AI text is not approved', { reason: 'NOT_APPROVED' });
  return approved;
}

/**
 * The studio-only origin of each post: from an approved AI draft (bot or studio, with the owner's edit share)
 * or absent — written by the owner. Never part of what a channel receives.
 */
export async function readPostOrigins(
  deps: Pick<WriterDeps, 'writer'>,
  postIds: readonly string[]
): Promise<Map<string, PostOriginDto>> {
  const rows = await deps.writer.postOrigins(postIds);
  return new Map(rows.map((row) => [row.postId, { kind: 'ai', source: row.source, editRatio: row.editRatio }]));
}

export async function attachPost(deps: Pick<WriterDeps, 'writer'>, revisionId: string, postId: string): Promise<void> {
  await deps.writer.attachPost(revisionId, postId);
}

export async function recordFeedback(deps: WriterDeps, generationId: string, kind: FeedbackKind): Promise<void> {
  if ((await deps.writer.findGeneration(generationId)) === null) throw new AppError('NOT_FOUND', 'The draft is gone');
  await deps.writer.addFeedback({ id: deps.newId(), generationId, kind, now: deps.clock.now() });
}

/**
 * A free request in /redactor (no format button): one answer in the author's voice. Not a draft: nothing here
 * can become a post; a request for a post or a Reel goes through `generateDraft` instead.
 */
export async function askEditor(
  deps: WriterDeps,
  input: { task: string; history?: readonly ChatTurn[]; signal: AbortSignal }
): Promise<{ text: string | null; errorCode: string | null; budgetEvents: BudgetEvent[] }> {
  const task = input.task.trim().slice(0, MAX_TASK);
  if (task === '') throw new AppError('VALIDATION_ERROR', 'The task is empty');
  const settings = await readAiSettings(deps.repo);
  const { provider, model } = await assertAiReady(deps, settings, settings.draftModel ?? settings.cheapModel);
  try {
    const result = await provider.complete({
      model,
      ...buildFreePrompt(task, input.history, await author(deps)),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      signal: input.signal
    });
    const budgetEvents = await recordAiUsage(deps, {
      kind: 'other',
      provider: provider.provider,
      model: result.model,
      usage: result.usage,
      settings
    });
    const text = result.text.trim().slice(0, MAX_TEXT);
    return { text: text === '' ? null : text, errorCode: text === '' ? 'AI_EMPTY_ANSWER' : null, budgetEvents };
  } catch (error) {
    if (!(error instanceof AiProviderError)) throw error;
    return { text: null, errorCode: error.code, budgetEvents: [] };
  }
}

/** A request for the owner's facts is not a draft: never edited, rewritten, approved or published. */
function refuseRequestForFacts(generation: GenerationRow): void {
  // Older rows (before migration 0062) mark the question only by its NEEDS_FACTS warning.
  if (generation.result === 'needs_facts' || generation.warnings.includes(NEEDS_FACTS)) {
    throw new AppError('CONFLICT', 'The answer is a question, not a draft', { reason: 'NOT_A_DRAFT' });
  }
}

async function assertDraft(deps: Pick<WriterDeps, 'writer'>, generationId: string): Promise<void> {
  const generation = await deps.writer.findGeneration(generationId);
  if (generation === null) throw new AppError('NOT_FOUND', 'The draft is gone');
  refuseRequestForFacts(generation);
}
