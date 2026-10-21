import type { AiComparisonDto, AiComparisonsDto } from '@alexeev/contracts';
import {
  generateCheckedDraft,
  generateDraft,
  providerOfModel,
  readAiSettings,
  type ComparisonRow,
  type ComparisonTask
} from '../../modules/ai';
import { AppError } from '../../shared/app-error';
import { createWriterDeps } from '../bot/writer-deps';
import type { Container } from '../container';

// The blind provider comparison (owner, 21.10.2026; docs/ai/claude-provider.md §3): the latest automatic writer tasks,
// each written by the settings' draft model and by Claude Opus 5.5 through the same pipeline (draft, fact check, fix),
// in random A/B order. The owner picks without knowing which is which; the models show after the pick.

export const CLAUDE_MODEL = 'claude-opus-5-5';
const TASKS = 8;
/** Rubric scripts among the pairs (owner, 21.10.2026: the rubrics are compared too); the rest are automatic posts. */
const RUBRIC_TASKS = 3;
const WRITE_TIMEOUT_MS = 180_000;

const RUBRIC_LABEL: Partial<Record<ComparisonTask['format'], string>> = {
  igrat: 'Учусь играть',
  fidit: 'Учу фидить'
};

const labelOf = ({ task, format }: ComparisonTask) => {
  const line = (task.split('\n')[0] ?? task).replace(/^Повод:\s*/, '');
  const rubric = RUBRIC_LABEL[format];
  return (rubric === undefined ? line : `${rubric} · ${line}`).slice(0, 200);
};

/** Queues the comparisons; the number queued. */
export async function startComparisons(container: Container, random: () => number = Math.random): Promise<number> {
  const settings = await readAiSettings(container.aiRepository);
  const other =
    settings.draftModel !== null && providerOfModel(settings.draftModel) === 'openai' ? settings.draftModel : null;
  if (other === null || !container.aiKeys.openai || !container.aiKeys.anthropic)
    throw new AppError('UNAVAILABLE', 'Both providers need a key and an OpenAI draft model', { reason: 'NO_KEY' });
  const rubrics = await container.aiComparisons.rubricTasks(RUBRIC_TASKS);
  const automatic = await container.aiComparisons.automaticTasks(TASKS - rubrics.length);
  const tasks = [...automatic, ...rubrics];
  const now = container.clock.now();
  const rows = tasks.map((task) => {
    const claudeFirst = random() < 0.5;
    return {
      ...task,
      id: container.newId(),
      label: labelOf(task),
      aModel: claudeFirst ? CLAUDE_MODEL : other,
      bModel: claudeFirst ? other : CLAUDE_MODEL,
      now
    };
  });
  await container.aiComparisons.create(rows);
  for (const row of rows)
    await container.aiJobs.send({ id: container.newId(), kind: 'comparison', comparisonId: row.id });
  return rows.length;
}

/** Writes both versions of one comparison. Never throws: a failure marks the row. */
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
  const ids: (string | null)[] = [];
  try {
    const deps = await createWriterDeps(container, requestId);
    // One after the other: the pair shares nothing but the task, and each has its own deadline.
    for (const model of [row.aModel, row.bModel]) {
      const input = {
        format: row.format,
        mode: row.mode,
        source: 'studio' as const,
        task: row.task,
        model,
        signal: AbortSignal.timeout(WRITE_TIMEOUT_MS)
      };
      // The pipeline the task had in the bot: automatic posts get the fact check, the owner's rubric tasks do not.
      const result = await (
        row.mode === 'automatic' ? generateCheckedDraft(deps, input) : generateDraft(deps, input)
      ).catch((error: unknown) => {
        onError(error);
        return null;
      });
      ids.push(result?.text ? result.generation.id : null);
    }
  } catch (error) {
    onError(error);
  }
  const [a = null, b = null] = ids;
  await container.aiComparisons
    .finish({ id: row.id, status: a !== null && b !== null ? 'ready' : 'failed', aGenerationId: a, bGenerationId: b })
    .catch(onError);
}

async function toDto(container: Container, row: ComparisonRow): Promise<AiComparisonDto> {
  const textOf = async (generationId: string | null) =>
    generationId === null ? null : ((await container.aiWriter.revisions(generationId)).at(-1)?.text ?? null);
  return {
    id: row.id,
    label: row.label,
    status: row.status,
    a: await textOf(row.aGenerationId),
    b: await textOf(row.bGenerationId),
    choice: row.choice,
    note: row.note,
    models: row.choice === null ? null : { a: row.aModel, b: row.bModel }
  };
}

export async function readComparisons(container: Container): Promise<AiComparisonsDto> {
  const rows = await container.aiComparisons.list();
  const wins = new Map<string, number>();
  let same = 0;
  for (const row of rows) {
    if (row.choice === 'same') same += 1;
    else if (row.choice !== null) {
      const model = row.choice === 'a' ? row.aModel : row.bModel;
      wins.set(model, (wins.get(model) ?? 0) + 1);
    }
  }
  return {
    items: await Promise.all(rows.map((row) => toDto(container, row))),
    tally: { wins: [...wins].map(([model, count]) => ({ model, count })), same }
  };
}

export async function chooseComparison(
  container: Container,
  input: { id: string; choice: 'a' | 'b' | 'same'; note: string | null }
): Promise<AiComparisonDto> {
  const row = await container.aiComparisons.find(input.id);
  if (row === null) throw new AppError('NOT_FOUND', 'No such comparison');
  if (!(await container.aiComparisons.choose({ ...input, now: container.clock.now() })))
    throw new AppError('CONFLICT', 'Still being written', { reason: 'NOT_READY' });
  return toDto(container, { ...row, choice: input.choice, note: input.note });
}
