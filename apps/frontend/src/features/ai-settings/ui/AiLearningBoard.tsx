import { Icon, Panel } from '../../../shared/ui';
import { AiFeedbackList } from './AiFeedbackList';
import { AiHypothesesList } from './AiHypothesesList';
import { AiLearningList, type AiLearningView } from './AiLearningList';
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

/**
 * ИИ-редактор → Обучение: what the owner teaches the writer and what it noticed by itself, in the order the owner acts
 * on them — rules and hypotheses waiting for a decision first, the examples table last.
 */
export function AiLearningBoard({ examples, onExamplesChange }: Props) {
  return (
    <div className={styles.sections}>
      <p className={styles.intro}>{t.intro}</p>
      <Panel title={t.rules} headingLevel={2} quiet icon={<Icon name="list" />}>
        <AiRulesList />
      </Panel>
      <Panel title={t.hypotheses} headingLevel={2} quiet icon={<Icon name="flask" />}>
        <AiHypothesesList />
      </Panel>
      <Panel title={t.unlinked} headingLevel={2} quiet icon={<Icon name="link" />}>
        <AiUnlinkedScripts />
      </Panel>
      <Panel title={t.feedback} headingLevel={2} quiet icon={<Icon name="message" />}>
        <AiFeedbackList />
      </Panel>
      <AiLearningList view={examples} onViewChange={onExamplesChange} />
    </div>
  );
}
