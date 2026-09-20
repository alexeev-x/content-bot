import { AppError, isAppError } from 'src/lib/errors';
import {
  completeGeneration,
  findGenerationBySource,
  findMaterialBySource,
  listAuthorExamples,
  listMemory,
  listRubrics,
  monthGenerationCost,
  reserveGeneration,
  saveAssistantVersion,
  saveMaterial,
  saveMemory,
  seedRubrics,
} from './queries';
import type { TextMessage } from './schema';
import type { GeneratedMaterial, Rubric, SavedMaterial, TextGenerator } from './types';

type Deps = { d1: D1Database; generator: TextGenerator };

const monthlyLimitMicros = 15_000_000;
const monthlyWarningMicros = 12_000_000;
const inputTokenCostMicros = 2;
const outputTokenCostMicros = 12;
const maxOutputTokenCostMicros = 1_200 * outputTokenCostMicros;

const initialRubrics: readonly Rubric[] = [
  {
    key: 'teach-feeding',
    title: 'Учу фидить в Доту',
    instructions: 'Начинай с серьёзной и открытой фразы-крючка, затем рассказывай, как фидить.',
  },
  {
    key: 'learning-dota',
    title: 'Учусь играть в Доту',
    instructions: 'Мысли по герою и процессу обучения; структура не повторяет рубрику про фид.',
  },
];

const exampleMarker = /сохрани\s+(?:это\s+)?как\s+пример/i;
const directivePadding = /^[\s:—-]+/;

const textForMaterial = (text: string, kind: 'draft' | 'author_example') => {
  if (kind === 'draft') return text;

  const marker = exampleMarker.exec(text);
  if (!marker || marker.index === undefined) return text;
  const after = text
    .slice(marker.index + marker[0].length)
    .replace(directivePadding, '')
    .trim();
  if (after) return after;
  return (
    text
      .slice(0, marker.index)
      .replace(/^это\s+мой\s+(?:готовый\s+)?текст[\s,:—-]*/i, '')
      .trim() || text
  );
};

const isGenerationRequest = (text: string) =>
  /\b(?:придумай|напиши|сделай|перепиши|подготовь|сценарий|пост|рилс|ролик)\b/i.test(text);

const monthKeyFor = (now: Date) => `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

const costMicros = (inputTokens: number, outputTokens: number) =>
  inputTokens * inputTokenCostMicros + outputTokens * outputTokenCostMicros;

export const createEditorService = ({ d1, generator }: Deps) => {
  const ensureRubrics = async () => seedRubrics(d1, initialRubrics);

  const rubrics = async (): Promise<Rubric[]> => {
    await ensureRubrics();
    return listRubrics(d1);
  };

  const matchingRubric = (text: string, items: readonly Rubric[]) =>
    items.find((item) => text.toLocaleLowerCase('ru').includes(item.title.toLocaleLowerCase('ru')));

  return {
    rubrics,
    remember: async ({ chatId, messageId, value }: { chatId: number; messageId: number; value: string }) => {
      const trimmed = value.trim();
      if (!trimmed) throw new AppError('bad_request', 'Memory rule is empty');
      await saveMemory(d1, {
        id: crypto.randomUUID(),
        sourceChatId: chatId,
        sourceMessageId: messageId,
        scope: 'global',
        rubricKey: null,
        value: trimmed,
        sourceMaterialId: null,
      });
    },
    memory: async () => listMemory(d1),
    saveText: async (input: TextMessage): Promise<SavedMaterial> => {
      const items = await rubrics();
      const rubric = matchingRubric(input.text, items);
      const kind = exampleMarker.test(input.text) ? 'author_example' : 'draft';
      const content = textForMaterial(input.text, kind);
      const existing = await findMaterialBySource(d1, input.chatId, input.messageId);
      const material = await saveMaterial(
        d1,
        existing ?? {
          id: crypto.randomUUID(),
          sourceChatId: input.chatId,
          sourceMessageId: input.messageId,
          threadId: input.threadId,
          rubricKey: rubric?.key ?? null,
          kind,
          createdAt: Date.now(),
        },
        content,
      );
      return { id: material.id, kind: material.kind, ...(rubric ? { rubric } : {}) };
    },
    generate: async (input: TextMessage): Promise<GeneratedMaterial | { rubricRequired: true }> => {
      const material = await (async () => {
        const saved = await (async () => {
          const items = await rubrics();
          const rubric = matchingRubric(input.text, items);
          const existing = await findMaterialBySource(d1, input.chatId, input.messageId);
          const row = await saveMaterial(
            d1,
            existing ?? {
              id: crypto.randomUUID(),
              sourceChatId: input.chatId,
              sourceMessageId: input.messageId,
              threadId: input.threadId,
              rubricKey: rubric?.key ?? null,
              kind: 'draft' as const,
              createdAt: Date.now(),
            },
            input.text,
          );
          return { row, rubric };
        })();
        return saved;
      })();
      if (!material.rubric) return { rubricRequired: true };

      const existing = await findGenerationBySource(d1, input.chatId, input.messageId);
      if (existing?.state === 'succeeded' && existing.responseText)
        return { text: existing.responseText, reused: true };
      if (existing)
        throw new AppError(
          existing.state === 'failed' ? 'bad_request' : 'outcome_unknown',
          existing.state === 'failed'
            ? 'Этот запрос уже завершился ошибкой. Отправь его новым сообщением.'
            : 'Исход предыдущего запроса неизвестен. Не повторяю платную генерацию вслепую.',
        );

      const [memory, examples] = await Promise.all([listMemory(d1), listAuthorExamples(d1, material.rubric.key)]);
      const instructions = [
        'Ты редактор контента автора о Dota 2. Пиши по-русски.',
        `Рубрика «${material.rubric.title}»: ${material.rubric.instructions}`,
        'Не выдумывай от лица автора личный опыт, матчи, ранг, факты или свежие новости.',
        'Если пользователь просит идеи — дай несколько коротких вариантов. Если просит готовый текст — дай готовый текст.',
        memory.length
          ? `Постоянные правила автора:\n${memory
              .slice(0, 12)
              .map((item) => `- ${item.value}`)
              .join('\n')}`
          : '',
        examples.length
          ? `Авторские примеры для ориентира:\n${examples.map((item, index) => `${index + 1}. ${item.slice(0, 3_000)}`).join('\n')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n');
      const prompt = input.text.slice(0, 20_000);
      const reservedCostMicros = Math.max(
        30_000,
        (instructions.length + prompt.length) * inputTokenCostMicros + maxOutputTokenCostMicros,
      );
      const now = Date.now();
      const id = crypto.randomUUID();
      const reservation = await reserveGeneration(
        d1,
        {
          id,
          sourceChatId: input.chatId,
          sourceMessageId: input.messageId,
          materialId: material.row.id,
          monthKey: monthKeyFor(new Date(now)),
          requestText: prompt,
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
        throw new AppError('bad_request', 'Месячный бюджет ИИ $15 исчерпан. Запрос сохранён без запуска.');
      if (reservation.id !== id) throw new AppError('operation_busy', 'Этот запрос уже обрабатывается.');

      let result: Awaited<ReturnType<TextGenerator['generate']>>;
      try {
        result = await generator.generate({ instructions, prompt });
      } catch (error) {
        const unknown = isAppError(error) && error.code === 'outcome_unknown';
        await completeGeneration(d1, {
          id,
          state: unknown ? 'unknown' : 'failed',
          chargedCostMicros: unknown ? reservedCostMicros : 0,
          inputTokens: null,
          outputTokens: null,
          responseText: null,
        });
        throw error;
      }

      const chargedCost = costMicros(result.inputTokens, result.outputTokens);
      try {
        await saveAssistantVersion(d1, material.row.id, result.text);
        await completeGeneration(d1, {
          id,
          state: 'succeeded',
          chargedCostMicros: chargedCost,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          responseText: result.text,
        });
        const usedCost = await monthGenerationCost(d1, monthKeyFor(new Date(now)));
        return {
          text: result.text,
          reused: false,
          ...(usedCost >= monthlyWarningMicros ? { budgetWarning: true } : {}),
        };
      } catch (error) {
        await completeGeneration(d1, {
          id,
          state: 'unknown',
          chargedCostMicros: reservedCostMicros,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          responseText: result.text,
        });
        throw error;
      }
    },
    isGenerationRequest,
  };
};

export type EditorService = ReturnType<typeof createEditorService>;
