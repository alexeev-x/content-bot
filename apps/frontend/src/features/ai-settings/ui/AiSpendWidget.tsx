import { useQuery } from '@tanstack/react-query';
import { Button as AriaButton } from 'react-aria-components';
import { Icon, ProgressBar, Skeleton, StatusPill } from '../../../shared/ui';
import { aiOverviewQueryOptions } from '../api/ai-queries';
import { aiStatus } from '../model/ai-view';
import { copy, usd } from './copy';
import styles from './AiSpendWidget.module.css';

/** The state pill in the header of «ИИ расходы» on Обзор; nothing until the overview is read. */
export function AiStatusBadge() {
  const overview = useQuery(aiOverviewQueryOptions()).data;
  if (overview === undefined) return null;
  const status = aiStatus(overview);
  return <StatusPill label={status.label} group={status.group} icon={status.icon} />;
}

/** Body of «ИИ расходы» on Обзор: this month against the budget, today, and the way to the settings. */
export function AiSpendSummary({ onOpenSettings }: { onOpenSettings: () => void }) {
  const query = useQuery(aiOverviewQueryOptions());
  const overview = query.data;
  const footer = (
    <AriaButton className={styles.settings} onPress={onOpenSettings}>
      <Icon name="settings" size={16} />
      <span>{copy.widget.settings}</span>
      <Icon name="chevron-right" size={16} />
    </AriaButton>
  );
  if (overview === undefined)
    return (
      <div className={styles.body}>
        {query.isError ? (
          <p className={styles.meta}>{copy.widget.loadError}</p>
        ) : (
          <div aria-hidden="true" className={styles.skeleton}>
            <Skeleton lines={5} height={20} />
          </div>
        )}
        {footer}
      </div>
    );
  const { spend, settings } = overview;
  const share = settings.monthlyBudgetUsd > 0 ? Math.min(100, (spend.spentUsd / settings.monthlyBudgetUsd) * 100) : 0;
  const percent = share > 0 && share < 1 ? '< 1%' : `${Math.round(share)}%`;
  return (
    <div className={styles.body}>
      <p className={styles.meta}>{copy.widget.month}</p>
      <div className={styles.total}>
        <p>
          <strong>{usd(spend.spentUsd)}</strong> {copy.of} {usd(settings.monthlyBudgetUsd)}
        </p>
        <span className={styles.meta}>{percent}</span>
      </div>
      <ProgressBar label={copy.spendBar} value={share} tone={share >= 100 ? 'failed' : 'accent'} />
      <dl className={styles.facts}>
        <div>
          <dt>{copy.widget.today}</dt>
          <dd>{usd(spend.todayUsd)}</dd>
        </div>
        <div>
          <dt>{copy.widget.budget}</dt>
          <dd>{usd(settings.monthlyBudgetUsd)}</dd>
        </div>
        <div>
          <dt>{copy.widget.requests}</dt>
          <dd>{spend.requests}</dd>
        </div>
        <div>
          <dt>{copy.widget.left}</dt>
          <dd className={styles.accent}>{usd(spend.leftUsd)}</dd>
        </div>
        <div>
          <dt>{copy.average}</dt>
          <dd>{spend.averageUsd === null ? '—' : usd(spend.averageUsd)}</dd>
        </div>
        <div>
          <dt>{copy.widget.used}</dt>
          <dd>{percent}</dd>
        </div>
      </dl>
      {footer}
    </div>
  );
}
