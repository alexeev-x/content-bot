import { useNavigate, useSearch } from '@tanstack/react-router';
import { useDocumentTitle } from '../../app/use-document-title';
import {
  AiDraftHistory,
  AiEditorOverview,
  AiLearningBoard,
  aiCopy,
  type DecisionTarget
} from '../../features/ai-settings';
import { ru } from '../../shared/lib/ru';
import { PageHeader, Tab, TabList, TabPanel, Tabs } from '../../shared/ui';
import styles from './AiEditorPage.module.css';

type AiTab = 'overview' | 'drafts' | 'learning';
const t = aiCopy.editor;

/**
 * «ИИ-редактор» (owner, 20.10.2026): what the AI writes and what it learns, apart from Настройки → ИИ,
 * which keeps what is set and what it costs. One tab at a time, kept in the URL (`?tab=`, `?draft=`).
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
            </TabList>
          }
        />
        <TabPanel id="overview">
          <AiEditorOverview onNavigate={onNavigate} />
        </TabPanel>
        <TabPanel id="drafts">
          <AiDraftHistory
            view={{
              q: search.q,
              source: search.source,
              format: search.format,
              outcome: search.outcome,
              sort: search.sort,
              dir: search.dir,
              page: search.page,
              openId: search.draft
            }}
            onViewChange={(patch) =>
              void navigate({
                search: (previous) => {
                  const { openId, ...rest } = patch;
                  return { ...previous, ...rest, ...('openId' in patch ? { draft: openId } : {}) };
                },
                // Opening a draft is a step Back can undo; filters and pages replace the entry.
                replace: !('openId' in patch),
                resetScroll: false
              })
            }
          />
        </TabPanel>
        <TabPanel id="learning">
          <AiLearningBoard
            examples={{ q: search.lq, state: search.luse, source: search.lfrom, page: search.lpage }}
            onExamplesChange={(patch) =>
              void navigate({
                search: (previous) => ({
                  ...previous,
                  ...('q' in patch ? { lq: patch.q } : {}),
                  ...('state' in patch ? { luse: patch.state } : {}),
                  ...('source' in patch ? { lfrom: patch.source } : {}),
                  ...('page' in patch ? { lpage: patch.page } : {})
                }),
                replace: true,
                resetScroll: false
              })
            }
          />
        </TabPanel>
      </div>
    </Tabs>
  );
}
