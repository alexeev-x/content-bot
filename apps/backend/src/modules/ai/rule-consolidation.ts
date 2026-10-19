import { z } from 'zod';
import type { Clock } from '../../platform/clock';
import type { AiRepository } from './d1-ai-repository';
import type { RuleEvidence, RuleRow, RuleScope, RulesRepository } from './d1-rules-repository';
import { AiProviderError, type AiTextProvider, type ReviewVideoFormat } from './ports';
import { assertAiReady, type BudgetEvent, readAiSettings, recordAiUsage } from './service';

// The weekly consolidation of analysis rules (AI plan P7, §6.2–6.3). Code measures, the model only reads scripts:
// it never sees how a video did (review 19.10.2026: a model that knows the result reads the script to fit it), so
// it says which scripts follow which rule and names techniques several scripts share; whether a video beat the
// same-rubric videos at 72 h is a stored fact the code adds. Every video counts once per rule, a video measured
// before a rule existed never counts as its fresh support, the status comes from the counts alone, and nothing
// reaches a prompt before the owner says «Учитывать».

/** Fewer videos than this say nothing a rule could stand on; no model call. */
export const CONSOLIDATION_MIN_VIDEOS = 3;
/** The newest videos looked at, one per script. */
export const CONSOLIDATION_MAX_VIDEOS = 20;
const SCRIPT_MAX = 900;
const PROPOSALS_MAX = 3;
/** New rules stored per run (a proposal makes one per rubric it has data in). */
const CREATED_MAX = 3;
const RULE_TEXT_MIN = 10;
const RULE_TEXT_MAX = 200;
/** A new rule needs this many of its videos of one rubric above the usual. */
const PROPOSAL_MIN_ABOVE = 2;
const CLOSED_SHOWN = 15;
/** Room for a reasoning model's thinking before a short structured answer. */
const MAX_OUTPUT_TOKENS = 4000;

/** One script's measured result: its videos were above or below the same-rubric videos at 72 h. */
export interface RuleVideo {
  /** `script:<approved revision id>`. */
  key: string;
  format: ReviewVideoFormat;
  result: 'above' | 'below';
  /** When the result was stored, UTC ms. */
  measuredAt: number;
  script: string;
}

const RUBRIC: Record<RuleScope, string> = {
  all: 'все рубрики',
  igrat: '«Учусь играть»',
  fidit: '«Учу фидить»',
  standalone: 'рилсы вне рубрик',
  telegram: 'посты'
};

const INSTRUCTIONS = [
  'Ты — редактор шортсов автора ALEXEEV (Дота, YouTube и TikTok). Раз в неделю читаешь его сценарии и отмечаешь приёмы письма.',
  'В ДАННЫХ: сценарии (ключ v…, рубрика, текст) и правила (ключ r…, рубрика). Как ролики набрали просмотры, ты не знаешь — и не угадывай.',
  'follows: для каждого правила — сценарии той же рубрики, которые явно следуют правилу. Только то, что видно в тексте: первая фраза, длина, концовка, построение, подача. Сомневаешься — не включай.',
  `proposals: до ${PROPOSALS_MAX} приёмов письма, которые явно есть в нескольких сценариях одной рубрики и отсутствуют в других её сценариях; в videos — все сценарии с этим приёмом.`,
  'Приём — одно проверяемое указание сценаристу в повелительном наклонении, до 150 символов, по-русски. Не про конкретного героя, патч, тему или длину в секундах. Не повторяй и не перефразируй существующие и отклонённые правила. Нет явного приёма — proposals пустой.'
].join('\n');

const JSON_SCHEMA: { name: string; schema: Record<string, unknown> } = {
  name: 'rule_consolidation',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['follows', 'proposals'],
    properties: {
      follows: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['rule', 'videos'],
          properties: { rule: { type: 'string' }, videos: { type: 'array', items: { type: 'string' } } }
        }
      },
      proposals: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['text', 'videos'],
          properties: { text: { type: 'string' }, videos: { type: 'array', items: { type: 'string' } } }
        }
      }
    }
  }
};

const answerSchema = z.object({
  follows: z.array(z.object({ rule: z.string(), videos: z.array(z.string()).max(50) })).max(50),
  proposals: z.array(z.object({ text: z.string(), videos: z.array(z.string()).max(50) })).max(10)
});

export interface ConsolidationDeps {
  repo: AiRepository;
  rules: RulesRepository;
  clock: Clock;
  timezone: string;
  newId: () => string;
  provider: AiTextProvider | null;
}

export interface ConsolidationResult {
  /** Supported analysis rules the owner has not answered yet: each is asked once. */
  toApprove: RuleRow[];
  /** Approved rules the new evidence took out of use (back to candidate or retired): the owner is told. */
  retired: Pick<RuleRow, 'id' | 'text' | 'scope' | 'status'>[];
  created: number;
  evidence: number;
  /** New rules not stored because the open analysis rules are at their cap. */
  capped: number;
  /** Why nothing was weighed: too few videos, a provider failure, an answer of the wrong shape. */
  errorCode: string | null;
  budgetEvents: BudgetEvent[];
}

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

function dataBlock(videos: readonly RuleVideo[], open: readonly RuleRow[], others: readonly RuleRow[]): string {
  const lines = ['СЦЕНАРИИ:'];
  videos.forEach((video, index) => {
    const script = Array.from(video.script.replace(/\s+/g, ' ').trim()).slice(0, SCRIPT_MAX).join('');
    lines.push(`v${index + 1} | ${RUBRIC[video.format]} | «${script}»`);
  });
  lines.push('', 'ПРАВИЛА ДЛЯ ПРОВЕРКИ:');
  if (open.length === 0) lines.push('нет');
  open.forEach((rule, index) => lines.push(`r${index + 1} | ${RUBRIC[rule.scope]} | ${rule.text}`));
  lines.push('', 'УЖЕ ЕСТЬ ИЛИ ОТКЛОНЕНЫ (не предлагай снова):');
  if (others.length === 0) lines.push('нет');
  others.forEach((rule) => lines.push(`- ${rule.text}`));
  return lines.join('\n');
}

const covers = (scope: RuleScope, format: ReviewVideoFormat) => scope === 'all' || scope === format;

/**
 * Weighs this week's videos against the open analysis rules and stores what the answer supports; returns the
 * rules to ask the owner about and the approved ones that left use. AI off or out of budget throws AppError
 * UNAVAILABLE, as everywhere; any other failure leaves the stored rules as they were (MEM-12).
 */
export async function consolidateRules(
  deps: ConsolidationDeps,
  input: { videos: readonly RuleVideo[]; sourceRef: string; signal: AbortSignal }
): Promise<ConsolidationResult> {
  const videos = input.videos.slice(0, CONSOLIDATION_MAX_VIDEOS);
  const empty = { retired: [], created: 0, evidence: 0, capped: 0 };
  const withQuestions = async (rest: Omit<ConsolidationResult, 'toApprove'>): Promise<ConsolidationResult> => ({
    ...rest,
    toApprove: (await deps.rules.openAnalysisRules()).filter(
      (rule) => rule.status !== 'candidate' && rule.approvedAt === null
    )
  });
  if (videos.length < CONSOLIDATION_MIN_VIDEOS)
    return withQuestions({ ...empty, errorCode: 'AI_TOO_FEW_VIDEOS', budgetEvents: [] });
  const open = await deps.rules.openAnalysisRules();
  const others = [
    ...(await deps.rules.inUse(CLOSED_SHOWN)).filter((rule) => rule.source === 'owner'),
    ...(await deps.rules.closedAnalysisRules(CLOSED_SHOWN))
  ];
  const settings = await readAiSettings(deps.repo);
  // The draft model: a rule it words goes into the owner's scripts (owner: quality first).
  const { provider, model } = await assertAiReady(deps, settings, settings.draftModel ?? settings.cheapModel);
  let completion;
  try {
    completion = await provider.complete({
      model,
      instructions: INSTRUCTIONS,
      input: `ДАННЫЕ:\n${dataBlock(videos, open, others)}`,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      jsonSchema: JSON_SCHEMA,
      signal: input.signal
    });
  } catch (error) {
    if (!(error instanceof AiProviderError)) throw error;
    return withQuestions({ ...empty, errorCode: error.code, budgetEvents: [] });
  }
  const budgetEvents = await recordAiUsage(deps, {
    kind: 'other',
    provider: provider.provider,
    model: completion.model,
    usage: completion.usage,
    settings
  });
  let answer: z.infer<typeof answerSchema>;
  try {
    answer = answerSchema.parse(JSON.parse(completion.text));
  } catch {
    return withQuestions({ ...empty, errorCode: 'AI_BAD_FORMAT', budgetEvents });
  }

  // A key the data does not have is dropped, never guessed.
  const videoOf = (ref: string) => videos[Number(/^v(\d+)$/.exec(ref.trim())?.[1] ?? 0) - 1];
  const ruleOf = (ref: string) => open[Number(/^r(\d+)$/.exec(ref.trim())?.[1] ?? 0) - 1];
  const evidenceFor = (rule: { id: string; scope: RuleScope; createdAt: number }, refs: readonly string[]) => {
    const rows = new Map<string, RuleEvidence>();
    for (const ref of refs) {
      const video = videoOf(ref);
      if (video === undefined || !covers(rule.scope, video.format)) continue;
      rows.set(video.key, {
        ruleId: rule.id,
        key: video.key,
        polarity: video.result === 'above' ? 'support' : 'contradict',
        // Measured before the rule existed: the rule may have been fitted to it, so it is never fresh support.
        sourceRef: video.measuredAt < rule.createdAt ? 'origin' : input.sourceRef
      });
    }
    return [...rows.values()];
  };

  const evidence: RuleEvidence[] = [];
  for (const row of answer.follows) {
    const rule = ruleOf(row.rule);
    if (rule !== undefined) evidence.push(...evidenceFor(rule, row.videos));
  }
  // Every closed rule, not only the ones the prompt shows: decay keeps adding them (review 19.10.2026).
  const known = new Set(
    [...open.map((rule) => rule.text), ...others.map((rule) => rule.text), ...(await deps.rules.closedRuleTexts())].map(
      normalize
    )
  );
  let created = 0;
  let capped = 0;
  const now = deps.clock.now();
  for (const proposal of answer.proposals.slice(0, PROPOSALS_MAX)) {
    const text = proposal.text.replace(/\s+/g, ' ').trim();
    const length = Array.from(text).length;
    if (length < RULE_TEXT_MIN || length > RULE_TEXT_MAX || known.has(normalize(text))) continue;
    known.add(normalize(text));
    // A rule is for one rubric, the one its videos are from: never wider than the data (§6.3), never posts.
    const listed = [...new Set(proposal.videos.map(videoOf).filter((video) => video !== undefined))];
    for (const format of ['igrat', 'fidit', 'standalone'] as const) {
      const above = listed.filter((video) => video.format === format && video.result === 'above').length;
      if (above < PROPOSAL_MIN_ABOVE) continue;
      if (created >= CREATED_MAX) break;
      const id = deps.newId();
      if (!(await deps.rules.createAnalysisRule({ id, text, scope: format, now }))) {
        capped += 1;
        continue;
      }
      created += 1;
      evidence.push(...evidenceFor({ id, scope: format, createdAt: now }, proposal.videos));
    }
  }
  // Runs every week even without evidence: candidates nothing confirmed for long retire here.
  const stored = await deps.rules.addEvidence(evidence, now);
  return withQuestions({
    retired: stored.retired,
    created,
    evidence: stored.added,
    capped,
    errorCode: null,
    budgetEvents
  });
}
