import { AppError, isAppError } from 'src/lib/errors';
import { logger } from 'src/lib/logger';
import { editorInstructions } from './prompt';
import {
  claimConversation,
  commitReply,
  completeGeneration,
  currentMaterial,
  findGenerationBySource,
  listAuthorExamples,
  listMemory,
  listRubrics,
  monthGenerationCost,
  readConversation,
  recentDialogue,
  releaseConversation,
  reserveGeneration,
  seedRubrics,
} from './queries';
import { editorReplyFormat, editorReplySchema, textMessageSchema, type EditorReply, type TextMessage } from './schema';
import type { GeneratedMaterial, Rubric, TextGenerator } from './types';

type Deps = { d1: D1Database; generator: TextGenerator };

const monthlyLimitMicros = 15_000_000;
const monthlyWarningMicros = 12_000_000;
// Верхняя оценка по самому дорогому доступному Standard-тарифу, включая длинный контекст.
const reserveInputRate = 20;
const reserveOutputRate = 75;
const initialRubrics: readonly Rubric[] = [
  {
    key: 'teach-feeding',
    title: 'Учу фидить в Доту',
    instructions: 'Серьёзный крючок, затем сатирический антисовет про фид и узнаваемую ошибку игрока.',
  },
  {
    key: 'learning-dota',
    title: 'Учусь играть в Доту',
    instructions: 'Наблюдения по герою, трудности и выводы из обучения. Не смешивать с сатирой про фид.',
  },
];

const monthKeyFor = (now: Date) => `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

const parseDecision = (raw: string): EditorReply => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new AppError('outcome_unknown', 'Ответ редактора не является JSON');
  }
  const parsed = editorReplySchema.safeParse(value);
  if (!parsed.success) throw new AppError('outcome_unknown', 'Ответ редактора не прошёл проверку');
  return parsed.data;
};

export const createEditorService = ({ d1, generator }: Deps) => {
  const rubrics = async (): Promise<Rubric[]> => {
    await seedRubrics(d1, initialRubrics);
    return listRubrics(d1);
  };

  const generate = async (rawInput: TextMessage): Promise<GeneratedMaterial | { notConfigured: true }> => {
    const parsed = textMessageSchema.safeParse(rawInput);
    if (!parsed.success) throw new AppError('bad_request', 'Сообщение редактора не прошло проверку');
    const input = parsed.data;
    const existing = await findGenerationBySource(d1, input.chatId, input.messageId);
    if (existing?.state === 'succeeded' && existing.responseText) return { text: existing.responseText, reused: true };
    if (existing)
      throw new AppError(
        existing.state === 'failed' ? 'bad_request' : 'outcome_unknown',
        'Запрос уже был принят; повторный вызов ИИ запрещён',
      );
    if (!generator.configured) return { notConfigured: true };

    const token = crypto.randomUUID();
    if (!(await claimConversation(d1, input, token)))
      throw new AppError('operation_busy', 'Редактор ещё отвечает на предыдущее сообщение');
    try {
      const [items, memory, history, conversation] = await Promise.all([
        rubrics(),
        listMemory(d1),
        recentDialogue(d1, input),
        readConversation(d1, input.chatId, input.threadId),
      ]);
      const activeMaterial = await currentMaterial(d1, conversation?.materialId);
      const exampleGroups = await Promise.all([
        ...items.map(async (rubric) => ({ rubricKey: rubric.key, texts: await listAuthorExamples(d1, rubric.key) })),
        (async () => ({ rubricKey: null, texts: await listAuthorExamples(d1, null) }))(),
      ]);
      const visibleMemory = memory.slice(0, 24);
      const context = {
        currentMessage: input.text,
        history: history
          .reverse()
          .map((turn) => ({ user: turn.user.slice(0, 2000), assistant: turn.assistant?.slice(0, 2500) })),
        currentMaterial: activeMaterial
          ? { content: activeMaterial.content.slice(0, 12000), rubricKey: conversation?.rubricKey }
          : null,
        legacyPending: { draft: conversation?.draftText?.slice(0, 5000), task: conversation?.taskText?.slice(0, 1000) },
        rubrics: items,
        memory: visibleMemory.map((item) => ({
          id: item.id,
          scope: item.scope,
          rubricKey: item.rubricKey,
          value: item.value.slice(0, 1000),
        })),
        examples: exampleGroups.map((group) => ({
          ...group,
          texts: group.texts.slice(0, 2).map((text) => text.slice(0, 2000)),
        })),
      };
      const prompt = JSON.stringify(context);
      // UTF-8 байты — консервативная верхняя оценка числа токенов; учитываем схему и накладные расходы.
      const inputBytes = new TextEncoder().encode(
        editorInstructions + prompt + JSON.stringify(editorReplyFormat),
      ).length;
      const reservedCostMicros = (inputBytes + 1024) * reserveInputRate + 2400 * reserveOutputRate;
      const now = Date.now();
      const id = crypto.randomUUID();
      const reservation = await reserveGeneration(
        d1,
        {
          id,
          sourceChatId: input.chatId,
          sourceMessageId: input.messageId,
          threadId: input.threadId,
          materialId: null,
          decisionText: null,
          monthKey: monthKeyFor(new Date(now)),
          requestText: input.text,
          state: 'calling',
          reservedCostMicros,
          chargedCostMicros: reservedCostMicros,
          inputTokens: null,
          outputTokens: null,
          responseText: null,
          createdAt: now,
          updatedAt: now,
        },
        monthlyLimitMicros,
      );
      if (!reservation)
        throw new AppError('budget_exhausted', 'Недостаточно месячного бюджета для безопасного резерва');
      if (reservation.id !== id) throw new AppError('operation_busy', 'Этот запрос уже принят');

      let result: Awaited<ReturnType<TextGenerator['generate']>> | undefined;
      try {
        result = await generator.generate({ instructions: editorInstructions, prompt, format: editorReplyFormat });
        const decision = parseDecision(result.text);
        const invalid = () => {
          throw new AppError('outcome_unknown', 'Редактор предложил недопустимое действие');
        };
        if (decision.rubricKey && !items.some((item) => item.key === decision.rubricKey)) invalid();
        if (decision.memoryId && !visibleMemory.some((item) => item.id === decision.memoryId)) invalid();
        const persistentAction = ['save_draft', 'save_example', 'remember', 'forget'].includes(decision.action);
        if (persistentAction && (!decision.evidence || !input.text.includes(decision.evidence))) invalid();
        if (['material', 'save_draft', 'save_example', 'remember'].includes(decision.action) && !decision.content)
          invalid();
        if (decision.action === 'remember' && (decision.content?.length ?? 0) > 1000) invalid();
        if (decision.action === 'forget' && !decision.memoryId) invalid();
        if (
          decision.action === 'save_example' &&
          ![input.text, ...history.map((turn) => turn.user), conversation?.draftText ?? ''].some((source) =>
            source.includes(decision.content ?? '\u0000'),
          )
        )
          invalid();
        if (decision.continuesMaterial && (!activeMaterial || decision.action !== 'material')) invalid();
        if (decision.continuesMaterial && decision.rubricKey !== conversation?.rubricKey) invalid();
        const writesMaterial = ['material', 'save_draft', 'save_example'].includes(decision.action);
        const materialId = writesMaterial
          ? decision.continuesMaterial
            ? (activeMaterial?.materialId ?? null)
            : crypto.randomUUID()
          : null;
        const text =
          decision.action === 'material' && decision.content
            ? `${decision.reply}\n\n${decision.content}`
            : decision.reply;
        const chargedCost =
          result.costMicros ??
          Math.ceil(result.inputTokens * reserveInputRate + result.outputTokens * reserveOutputRate);
        const committed = await commitReply(d1, input, token, decision, {
          generationId: id,
          materialId,
          continuing: decision.continuesMaterial,
          cost: chargedCost,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          responseText: text,
        });
        if (!committed) throw new AppError('outcome_unknown', 'Аренда диалога истекла до сохранения');
      } catch (error) {
        const unknown = result !== undefined || !isAppError(error) || error.code === 'outcome_unknown';
        await completeGeneration(d1, {
          id,
          state: unknown ? 'unknown' : 'failed',
          chargedCostMicros: unknown ? reservedCostMicros : 0,
          inputTokens: result?.inputTokens ?? null,
          outputTokens: result?.outputTokens ?? null,
          responseText: null,
        });
        throw error;
      }
      const saved = await findGenerationBySource(d1, input.chatId, input.messageId);
      if (!saved?.responseText) throw new AppError('outcome_unknown', 'Нет сохранённого ответа');
      const cost = await monthGenerationCost(d1, monthKeyFor(new Date(now)));
      return {
        text: saved.responseText,
        reused: false,
        ...(cost >= monthlyWarningMicros ? { budgetWarning: true } : {}),
      };
    } finally {
      await releaseConversation(d1, input, token).catch(() =>
        logger.warn('editor conversation release failed', { messageId: input.messageId }),
      );
    }
  };

  return { generate, rubrics, memory: () => listMemory(d1) };
};

export type EditorService = ReturnType<typeof createEditorService>;
