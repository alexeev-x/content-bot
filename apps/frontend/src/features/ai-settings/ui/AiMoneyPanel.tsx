import type { AiOverviewDto } from '@alexeev/contracts';
import { Icon, Panel, ProgressBar, Skeleton } from '../../../shared/ui';
import { copy, usd } from './copy';
import styles from './AiEditor.module.css';

const t = copy.editor.money;

/**
 * «Деньги» on Настройки → ИИ (owner, 20.10.2026: beside the budget it is set against): this month against the
 * budget, today against the daily cap, what is left, and where the money went — the bot, the studio's control runs
 * or the rest (on DEV the runs, not the bot, took most of it).
 */
export function AiMoneyPanel({ overview }: { overview: AiOverviewDto | undefined }) {
  const share =
    overview && overview.settings.monthlyBudgetUsd > 0
      ? Math.min(100, (overview.spend.spentUsd / overview.settings.monthlyBudgetUsd) * 100)
      : 0;
  const sources = overview?.spend.bySource.filter((row) => row.requests > 0) ?? [];
  return (
    <Panel title={t.title} headingLevel={2} quiet icon={<Icon name="wallet" />}>
      <div className={styles.money} aria-busy={overview === undefined || undefined}>
        {overview === undefined ? (
          <Skeleton lines={3} height={20} />
        ) : (
          <>
            <p className={styles.meta}>{copy.spentIn(overview.spend.month)}</p>
            <p className={styles.moneyValue}>
              <strong>{usd(overview.spend.spentUsd)}</strong> {copy.of} {usd(overview.settings.monthlyBudgetUsd)}
            </p>
            <ProgressBar label={copy.spendBar} value={share} tone={share >= 100 ? 'failed' : 'accent'} />
            <p className={styles.meta}>
              {t.today(
                usd(overview.spend.todayUsd),
                overview.settings.dailyCapUsd >= overview.settings.monthlyBudgetUsd
                  ? null
                  : usd(overview.settings.dailyCapUsd)
              )}{' '}
              · {copy.left(usd(overview.spend.leftUsd))}
            </p>
            {sources.length > 0 ? (
              <dl className={styles.moneySources} aria-label={t.sourcesLabel}>
                {sources.map((row) => (
                  <div key={row.source} className={styles.moneySource}>
                    <dt>{t.source[row.source]}</dt>
                    <dd>
                      <strong>{usd(row.spentUsd)}</strong> · {t.requests(row.requests)}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </>
        )}
      </div>
    </Panel>
  );
}
