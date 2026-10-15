import { Button as AriaButton } from 'react-aria-components';
import { Icon, Panel, Skeleton } from '../../../shared/ui';
import type { Insight } from '../model/insights';
import { copy } from './copy';
import styles from './Report.module.css';

type Props = {
  insights: readonly Insight[] | undefined;
  days: number;
  onOpenItem: (id: string) => void;
};

const ICON = { good: 'arrow-up', bad: 'arrow-down', neutral: 'info' } as const;
const TONE_LABEL = { good: 'Хорошо', bad: 'Внимание', neutral: 'Наблюдение' } as const;

/** «Главное»: the conclusions first, each with the numbers that back it. */
export function InsightsPanel({ insights, days, onOpenItem }: Props) {
  return (
    <Panel title={copy.insights.title(days)} headingLevel={2} quiet>
      {insights === undefined ? (
        <div className={styles.insights} aria-hidden="true">
          {[0, 1, 2].map((key) => (
            <div key={key} className={styles.insight}>
              <Skeleton width="60%" height={16} />
              <Skeleton width="90%" height={12} />
            </div>
          ))}
        </div>
      ) : insights.length === 0 ? (
        <p className={styles.empty}>{copy.insights.empty}</p>
      ) : (
        <ul className={styles.insights}>
          {insights.map((insight) => (
            <li key={insight.id} className={styles.insight} data-tone={insight.tone}>
              <span className={styles.insightIcon}>
                <Icon name={ICON[insight.tone]} size={16} />
                <span className={styles.srOnly}>{TONE_LABEL[insight.tone]}: </span>
              </span>
              <div className={styles.insightText}>
                {insight.itemId ? (
                  <AriaButton className={styles.insightTitleButton} onPress={() => onOpenItem(insight.itemId!)}>
                    {insight.title}
                  </AriaButton>
                ) : (
                  <p className={styles.insightTitle}>{insight.title}</p>
                )}
                <p className={styles.insightDetail}>{insight.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
