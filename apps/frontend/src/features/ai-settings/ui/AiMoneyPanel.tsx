import type { AiOverviewDto } from '@alexeev/contracts';
import { useNavigate } from '@tanstack/react-router';
import { Button, Icon, Panel, ProgressBar, Skeleton } from '../../../shared/ui';
import { copy, usd } from './copy';
import styles from './AiEditor.module.css';

const t = copy.editor.money;

/**
 * «Деньги» on Настройки → ИИ (owner, 20.10.2026: beside the budget it is set against, not in ИИ-редактор): this
 * month against the budget, today against the daily cap, what is left, and the way to the full spend.
 */
export function AiMoneyPanel({ overview }: { overview: AiOverviewDto | undefined }) {
  const navigate = useNavigate();
  const share =
    overview && overview.settings.monthlyBudgetUsd > 0
      ? Math.min(100, (overview.spend.spentUsd / overview.settings.monthlyBudgetUsd) * 100)
      : 0;
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
            <Button
              variant="ghost"
              size="sm"
              icon="arrow-right"
              onPress={() => void navigate({ to: '/ai', search: { tab: 'spend' } })}
            >
              {t.more}
            </Button>
          </>
        )}
      </div>
    </Panel>
  );
}
