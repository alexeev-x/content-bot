import type { AiLessonDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../../../shared/api/http-client';
import { Button, ErrorState, Panel } from '../../../shared/ui';
import { aiLessonsQueryOptions, useAnswerAiLesson } from '../api/ai-queries';
import { copy } from './copy';
import styles from './AiRulesList.module.css';

const t = copy.editor.learning;

function errorText(error: unknown): string {
  if (error instanceof ApiError && error.reason === 'LIMIT') return t.lessonLimit;
  if (error instanceof ApiError && (error.reason === 'STATE' || error.code === 'NOT_FOUND')) return t.lessonStale;
  return copy.rules.saveFailed;
}

const meta = (lesson: AiLessonDto) => `${copy.quality.format[lesson.scope]} · ${t.lessonFrom(lesson)}`;

/** An asked lesson: the same «Учитывать?» as in the bot, answered here. */
function AskedRow({ lesson }: { lesson: AiLessonDto }) {
  const mutation = useAnswerAiLesson();
  return (
    <li className={styles.row}>
      <div className={styles.text}>
        <p className={styles.ruleText}>{lesson.text}</p>
        <p className={styles.meta}>{meta(lesson)}</p>
        {mutation.isError ? (
          <p className={styles.error} role="alert">
            {errorText(mutation.error)}
          </p>
        ) : null}
      </div>
      <div className={styles.actions}>
        <Button
          size="sm"
          isLoading={mutation.isPending && mutation.variables.answer === 'accept'}
          isDisabled={mutation.isPending}
          onPress={() => mutation.mutate({ id: lesson.id, answer: 'accept' })}
        >
          {t.accept}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          isLoading={mutation.isPending && mutation.variables.answer === 'reject'}
          isDisabled={mutation.isPending}
          onPress={() => mutation.mutate({ id: lesson.id, answer: 'reject' })}
        >
          {t.reject}
        </Button>
      </div>
    </li>
  );
}

/**
 * The lessons the writer read off the owner's edits and remarks (AI plan P7c), until now visible only as the bot's
 * questions (owner, 20.10.2026: «не понятно, для чего раздел»). Asked ones get the answer buttons; the ones noted
 * once are listed quietly. Nothing is drawn while there are none.
 */
export function AiLessonsList() {
  const query = useQuery(aiLessonsQueryOptions());
  if (query.isError)
    return (
      <Panel title={t.lessons} headingLevel={2} quiet>
        <ErrorState message={t.lessonsLoadError} onRetry={() => void query.refetch()} />
      </Panel>
    );
  const items = query.data?.items ?? [];
  const asked = items.filter((lesson) => lesson.status === 'asked');
  const seen = items.filter((lesson) => lesson.status === 'seen');
  return (
    <>
      {asked.length > 0 ? (
        <Panel title={t.lessons} headingLevel={2} quiet note={String(asked.length)}>
          <div className={styles.body}>
            <p className={styles.hint}>{t.lessonsHint}</p>
            <ul className={styles.list}>
              {asked.map((lesson) => (
                <AskedRow key={lesson.id} lesson={lesson} />
              ))}
            </ul>
          </div>
        </Panel>
      ) : null}
      {seen.length > 0 ? (
        <Panel title={t.seen} headingLevel={2} quiet note={String(seen.length)}>
          <div className={styles.body}>
            <p className={styles.hint}>{t.seenHint}</p>
            <ul className={styles.list}>
              {seen.map((lesson) => (
                <li key={lesson.id} className={styles.row}>
                  <div className={styles.text}>
                    <p className={styles.ruleText}>{lesson.text}</p>
                    <p className={styles.meta}>{meta(lesson)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      ) : null}
    </>
  );
}
