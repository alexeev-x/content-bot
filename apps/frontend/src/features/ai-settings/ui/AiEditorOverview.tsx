import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../../../shared/api/http-client';
import { Button, ErrorState, Icon, IconBadge, Panel, ProgressBar, Skeleton, StatusPill } from '../../../shared/ui';
import {
  aiHypothesesQueryOptions,
  aiOverviewQueryOptions,
  aiRulesQueryOptions,
  aiUnlinkedScriptsQueryOptions
} from '../api/ai-queries';
import { aiStatus } from '../model/ai-view';
import { type DecisionTarget, pendingDecisions } from '../model/decisions';
import { AiQualityPanel } from './AiQualityPanel';
import { copy, usd } from './copy';
import styles from './AiEditor.module.css';

type Props = {
  /** A decision's button: a tab of the editor or the AI settings. */
  onNavigate: (target: DecisionTarget) => void;
};

const t = copy.editor;

/**
 * ИИ-редактор → Сводка: whether the AI works, what needs the owner's decision, the month's money and how the drafts
 * go — the answer in ten seconds; the lists themselves are on the other tabs.
 */
export function AiEditorOverview({ onNavigate }: Props) {
  const overview = useQuery(aiOverviewQueryOptions());
  const rules = useQuery(aiRulesQueryOptions());
  const hypotheses = useQuery(aiHypothesesQueryOptions());
  const unlinked = useQuery(aiUnlinkedScriptsQueryOptions());
  if (overview.isError && overview.data === undefined) {
    return (
      <ErrorState
        message={copy.loadError}
        {...(overview.error instanceof ApiError && overview.error.requestId
          ? { requestId: overview.error.requestId }
          : {})}
        onRetry={() => void overview.refetch()}
      />
    );
  }
  const data = overview.data;
  // The lists are optional here: a failed one only leaves its decision out, the tab with the list says why.
  const decisions = pendingDecisions({
    overview: data,
    rules: rules.data?.items,
    hypotheses: hypotheses.data?.items,
    unlinked: unlinked.data?.items.length
  });
  const status = data ? aiStatus(data) : null;
  const listsPending = rules.isPending || hypotheses.isPending || unlinked.isPending;
  const share =
    data && data.settings.monthlyBudgetUsd > 0
      ? Math.min(100, (data.spend.spentUsd / data.settings.monthlyBudgetUsd) * 100)
      : 0;

  return (
    <div className={styles.overview}>
      <section className={styles.state} aria-label="Состояние ИИ" data-tone={status?.group}>
        <IconBadge
          name="sparkle"
          tone={status === null ? 'muted' : status.group === 'done' ? 'accent' : status.group}
        />
        <div className={styles.stateText}>
          <p className={styles.stateTitle}>
            {data?.catalog.providerLabel ?? 'OpenAI'}
            {status ? (
              <StatusPill label={status.label} group={status.group} icon={status.icon} />
            ) : (
              <Skeleton width={96} height="1lh" radius="var(--radius-pill)" />
            )}
          </p>
          <p className={styles.meta}>{status ? status.next : <Skeleton width="60%" height="1lh" />}</p>
        </div>
        <Button variant="secondary" size="sm" icon="settings" onPress={() => onNavigate('settings')}>
          {t.settings}
        </Button>
      </section>

      <Panel title={t.decisions.title} headingLevel={2} quiet icon={<Icon name="check-circle" />}>
        <div className={styles.decisions}>
          {data === undefined || listsPending ? (
            <Skeleton lines={2} height={20} />
          ) : decisions.length === 0 ? (
            <p className={styles.calm}>
              <Icon name="check" size={16} />
              {t.decisions.none}
            </p>
          ) : (
            <ul className={styles.decisionList}>
              {decisions.map((decision) => (
                <li key={decision.id} className={styles.decision} data-tone={decision.tone}>
                  <span className={styles.decisionIcon} aria-hidden="true">
                    <Icon name={decision.tone === 'warning' ? 'alert' : 'info'} size={16} />
                  </span>
                  <span className={styles.decisionText}>
                    <strong>{decision.title}</strong>
                    <span>{decision.detail}</span>
                  </span>
                  <Button size="sm" variant="secondary" onPress={() => onNavigate(decision.target)}>
                    {decision.action}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      <div className={styles.pair}>
        <Panel title={t.money.title} headingLevel={2} quiet icon={<Icon name="wallet" />}>
          <div className={styles.money}>
            {data === undefined ? (
              <Skeleton lines={3} height={20} />
            ) : (
              <>
                <p className={styles.meta}>{copy.spentIn(data.spend.month)}</p>
                <p className={styles.moneyValue}>
                  <strong>{usd(data.spend.spentUsd)}</strong> {copy.of} {usd(data.settings.monthlyBudgetUsd)}
                </p>
                <ProgressBar label={copy.spendBar} value={share} tone={share >= 100 ? 'failed' : 'accent'} />
                <p className={styles.meta}>
                  {t.money.today(
                    usd(data.spend.todayUsd),
                    data.settings.dailyCapUsd >= data.settings.monthlyBudgetUsd ? null : usd(data.settings.dailyCapUsd)
                  )}{' '}
                  · {copy.left(usd(data.spend.leftUsd))}
                </p>
                <Button variant="ghost" size="sm" icon="arrow-right" onPress={() => onNavigate('spend')}>
                  {t.money.more}
                </Button>
              </>
            )}
          </div>
        </Panel>
        {data === undefined ? (
          <Panel title={copy.quality.title(30)} headingLevel={2} quiet icon={<Icon name="check-circle" />}>
            <div className={styles.money}>
              <Skeleton lines={4} height={20} />
            </div>
          </Panel>
        ) : (
          <AiQualityPanel quality={data.quality} />
        )}
      </div>
    </div>
  );
}
