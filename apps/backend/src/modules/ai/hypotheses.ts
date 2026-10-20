import { AI_HYPOTHESES_LIST_LIMIT, type AiHypothesesDto } from '@alexeev/contracts';
import { z } from 'zod';
import type { Clock } from '../../platform/clock';
import { unverifiedNumbers } from './analytics-review';
import type { AiRepository } from './d1-ai-repository';
import type {
  HypothesesRepository,
  HypothesisConfidence,
  HypothesisRow,
  HypothesisStatus
} from './d1-hypotheses-repository';
import { AiProviderError, type AiTextProvider } from './ports';
import { assertAiReady, type BudgetEvent, readAiSettings, recordAiUsage } from './service';
import type { WriterFormat } from './writer-types';

// The analyst's memory (owner, 20.10.2026: «он считает, советует, запоминает»): every Monday the open hypotheses are
// weighed against the week's numbers. Code keeps the rules: a verdict names only a hypothesis it was given, its
// reason may only repeat numbers of the facts, «supported» needs medium confidence, and a refuted one is final.

const MAX_OUTPUT_TOKENS = 3000;
const NOTE_MAX = 240;

const SCOPE_NAME: Record<WriterFormat, string> = {
  fidit: '«Учу фидить»',
  igrat: '«Учусь играть»',
  standalone: 'рилсы вне рубрик',
  telegram: 'посты в Telegram'
};
const STATUS_NAME: Record<HypothesisStatus, string> = {
  open: 'открыта',
  supported: 'подтверждается',
  refuted: 'не подтвердилась'
};
const CONFIDENCE_NAME: Record<HypothesisConfidence, string> = { low: 'низкая', medium: 'средняя' };

/** The studio's list (GET /api/v1/ai/hypotheses): newest change first. */
export async function readHypotheses(hypotheses: Pick<HypothesesRepository, 'recent'>): Promise<AiHypothesesDto> {
  const rows = await hypotheses.recent(AI_HYPOTHESES_LIST_LIMIT);
  return {
    items: rows.map((row) => ({
      code: row.code,
      text: row.text,
      scope: row.scope,
      kind: row.kind,
      status: row.status,
      confidence: row.confidence,
      note: row.note,
      asked: row.lessonId !== null,
      updatedAt: new Date(row.updatedAt).toISOString()
    }))
  };
}

/** The hypotheses as the reviews see them: «H3 · «Учу фидить» · как писать · открыта (низкая): …». */
export function hypothesisLines(rows: readonly HypothesisRow[]): string[] {
  return rows.map((row) =>
    [
      `H${row.code}`,
      SCOPE_NAME[row.scope],
      row.kind === 'writing' ? 'как писать' : 'о чём снимать',
      `${STATUS_NAME[row.status]} (${CONFIDENCE_NAME[row.confidence]}): ${row.text}`,
      row.note === null ? null : `последнее: ${row.note}`
    ]
      .filter(Boolean)
      .join(' · ')
  );
}

const INSTRUCTIONS = [
  'Ты — аналитик канала автора ALEXEEV (шортсы про Доту на YouTube и TikTok, Telegram-канал). Раз в неделю ты пересматриваешь свои гипотезы по цифрам недели.',
  'ДАННЫЕ — единственный источник. Числа в note бери только оттуда, слово в слово; ролики называй их ключами (V1, YR1).',
  'Для каждой гипотезы из списка «Гипотезы» верни verdict: code — её номер без H; status — open (данных пока мало или они противоречивы), supported (цифры недели её поддерживают), refuted (цифры ей противоречат); confidence — low или medium; note — одна-две фразы, на каких цифрах вывод.',
  'supported — только с confidence medium и только если поддержка видна на нескольких роликах, а не на одном. Сомневаешься — open. Доказательств причин у нас нет: удержания и досмотров в данных нет.',
  'Пиши по-русски, коротко.'
].join('\n');

const JSON_SCHEMA = {
  name: 'hypotheses_review',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['verdicts'],
    properties: {
      verdicts: {
        type: 'array',
        maxItems: 16,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['code', 'status', 'confidence', 'note'],
          properties: {
            code: { type: 'integer' },
            status: { type: 'string', enum: ['open', 'supported', 'refuted'] },
            confidence: { type: 'string', enum: ['low', 'medium'] },
            note: { type: 'string' }
          }
        }
      }
    }
  }
};

const answerSchema = z.object({
  verdicts: z
    .array(
      z.object({
        code: z.number().int(),
        status: z.enum(['open', 'supported', 'refuted']),
        confidence: z.enum(['low', 'medium']),
        note: z.string().transform((value) => Array.from(value.replace(/\s+/g, ' ').trim()).slice(0, NOTE_MAX).join(''))
      })
    )
    .max(16)
});

export interface HypothesesReviewDeps {
  repo: AiRepository;
  hypotheses: HypothesesRepository;
  clock: Clock;
  timezone: string;
  newId: () => string;
  provider: AiTextProvider | null;
}

export interface HypothesisChange {
  row: HypothesisRow;
  status: HypothesisStatus;
  confidence: HypothesisConfidence;
  note: string;
}

/**
 * Weighs the open and supported hypotheses against a report's facts and stores the verdicts. Returns what changed
 * and the writing hypotheses that became supported (the app puts those to the owner). AI off or out of budget
 * throws AppError UNAVAILABLE, as everywhere; a provider failure or a wrong shape changes nothing.
 */
export async function reviewHypotheses(
  deps: HypothesesReviewDeps,
  input: { facts: string; sourceRef: string; signal: AbortSignal }
): Promise<{
  changes: HypothesisChange[];
  newlySupported: HypothesisRow[];
  errorCode: string | null;
  budgetEvents: BudgetEvent[];
}> {
  const active = await deps.hypotheses.active(16);
  if (active.length === 0) return { changes: [], newlySupported: [], errorCode: null, budgetEvents: [] };
  const settings = await readAiSettings(deps.repo);
  const { provider, model } = await assertAiReady(deps, settings, settings.draftModel ?? settings.cheapModel);
  let result;
  try {
    result = await provider.complete({
      model,
      instructions: INSTRUCTIONS,
      input: `ДАННЫЕ:\n${input.facts}\n\nГипотезы:\n${hypothesisLines(active).join('\n')}`,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      jsonSchema: JSON_SCHEMA,
      signal: input.signal
    });
  } catch (error) {
    if (!(error instanceof AiProviderError)) throw error;
    return { changes: [], newlySupported: [], errorCode: error.code, budgetEvents: [] };
  }
  const budgetEvents = await recordAiUsage(deps, {
    id: deps.newId(),
    kind: 'other',
    provider: provider.provider,
    model: result.model,
    usage: result.usage,
    settings
  });
  let verdicts: z.infer<typeof answerSchema>['verdicts'];
  try {
    verdicts = answerSchema.parse(JSON.parse(result.text)).verdicts;
  } catch {
    return { changes: [], newlySupported: [], errorCode: 'AI_BAD_FORMAT', budgetEvents };
  }
  const now = deps.clock.now();
  const changes: HypothesisChange[] = [];
  for (const verdict of verdicts) {
    const row = active.find((each) => each.code === verdict.code);
    // A verdict about a hypothesis it was not given, a repeat, or a reason with a number of its own is dropped.
    if (row === undefined || changes.some((change) => change.row.id === row.id) || verdict.note === '') continue;
    const check = { main: verdict.note, points: [], question: '', steps: [] };
    if (unverifiedNumbers(check, input.facts).length > 0) continue;
    const status = verdict.status === 'supported' && verdict.confidence !== 'medium' ? 'open' : verdict.status;
    // The confidence of the verdict kept, not of a dropped repeat (review 20.10.2026).
    changes.push({ row, status, confidence: verdict.confidence, note: verdict.note });
  }
  await deps.hypotheses.review(
    changes.map((change) => ({
      id: change.row.id,
      status: change.status,
      confidence: change.confidence,
      note: change.note,
      sourceRef: input.sourceRef,
      now
    }))
  );
  const newlySupported = changes
    .filter((change) => change.status === 'supported' && change.row.kind === 'writing' && change.row.lessonId === null)
    .map((change) => ({ ...change.row, status: change.status, note: change.note }));
  return { changes, newlySupported, errorCode: null, budgetEvents };
}
