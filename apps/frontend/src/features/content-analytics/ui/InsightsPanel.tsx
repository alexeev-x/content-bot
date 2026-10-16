import { Button as AriaButton } from 'react-aria-components';
import { AreaChart, Icon, type IconName, Panel, Skeleton } from '../../../shared/ui';
import type { Insight } from '../model/insights';
import { copy } from './copy';
import styles from './Insights.module.css';
import { PanelSkeleton } from './PanelSkeleton';

export type InsightsSummary = {
  views: { value: string; change: number | null; series: readonly number[]; tips: readonly string[] };
  hits: { hits: number; total: number; diff: number | null };
  cadence: { perWeek: string; change: number | null };
};

type Props = {
  insights: readonly Insight[] | undefined;
  summary: InsightsSummary | undefined;
  days: number;
  onOpenItem: (id: string) => void;
};

const ICON: Record<Insight['tone'], IconName> = { good: 'arrow-up', bad: 'arrow-down', neutral: 'info' };
const TONE_LABEL = { good: 'Хорошо', bad: 'Внимание', neutral: 'Наблюдение' } as const;

function Change({ value, unit = '%', suffix }: { value: number | null; unit?: string; suffix: string }) {
  if (value === null) return <span className={styles.statSub}>{suffix}</span>;
  return (
    <span className={styles.statSub}>
      <span data-tone={value > 0 ? 'up' : value < 0 ? 'down' : 'flat'} className={styles.delta}>
        {value > 0 ? '↑ +' : value < 0 ? '↓ −' : ''}
        {Math.abs(value)}
        {unit}
      </span>{' '}
      {suffix}
    </span>
  );
}

/** «Главное»: three headline numbers, then each conclusion with the figure it rests on. */
export function InsightsPanel({ insights, summary, days, onOpenItem }: Props) {
  if (insights === undefined && summary === undefined)
    return <PanelSkeleton title={copy.insights.title(days)} rows={17.1} phoneRows={42.5} />;
  return (
    <Panel title={copy.insights.title(days)} headingLevel={2} quiet>
      <div className={styles.body}>
        {summary ? (
          <ul className={styles.stats}>
            <li className={styles.stat}>
              <span className={styles.statIcon}>
                <Icon name="eye" size={18} />
              </span>
              <span className={styles.statText}>
                <span className={styles.statLabel}>Просмотры</span>
                <strong>{summary.views.value}</strong>
                <Change value={summary.views.change} suffix={`против прошлых ${days} дней`} />
              </span>
              <span className={styles.statChart}>
                <AreaChart points={summary.views.series} tips={summary.views.tips} variant="bars" height={36} />
              </span>
            </li>
            <li className={styles.stat}>
              <span className={styles.statIcon}>
                <Icon name="file" size={18} />
              </span>
              <span className={styles.statText}>
                <span className={styles.statLabel}>Удачные публикации</span>
                <strong>
                  {summary.hits.hits} из {summary.hits.total}
                </strong>
                <Change value={summary.hits.diff} unit="" suffix="к прошлому периоду" />
              </span>
            </li>
            <li className={styles.stat}>
              <span className={styles.statIcon}>
                <Icon name="calendar" size={18} />
              </span>
              <span className={styles.statText}>
                <span className={styles.statLabel}>Частота публикаций</span>
                <strong>{summary.cadence.perWeek} в неделю</strong>
                <Change value={summary.cadence.change} suffix={`против прошлых ${days} дней`} />
              </span>
            </li>
          </ul>
        ) : null}
        {insights === undefined ? (
          <div className={styles.grid} aria-hidden="true">
            {[0, 1, 2, 3].map((key) => (
              <div key={key} className={styles.card}>
                <Skeleton width="70%" height={16} />
              </div>
            ))}
          </div>
        ) : insights.length === 0 ? (
          <p className={styles.muted}>{copy.insights.empty}</p>
        ) : (
          <ul className={styles.grid}>
            {insights.map((insight) => (
              <li key={insight.id} className={styles.card} data-tone={insight.tone}>
                <span className={styles.icon}>
                  <Icon name={ICON[insight.tone]} size={16} />
                  <span className={styles.srOnly}>{TONE_LABEL[insight.tone]}: </span>
                </span>
                <span className={styles.text}>
                  {insight.itemId ? (
                    <AriaButton className={styles.titleButton} onPress={() => onOpenItem(insight.itemId!)}>
                      {insight.title}
                    </AriaButton>
                  ) : (
                    <span className={styles.title}>{insight.title}</span>
                  )}
                  <span className={styles.detail}>{insight.detail}</span>
                </span>
                {insight.badge ? (
                  <span className={styles.badge} data-tone={insight.tone}>
                    {insight.thumb ? (
                      <img
                        src={insight.thumb}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className={styles.thumb}
                      />
                    ) : null}
                    <span className={styles.badgeText}>
                      <strong>{insight.badge.value}</strong>
                      {insight.badge.sub ? <span>{insight.badge.sub}</span> : null}
                    </span>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
