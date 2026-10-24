import { sourceRichHtml } from '@alexeev/contracts';

/** Every task of a source's writer opens so (patch, news, hotfix, series, treasure follow-up). */
const SOURCE_TASK = 'Повод:';
const LINEAGE_MAX = 20;

/**
 * Whether a draft (or a rewrite of one) was written for a source: only those take the rich sample; the owner's own
 * posts keep their classic form.
 */
export async function isSourceDraft(
  find: (id: string) => Promise<{ task: string; parentGenerationId: string | null } | null>,
  generation: { task: string; parentGenerationId: string | null }
): Promise<boolean> {
  let current: { task: string; parentGenerationId: string | null } | null = generation;
  for (let step = 0; current !== null && step < LINEAGE_MAX; step += 1) {
    if (current.parentGenerationId === null) return current.task.startsWith(SOURCE_TASK);
    current = await find(current.parentGenerationId);
  }
  return false;
}

/**
 * The rich HTML of an approved AI text of a source (the approved samples, owner 23.10.2026), or null when it is not a
 * source's draft or its text has no rich structure (the post goes out as before).
 */
export function aiRichHtml(text: string, fromSource: boolean): string | null {
  return fromSource ? sourceRichHtml(text) : null;
}

/**
 * The structure every source post's task asks for (all but the patch, which has its own): what `structuredRichHtml`
 * (in @alexeev/contracts) turns into the approved sample.
 */
export const SOURCE_POST_STRUCTURE = [
  'Оформи пост строго так, блоки через пустую строку, без markdown:',
  // Owner, 23.10.2026: «Тёмный карнавал: побег за сетами» was flat — an event's post must announce it with emotion.
  '— первая строка: заголовок до 60 знаков, без точки в конце — цепляющий, с эмоцией, сразу говорит, что произошло (пришло событие, вышло обновление, кто-то победил), а не сухое название;',
  '— дальше короткими разделами: строка-подзаголовок с двоеточием в конце («Что изменилось в карнавале:»), под ней 2–4 пункта «• » или абзац; без длинных сплошных абзацев;',
  '— перечисление — строками, начинающимися с «• »;',
  '— если сравниваешь несколько героев, предметов или сетов — строками «Название — что важно» подряд (это станет таблицей), можно со строкой-шапкой «Колонка | Колонка» перед ними;',
  // Owner, 23.10.2026: five automatons each with the same 4.99 in a table.
  '— одинаковое у всех (цену, дату, условие) скажи один раз в тексте, не повторяй в каждой строке; таблица — только для того, чем они различаются;',
  '— второстепенное можно свернуть в конце: строка «▾ Заголовок», под ней то, что свернуть;',
  // The link becomes the «Подробнее» button: a label over it would stay as a bare heading (owner, 24.10.2026).
  '— ссылку поставь последней строкой отдельно, без подписи над ней;',
  // A Telegram post holds 4 096 characters (owner, 23.10.2026: a hotfix listed every fix and could not be published).
  '— весь пост не длиннее 3 000 знаков: если фактов больше, оставь самое важное для игрока, остальное — по ссылке.',
  'Героя называй, как его зовут игроки (Котл, БХ, Трент); нет такого имени — английское название. Не упоминай другие посты и не называй источники.'
].join('\n');
