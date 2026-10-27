import { Button as AriaButton } from 'react-aria-components';
import { Icon, type IconName, Panel, Skeleton } from '../../../shared/ui';
import { CARDS_MAX } from '../model/actions';
import type { Insight } from '../model/insights';
import { copy } from './copy';
import styles from './Insights.module.css';

type Props = {
  /** composeCards: the actions, then the rule-based cards, at most four. */
  insights: readonly Insight[] | undefined;
  days: number;
  onOpenItem: (id: string) => void;
};

const ICON: Record<Insight['tone'], IconName> = { good: 'arrow-up', bad: 'arrow-down', neutral: 'info' };
const TONE_LABEL = { good: 'Хорошо', bad: 'Внимание', neutral: 'Наблюдение' } as const;

/**
 * «Что сделать»: at most four conclusions that change the next step (composeCards), each with the figure it rests on. An odd last card spans the row, so the grid stays even (owner, 20.10.2026: «сделай их четными»).
 */
export function InsightsPanel({ insights, days, onOpenItem }: Props) {
  if (insights === undefined) return <InsightsSkeleton days={days} />;
  return (
    <Panel title={copy.insights.title(days)} headingLevel={2} quiet>
      <div className={styles.body}>
        {insights.length === 0 ? (
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

/** The loaded geometry before the report: four cards in their grid. */
function InsightsSkeleton({ days }: { days: number }) {
  return (
    <Panel title={copy.insights.title(days)} headingLevel={2} quiet>
      <div className={styles.body} aria-hidden="true">
        <InsightCardsSkeleton />
      </div>
    </Panel>
  );
}

function InsightCardsSkeleton() {
  return (
    <div className={styles.grid} aria-hidden="true">
      {Array.from({ length: CARDS_MAX }, (_, key) => (
        <div key={key} className={styles.card}>
          <span className={styles.icon} />
          <span className={styles.text}>
            <Skeleton width="80%" height="1lh" />
            <Skeleton lines={2} height="1lh" />
          </span>
          <span className={styles.badge}>
            <Skeleton width={48} height="1lh" />
          </span>
        </div>
      ))}
    </div>
  );
}
