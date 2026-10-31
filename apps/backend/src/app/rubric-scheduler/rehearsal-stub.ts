import { RUBRIC_META, RUBRIC_TITLES, type RubricKey } from '../../modules/rubrics';
import type { BuiltRubricPost } from '../rubric-build/types';

/** The week-long test's stand-in for a rubric that needs the AI, STRATZ or the match base: no paid call, ever. */
export function stubPost(rubric: RubricKey, slot: { id: string; slotAt: number }): BuiltRubricPost {
  const title = RUBRIC_TITLES[rubric];
  const poll = RUBRIC_META[rubric].poll;
  const text = `🧪 Репетиция: «${title}»\n\nЗдесь был бы текст рубрики. На DEV ИИ, STRATZ и база матчей не вызываются — проверяется расписание и выход поста.\n\nСлот ${slot.id.slice(0, 8)}`;
  return {
    rubric,
    title,
    text,
    entities: [],
    rich: null,
    richSource: null,
    albumRich: null,
    picture: null,
    album: [],
    poll:
      poll === undefined
        ? null
        : {
            question: `🧪 Репетиция: «${title}» — опрос`,
            options: ['Вариант 1', 'Вариант 2', 'Вариант 3'],
            type: poll.kind,
            correctOption: poll.kind === 'quiz' ? 0 : null,
            explanation: null
          },
    pollOnly: false,
    followUp: null,
    notes: [],
    degradations: [],
    facts: {}
  };
}
