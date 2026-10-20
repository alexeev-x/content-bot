import {
  AI_LESSONS_LIMIT,
  type AiLessonAnswerDto,
  type AiLessonsDto,
  type AnswerAiLessonInput
} from '@alexeev/contracts';
import type { Clock } from '../../platform/clock';
import { AppError } from '../../shared/app-error';
import type { StyleLessonsRepository } from './d1-style-lessons-repository';

// The lessons in the studio (owner, 20.10.2026: «Обучение» must show how the writer learns): the same rows the
// bot asks about, answered through the same conditional updates, so a tap in the bot and a click here never both win.

export async function readLessons(lessons: StyleLessonsRepository): Promise<AiLessonsDto> {
  const rows = await lessons.open(AI_LESSONS_LIMIT);
  return {
    items: rows
      .filter(
        (row): row is typeof row & { status: 'seen' | 'asked' } => row.status === 'seen' || row.status === 'asked'
      )
      .map((row) => ({
        id: row.id,
        text: row.text,
        scope: row.scope,
        status: row.status,
        origin: row.origin,
        fromRemark: row.fromRemark,
        drafts: row.drafts,
        createdAt: new Date(row.createdAt).toISOString()
      }))
  };
}

export async function answerLesson(
  deps: { lessons: StyleLessonsRepository; clock: Clock; newId: () => string },
  input: { id: string } & AnswerAiLessonInput
): Promise<AiLessonAnswerDto> {
  const lesson = await deps.lessons.find(input.id);
  if (lesson === null || lesson.status === 'seen') throw new AppError('NOT_FOUND', 'Lesson not asked');
  const wanted = input.answer === 'accept' ? 'accepted' : 'rejected';
  // Answered the same way before (here or in the bot): the same result.
  if (lesson.status === wanted) return { id: lesson.id, status: wanted };
  if (lesson.status !== 'asked') throw new AppError('CONFLICT', `Lesson is ${lesson.status}`, { reason: 'STATE' });
  const now = deps.clock.now();
  if (input.answer === 'reject') {
    if (await deps.lessons.reject({ id: lesson.id, now })) return { id: lesson.id, status: 'rejected' };
  } else {
    const result = await deps.lessons.accept({ id: lesson.id, ruleId: deps.newId(), now });
    if (result === 'accepted') return { id: lesson.id, status: 'accepted' };
    if (result === 'full') throw new AppError('CONFLICT', 'Too many rules in use', { reason: 'LIMIT' });
  }
  // Another answer won between the read and the update.
  const after = await deps.lessons.find(lesson.id);
  if (after?.status === wanted) return { id: lesson.id, status: wanted };
  throw new AppError('CONFLICT', `Lesson is ${after?.status ?? 'gone'}`, { reason: 'STATE' });
}
