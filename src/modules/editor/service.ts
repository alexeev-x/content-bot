import { AppError } from 'src/lib/errors';
import { findMaterialBySource, listMemory, listRubrics, saveMaterial, saveMemory, seedRubrics } from './queries';
import type { TextMessage } from './schema';
import type { Rubric, SavedMaterial } from './types';

type Deps = { d1: D1Database };

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

export const createEditorService = ({ d1 }: Deps) => {
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
  };
};

export type EditorService = ReturnType<typeof createEditorService>;
