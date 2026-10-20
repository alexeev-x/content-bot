import { useQuery } from '@tanstack/react-query';
import { Disclosure, DisclosureGroup, Icon, Panel } from '../../../shared/ui';
import { aiFeedbackQueryOptions, aiHypothesesQueryOptions, aiUnlinkedScriptsQueryOptions } from '../api/ai-queries';
import { AiFeedbackList } from './AiFeedbackList';
import { AiHypothesesList } from './AiHypothesesList';
import { AiLearningList, type AiLearningView } from './AiLearningList';
import { AiLessonsList } from './AiLessonsList';
import { AiRulesList } from './AiRulesList';
import { AiUnlinkedScripts } from './AiUnlinkedScripts';
import { copy } from './copy';
import styles from './AiEditor.module.css';

const t = copy.editor.learning;

type Props = {
  /** The examples table's search, filters and page, kept in the URL by the page. */
  examples?: AiLearningView | undefined;
  onExamplesChange?: ((patch: Partial<AiLearningView>) => void) | undefined;
};

/** A list with nothing in it is not drawn; one that failed to load is, so its error shows. */
const shown = (query: { isError: boolean; data?: { items: readonly unknown[] } | undefined }) =>
  query.isError || (query.data?.items.length ?? 0) > 0;

/**
 * ИИ-редактор → Обучение (owner, 20.10.2026: «не понятно, для чего раздел, что он делает»): first how the writer
 * learns, in the owner's steps; then what waits for the owner's answer, the rules it has learned, and the example
 * texts. Lists with nothing in them are not drawn: the steps above say how they fill.
 */
export function AiLearningBoard({ examples, onExamplesChange }: Props) {
  const hypotheses = useQuery(aiHypothesesQueryOptions());
  const unlinked = useQuery(aiUnlinkedScriptsQueryOptions());
  const feedback = useQuery(aiFeedbackQueryOptions());
  const feedbackCount = feedback.data?.items.length ?? 0;
  return (
    <div className={styles.sections}>
      <section className={styles.how} aria-labelledby="ai-how">
        <h2 id="ai-how" className={styles.howTitle}>
          {t.howTitle}
        </h2>
        <ol className={styles.howSteps}>
          {t.how.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className={styles.meta}>{t.howRule}</p>
        <p className={styles.meta}>{t.howExamples}</p>
      </section>
      <AiLessonsList />
      <Panel title={t.rules} headingLevel={2} quiet icon={<Icon name="list" />}>
        <AiRulesList />
      </Panel>
      {shown(unlinked) ? (
        <Panel title={t.unlinked} headingLevel={2} quiet icon={<Icon name="link" />}>
          <AiUnlinkedScripts />
        </Panel>
      ) : null}
      {shown(hypotheses) ? (
        <Panel title={t.hypotheses} headingLevel={2} quiet icon={<Icon name="flask" />}>
          <AiHypothesesList />
        </Panel>
      ) : null}
      <AiLearningList view={examples} onViewChange={onExamplesChange} />
      {shown(feedback) ? (
        <DisclosureGroup>
          <Disclosure id="feedback" title={t.feedback(feedbackCount)}>
            <AiFeedbackList />
          </Disclosure>
        </DisclosureGroup>
      ) : null}
    </div>
  );
}
