import { useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { Button, Icon, type IconName, Panel, Skeleton } from '../../../shared/ui';
import type { Insight } from '../model/insights';
import { copy } from './copy';
import styles from './Insights.module.css';

type Props = {
  /** Actions first (actions.ts), then the rule-based conclusions (insights.ts). */
  insights: readonly Insight[] | undefined;
  days: number;
  onOpenItem: (id: string) => void;
  onAction: (kind: NonNullable<Insight['action']>['kind']) => void;
};

/** Shown before «Показать ещё» (owner, 20.10.2026: eight cards of restated numbers hid the two that mattered). */
const FIRST = 3;
// They restate the platform tiles right above: followers per platform, views against the previous period.
const RESTATED = /^(views-|followers-)/;
const TONE_ORDER: Record<Insight['tone'], number> = { bad: 0, good: 1, neutral: 2 };
/** actions.ts: the conclusions about what to do next go first even without a button. */
const ACTION_IDS = new Set(['funnel', 'video-gap', 'format-gap']);

const ICON: Record<Insight['tone'], IconName> = { good: 'arrow-up', bad: 'arrow-down', neutral: 'info' };
const TONE_LABEL = { good: 'Хорошо', bad: 'Внимание', neutral: 'Наблюдение' } as const;

/** «Что сделать»: the conclusions that change the next step, each with the figure it rests on and its action. */
export function InsightsPanel({ insights, days, onOpenItem, onAction }: Props) {
  const [all, setAll] = useState(false);
  // Actions keep their own order at the top; then what needs attention, good news and observations (a stable sort
  // keeps the model's order inside each group), so the cut hides the least.
  const relevant = (insights ?? [])
    .filter((insight) => !RESTATED.test(insight.id))
    .map((insight, index) => ({ insight, index }))
    .sort(
      (a, b) =>
        Number(b.insight.action !== undefined || ACTION_IDS.has(b.insight.id)) -
          Number(a.insight.action !== undefined || ACTION_IDS.has(a.insight.id)) ||
        TONE_ORDER[a.insight.tone] - TONE_ORDER[b.insight.tone] ||
        a.index - b.index
    )
    .map((entry) => entry.insight);
  const shown = all ? relevant : relevant.slice(0, FIRST);
  const hidden = relevant.length - shown.length;
  if (insights === undefined) return <InsightsSkeleton days={days} />;
  return (
    <Panel title={copy.insights.title(days)} headingLevel={2} quiet>
      <div className={styles.body}>
        {relevant.length === 0 ? (
          <p className={styles.muted}>{copy.insights.empty}</p>
        ) : (
          <ul className={styles.grid}>
            {shown.map((insight) => (
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
                  {insight.action ? (
                    <span className={styles.actionRow}>
                      <Button size="sm" icon="link" onPress={() => onAction(insight.action!.kind)}>
                        {insight.action.label}
                      </Button>
                    </span>
                  ) : null}
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
        {hidden > 0 ? (
          <Button variant="secondary" size="sm" icon="chevron-down" onPress={() => setAll(true)}>
            {`Показать ещё ${hidden}`}
          </Button>
        ) : null}
      </div>
    </Panel>
  );
}

/** The loaded geometry before the report: the first cards in their grid and the «show more» row. */
function InsightsSkeleton({ days }: { days: number }) {
  return (
    <Panel title={copy.insights.title(days)} headingLevel={2} quiet>
      <div className={styles.body} aria-hidden="true">
        <InsightCardsSkeleton />
        <Button variant="secondary" size="sm" icon="chevron-down" isDisabled>
          Показать ещё
        </Button>
      </div>
    </Panel>
  );
}

function InsightCardsSkeleton() {
  return (
    <div className={styles.grid} aria-hidden="true">
      {Array.from({ length: FIRST }, (_, key) => (
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
