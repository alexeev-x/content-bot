import type { AiOverviewDto } from '@alexeev/contracts';
import { Icon, Panel, ProgressBar, StatGrid, StatTile } from '../../../shared/ui';
import { copy, usd } from './copy';
import styles from './AiSettingsPage.module.css';

/** «Расходы и лимиты» of the month: spent against the budget, today, requests and the average (ИИ-редактор → Расходы). */
export function AiSpendPanel({ overview }: { overview: AiOverviewDto }) {
  const { settings, spend } = overview;
  const share = settings.monthlyBudgetUsd > 0 ? Math.min(100, (spend.spentUsd / settings.monthlyBudgetUsd) * 100) : 0;
  const dailyValue = settings.dailyCapUsd >= settings.monthlyBudgetUsd ? 'all' : String(settings.dailyCapUsd);
  return (
    <Panel
      title={copy.spendTitle}
      icon={<Icon name="chart" />}
      action={<span className={styles.meta}>{copy.monthLabel(spend.month)}</span>}
    >
      <div className={styles.body}>
        <div className={styles.spend}>
          <p className={styles.spendLabel}>{copy.spentIn(spend.month)}</p>
          <div className={styles.spendMain}>
            <p className={styles.spendValue}>
              <strong>{usd(spend.spentUsd)}</strong> {copy.of} {usd(settings.monthlyBudgetUsd)}
            </p>
            <p className={styles.meta}>
              {copy.left(usd(spend.leftUsd))} · {copy.used(share)}
            </p>
          </div>
          <ProgressBar label={copy.spendBar} value={share} tone={share >= 100 ? 'failed' : 'accent'} />
        </div>
        <StatGrid columns="two">
          <StatTile
            label={copy.tiles.left}
            value={usd(spend.leftUsd)}
            meta={copy.tiles.leftShare(share)}
            icon="wallet"
            tone="muted"
            iconAt="start"
          />
          <StatTile
            icon="calendar"
            tone="muted"
            iconAt="start"
            label={copy.tiles.today}
            value={usd(spend.todayUsd)}
            meta={dailyValue === 'all' ? null : copy.tiles.dailyOf(usd(settings.dailyCapUsd))}
          />
          <StatTile
            icon="file"
            tone="muted"
            iconAt="start"
            label={copy.tiles.requests}
            value={spend.requests}
            meta={
              spend.byKind.length > 0
                ? spend.byKind.map((row) => `${copy.kind[row.kind]}: ${row.requests}`).join(', ')
                : copy.noSpend
            }
          />
          <StatTile
            label={copy.tiles.average}
            value={spend.averageUsd === null ? '—' : usd(spend.averageUsd)}
            icon="tag"
            tone="muted"
            iconAt="start"
          />
        </StatGrid>
      </div>
    </Panel>
  );
}

/** The provider's prices per million tokens, as the cost of every request is computed (a reference, not a setting). */
export function AiPricesPanel({ overview }: { overview: AiOverviewDto }) {
  const { catalog } = overview;
  return (
    <Panel title={copy.pricesTitle(catalog.providerLabel, catalog.pricesCheckedOn)} icon={<Icon name="tag" />}>
      <div className={styles.pricesBody}>
        <table className={styles.prices}>
          <thead>
            <tr>
              <th scope="col">{copy.model}</th>
              <th scope="col">{copy.input}</th>
              <th scope="col">{copy.cached}</th>
              <th scope="col">{copy.output}</th>
            </tr>
          </thead>
          <tbody>
            {catalog.models.map((model) => (
              <tr key={model.id}>
                <th scope="row">{model.label}</th>
                <td>${model.inputPerMillion}</td>
                <td>${model.cachedInputPerMillion}</td>
                <td>${model.outputPerMillion}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={styles.meta}>{copy.pricesHint}</p>
      </div>
    </Panel>
  );
}
