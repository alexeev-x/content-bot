import { useNavigate, useSearch } from '@tanstack/react-router';
import { useDocumentTitle } from '../../app/use-document-title';
import {
  AiDraftHistory,
  AiEditorOverview,
  AiLearningBoard,
  AiSpendBoard,
  aiCopy,
  type DecisionTarget
} from '../../features/ai-settings';
import { ru } from '../../shared/lib/ru';
import { PageHeader, Tab, TabList, TabPanel, Tabs } from '../../shared/ui';
import styles from './AiEditorPage.module.css';

type AiTab = 'overview' | 'drafts' | 'learning' | 'spend';
const t = aiCopy.editor;

/**
 * «ИИ-редактор» (owner, 20.10.2026): what the AI writes, what it learns and what it costs, apart from Настройки → ИИ,
 * which keeps only what is set. One tab at a time, kept in the URL (`?tab=`, `?draft=`).
 */
export function AiEditorPage() {
  useDocumentTitle(ru.pages.ai);
  const search = useSearch({ from: '/ai' });
  const navigate = useNavigate({ from: '/ai' });
  const tab: AiTab = search.tab ?? 'overview';
  const show = (next: AiTab) =>
    void navigate({ search: { tab: next === 'overview' ? undefined : next }, resetScroll: false });
  const onNavigate = (target: DecisionTarget) =>
    target === 'settings' ? void navigate({ to: '/settings/ai' }) : show(target);

  return (
    <Tabs selectedKey={tab} onSelectionChange={(key) => show(key as AiTab)}>
      <div className={styles.page}>
        <PageHeader
          title={ru.pages.ai}
          description={t.description}
          wideActions
          actions={
            <TabList aria-label={t.tabsLabel}>
              <Tab id="overview">{t.tabs.overview}</Tab>
              <Tab id="drafts">{t.tabs.drafts}</Tab>
              <Tab id="learning">{t.tabs.learning}</Tab>
              <Tab id="spend">{t.tabs.spend}</Tab>
            </TabList>
          }
        />
        <TabPanel id="overview">
          <AiEditorOverview onNavigate={onNavigate} />
        </TabPanel>
        <TabPanel id="drafts">
          <AiDraftHistory
            openId={search.draft}
            onOpenChange={(id) =>
              void navigate({ search: (previous) => ({ ...previous, draft: id ?? undefined }), resetScroll: false })
            }
          />
        </TabPanel>
        <TabPanel id="learning">
          <AiLearningBoard />
        </TabPanel>
        <TabPanel id="spend">
          <AiSpendBoard />
        </TabPanel>
      </div>
    </Tabs>
  );
}
