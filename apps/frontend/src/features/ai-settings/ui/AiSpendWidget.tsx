import type { AiOverviewDto } from '@alexeev/contracts';
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
  if (query.data === undefined && query.isError)
    return (
      <div className={styles.body}>
        <p className={styles.meta}>{copy.widget.loadError}</p>
        <SettingsLink onPress={onOpenSettings} />
      </div>
    );
  return <SpendBody overview={query.data} onOpenSettings={onOpenSettings} />;
}

/** The same body without data and without a request: the route skeleton, at the loaded height. */
export function AiSpendSkeleton() {
  return <SpendBody overview={undefined} onOpenSettings={() => undefined} />;
}

function SettingsLink({ onPress }: { onPress: () => void }) {
  return (
    <AriaButton className={styles.settings} onPress={onPress}>
      <Icon name="settings" size={16} />
      <span>{copy.widget.settings}</span>
      <Icon name="chevron-right" size={16} />
    </AriaButton>
  );
}

// One layout for loading and loaded: each value is a one-line skeleton until the overview arrives, so the
// widget (and «Лента дня» beside it, which takes the row's height) never changes height.
function SpendBody({ overview, onOpenSettings }: { overview: AiOverviewDto | undefined; onOpenSettings: () => void }) {
  const value = (text: (data: AiOverviewDto) => string, width = 64) =>
    overview === undefined ? <Skeleton width={width} height="1lh" /> : text(overview);
  const share =
    overview === undefined || overview.settings.monthlyBudgetUsd <= 0
      ? 0
      : Math.min(100, (overview.spend.spentUsd / overview.settings.monthlyBudgetUsd) * 100);
  const percent = share > 0 && share < 1 ? '< 1%' : `${Math.round(share)}%`;
  return (
    <div className={styles.body} aria-busy={overview === undefined || undefined}>
      <p className={styles.meta}>{copy.widget.month}</p>
      <div className={styles.total}>
        <p>
          {overview === undefined ? (
            // Inside <strong>, so the line is the big figure's height.
            <strong>
              <Skeleton width={150} height="1lh" />
            </strong>
          ) : (
            <>
              <strong>{usd(overview.spend.spentUsd)}</strong> {copy.of} {usd(overview.settings.monthlyBudgetUsd)}
            </>
          )}
        </p>
        <span className={styles.meta}>{value(() => percent, 32)}</span>
      </div>
      <ProgressBar label={copy.spendBar} value={share} tone={share >= 100 ? 'failed' : 'accent'} />
      <dl className={styles.facts}>
        <div>
          <dt>{copy.widget.today}</dt>
          <dd>{value((data) => usd(data.spend.todayUsd))}</dd>
        </div>
        <div>
          <dt>{copy.widget.budget}</dt>
          <dd>{value((data) => usd(data.settings.monthlyBudgetUsd))}</dd>
        </div>
        <div>
          <dt>{copy.widget.requests}</dt>
          <dd>{value((data) => String(data.spend.requests), 24)}</dd>
        </div>
        <div>
          <dt>{copy.widget.left}</dt>
          <dd className={styles.accent}>{value((data) => usd(data.spend.leftUsd))}</dd>
        </div>
        <div>
          <dt>{copy.average}</dt>
          <dd>{value((data) => (data.spend.averageUsd === null ? '—' : usd(data.spend.averageUsd)))}</dd>
        </div>
        <div>
          <dt>{copy.widget.used}</dt>
          <dd>{value(() => percent, 40)}</dd>
        </div>
      </dl>
      <SettingsLink onPress={onOpenSettings} />
    </div>
  );
}
