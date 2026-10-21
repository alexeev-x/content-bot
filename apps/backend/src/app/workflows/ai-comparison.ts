import type { AiComparisonDto, AiComparisonsDto } from '@alexeev/contracts';
import {
  generateCheckedDraft,
  generateDraft,
  providerOfModel,
  readAiSettings,
  type ComparisonRow,
  type ComparisonSide,
  type WriterDeps
} from '../../modules/ai';
import { AppError } from '../../shared/app-error';
import { createWriterDeps } from '../bot/writer-deps';
import type { Container } from '../container';
import { buildSetTasks, followUpTask, IDEAS_OUTPUT_TOKENS } from './ai-comparison-set';

// The blind provider comparison, test set № 2 (owner, 21.10.2026; docs/ai/claude-provider.md §3): every task of the set
// is written by the settings' draft model and by Claude Opus 5.5 through the existing editor, in A/B order drawn per
// pair. The owner picks without knowing which is which; the models, costs and times show once every pair is picked.

export const CLAUDE_MODEL = 'claude-opus-5-5';
const WRITE_TIMEOUT_MS = 180_000;
/** A failed side is tried once more with the same task and settings (the test's rule); the budget is never retried. */
const ATTEMPTS = 2;

/** Queues the test set; the number of pairs. Refused while pairs exist, so runs never mix. */
export async function startComparisons(
  container: Container,
  onError: (error: unknown) => void,
  random: () => number = Math.random
): Promise<number> {
  const settings = await readAiSettings(container.aiRepository);
  const other =
    settings.draftModel !== null && providerOfModel(settings.draftModel) === 'openai' ? settings.draftModel : null;
  if (other === null || !container.aiKeys.openai || !container.aiKeys.anthropic)
    throw new AppError('UNAVAILABLE', 'Both providers need a key and an OpenAI draft model', { reason: 'NO_KEY' });
  if ((await container.aiComparisons.list()).length > 0)
    throw new AppError('CONFLICT', 'Clear the comparison first', { reason: 'NOT_EMPTY' });
  const tasks = await buildSetTasks(container, onError);
  const now = container.clock.now();
  const ids = new Map(tasks.map((task) => [task.code, container.newId()]));
  const rows = tasks.map((task, position) => {
    const claudeFirst = random() < 0.5;
    return {
      id: ids.get(task.code) ?? container.newId(),
      code: task.code,
      position,
      afterId: task.after === undefined ? null : (ids.get(task.after) ?? null),
      label: task.label,
      task: task.task,
      format: task.format,
      mode: task.mode,
      aModel: claudeFirst ? CLAUDE_MODEL : other,
      bModel: claudeFirst ? other : CLAUDE_MODEL,
      now
    };
  });
  await container.aiComparisons.create(rows);
  // A follow-up waits for its first post: its job is queued when that pair is written.
  for (const row of rows)
    if (row.afterId === null)
      await container.aiJobs.send({ id: container.newId(), kind: 'comparison', comparisonId: row.id });
  return rows.length;
}

const errorOf = (error: unknown) =>
  error instanceof AppError
    ? `${error.code}${error.details?.reason ? `:${error.details.reason}` : ''}`
    : error instanceof Error && 'code' in error && typeof error.code === 'string'
      ? error.code
      : error instanceof Error
        ? error.name
        : 'unknown';

const isBudget = (error: unknown) => error instanceof AppError && error.details?.reason === 'BUDGET';

/** The writer's dependencies with a meter on the ledger: what one side's calls cost, fact check and fix included. */
function metered(deps: WriterDeps): { deps: WriterDeps; cost: () => number | null } {
  let micro = 0;
  let unpriced = false;
  return {
    deps: {
      ...deps,
      repo: {
        ...deps.repo,
        recordUsage: async (row) => {
          if (row.costMicroUsd === null) unpriced = true;
          else micro += row.costMicroUsd;
          await deps.repo.recordUsage(row);
        }
      }
    },
    cost: () => (unpriced ? null : micro)
  };
}

type SideResult = ComparisonSide & { budget: boolean };

async function writeSide(
  container: Container,
  row: ComparisonRow,
  model: string,
  task: string,
  base: WriterDeps,
  onError: (error: unknown) => void
): Promise<SideResult> {
  const meter = metered(base);
  const started = container.clock.now();
  let error = 'unknown';
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const input = {
      format: row.format,
      mode: row.mode,
      source: 'studio' as const,
      task,
      model,
      ...(row.code?.startsWith('IDEA') ? { maxOutputTokens: IDEAS_OUTPUT_TOKENS } : {}),
      signal: AbortSignal.timeout(WRITE_TIMEOUT_MS)
    };
    // The pipeline the task has in the bot: automatic posts get the fact check, the owner's tasks do not.
    const run = row.mode === 'automatic' ? generateCheckedDraft(meter.deps, input) : generateDraft(meter.deps, input);
    const result = await run.then(
      (value) => ({ ok: true as const, value }),
      (caught: unknown) => {
        onError(caught);
        return { ok: false as const, caught };
      }
    );
    if (!result.ok) {
      error = `${errorOf(result.caught)} · запрос`;
      if (isBudget(result.caught))
        return { generationId: null, error, costMicro: meter.cost(), ms: null, budget: true };
      continue;
    }
    const { generation, text } = result.value;
    // A question instead of a text is the model's answer too (R04 may ask for facts).
    if (text !== null || generation.result === 'needs_facts')
      return {
        generationId: generation.id,
        error: null,
        costMicro: meter.cost(),
        ms: container.clock.now() - started,
        budget: false
      };
    error = `${generation.errorCode ?? 'AI_EMPTY'} · ответ модели`;
  }
  return { generationId: null, error: `${error} (после повтора)`, costMicro: meter.cost(), ms: null, budget: false };
}

/** The text a side shows: its latest version, or the question and ideas it answered with. */
async function outputOf(
  container: Container,
  generationId: string | null
): Promise<{ text: string | null; asked: boolean }> {
  if (generationId === null) return { text: null, asked: false };
  const text = (await container.aiWriter.revisions(generationId)).at(-1)?.text ?? null;
  if (text !== null) return { text, asked: false };
  const generation = await container.aiWriter.findGeneration(generationId);
  if (generation?.result !== 'needs_facts') return { text: null, asked: false };
  const ideas = generation.ideas.map((idea) => `— ${idea}`).join('\n');
  return {
    text: [generation.question ?? '', ideas === '' ? '' : `Идеи:\n${ideas}`].filter(Boolean).join('\n\n'),
    asked: true
  };
}

/** Writes both versions of one pair, then queues its follow-up. Never throws: a failure marks the row. */
export async function runComparison(
  container: Container,
  comparisonId: string,
  requestId: string,
  onError: (error: unknown) => void
): Promise<void> {
  const row = await container.aiComparisons.find(comparisonId).catch((error: unknown) => {
    onError(error);
    return null;
  });
  if (row === null || row.status !== 'writing') return;
  const empty: SideResult = { generationId: null, error: null, costMicro: null, ms: null, budget: false };
  const sides: { a: SideResult; b: SideResult } = { a: empty, b: empty };
  try {
    const deps = await createWriterDeps(container, requestId);
    const previous = row.afterId === null ? null : await container.aiComparisons.find(row.afterId);
    // One side after the other: they share nothing but the task, and each has its own deadline.
    for (const side of ['a', 'b'] as const) {
      const model = side === 'a' ? row.aModel : row.bModel;
      let task = row.task;
      if (previous !== null && row.code !== null) {
        const own = previous.aModel === model ? previous.aGenerationId : previous.bGenerationId;
        task = followUpTask(row.task, row.code, (await outputOf(container, own)).text);
      }
      sides[side] = await writeSide(container, row, model, task, deps, onError);
      // The budget refused one model: the other would be refused too or make the pair lopsided.
      if (sides[side].budget) break;
    }
  } catch (error) {
    onError(error);
    if (sides.a.generationId === null && sides.a.error === null)
      sides.a = { ...empty, error: `${errorOf(error)} · подготовка` };
  }
  const ready = sides.a.generationId !== null && sides.b.generationId !== null;
  await container.aiComparisons
    .finish({
      id: row.id,
      status: ready ? 'ready' : 'failed',
      failure: ready ? null : sides.a.budget || sides.b.budget ? 'budget' : 'error',
      a: sides.a,
      b: sides.b
    })
    .catch(onError);
  const next = await container.aiComparisons.followUp(row.id).catch((error: unknown) => {
    onError(error);
    return null;
  });
  if (next !== null && next.status === 'writing')
    await container.aiJobs.send({ id: container.newId(), kind: 'comparison', comparisonId: next.id }).catch(onError);
}

const toUsd = (micro: number | null) => (micro === null ? null : micro / 1_000_000);

async function toDto(container: Container, row: ComparisonRow, revealed: boolean): Promise<AiComparisonDto> {
  const a = await outputOf(container, row.aGenerationId);
  const b = await outputOf(container, row.bGenerationId);
  const stats = (side: ComparisonRow['a']) => ({ error: side.error, costUsd: toUsd(side.costMicro), ms: side.ms });
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    task: row.task,
    status: row.status,
    failure: row.failure,
    a: a.text,
    b: b.text,
    asked: { a: a.asked, b: b.asked },
    choice: row.choice,
    note: row.note,
    models: revealed ? { a: row.aModel, b: row.bModel } : null,
    stats: revealed ? { a: stats(row.a), b: stats(row.b) } : null
  };
}

export async function readComparisons(container: Container): Promise<AiComparisonsDto> {
  const rows = await container.aiComparisons.list();
  // Blind to the end (owner, 21.10.2026): no model, cost or time until every written pair has a choice.
  const revealed =
    rows.some((row) => row.status === 'ready') &&
    rows.every((row) => row.status === 'failed' || (row.status === 'ready' && row.choice !== null));
  return { items: await Promise.all(rows.map((row) => toDto(container, row, revealed))), revealed };
}

export async function chooseComparison(
  container: Container,
  input: { id: string; choice: 'a' | 'b' | 'same'; note: string | null }
): Promise<AiComparisonDto> {
  const row = await container.aiComparisons.find(input.id);
  if (row === null) throw new AppError('NOT_FOUND', 'No such comparison');
  if (!(await container.aiComparisons.choose({ ...input, now: container.clock.now() })))
    throw new AppError('CONFLICT', 'Still being written', { reason: 'NOT_READY' });
  return toDto(container, { ...row, choice: input.choice, note: input.note }, false);
}
