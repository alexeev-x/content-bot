import { useState } from 'react';
import { Disclosure, DisclosureGroup, Icon, Panel } from '../../../shared/ui';
import { AiFeedbackList } from './AiFeedbackList';
import { AiHypothesesList } from './AiHypothesesList';
import { AiLearningList } from './AiLearningList';
import { AiRulesList } from './AiRulesList';
import { AiUnlinkedScripts } from './AiUnlinkedScripts';
import { copy } from './copy';
import styles from './AiEditor.module.css';

const t = copy.editor.learning;

/**
 * ИИ-редактор → Обучение: what the owner teaches the writer and what it noticed by itself, in the order the owner acts
 * on them — rules and hypotheses waiting for a decision first, the long list of example texts folded last.
 */
export function AiLearningBoard() {
  // The examples are the longest list and rarely needed: they load only when opened.
  const [examplesOpen, setExamplesOpen] = useState(false);
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
      <Panel title={t.examples} headingLevel={2} quiet icon={<Icon name="file" />}>
        <DisclosureGroup
          expandedKeys={examplesOpen ? ['examples'] : []}
          onExpandedChange={(keys) => setExamplesOpen(keys.has('examples'))}
        >
          <Disclosure id="examples" title={t.examplesShow}>
            {examplesOpen ? <AiLearningList /> : null}
          </Disclosure>
        </DisclosureGroup>
      </Panel>
    </div>
  );
}
