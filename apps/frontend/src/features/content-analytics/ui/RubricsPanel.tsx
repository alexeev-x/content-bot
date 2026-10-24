import { Button as AriaButton } from 'react-aria-components';
import { pluralRu } from '../../../shared/lib/ru-format';
import { Button, Icon, Panel } from '../../../shared/ui';
import { formatCount, itemTitle } from '../model/format';
import type { RubricsSummary } from '../model/rubrics';
import { PanelSkeleton } from './PanelSkeleton';
import styles from './Rubrics.module.css';

type Props = {
  summary: RubricsSummary | undefined;
  onOpen: (id: string) => void;
  onOpenSettings: () => void;
};

const TITLE = 'Рубрики Telegram';
const NOTE = 'Во сколько раз выше обычного поста';

/**
 * «Рубрики Telegram» (plan B3; owner, 20.10.2026): each rubric's posts in the period against the channel's usual post,
 * their median views, the hours they do best and the best post. A post's rubric: the pick in the editor, else its
 * hashtag or name in the text.
 */
export function RubricsPanel({ summary, onOpen, onOpenSettings }: Props) {
  if (summary === undefined)
    return <PanelSkeleton title={TITLE} note={NOTE} icon={<Icon name="tag" />} rows={3} phoneRows={4.5} />;
  if (summary.stats.length === 0) {
    return (
      <Panel title={TITLE} headingLevel={2} quiet icon={<Icon name="tag" />} note={NOTE}>
        <div className={styles.body}>
          <p className={styles.lead}>
            Заведите рубрики — «Вердикт чата», «Учу фидить» — и здесь будет видно, какая набирает больше обычного поста.
          </p>
          <div>
            <Button size="sm" variant="secondary" icon="plus" onPress={onOpenSettings}>
              Добавить рубрики
            </Button>
          </div>
        </div>
      </Panel>
    );
  }
  return (
    <Panel title={TITLE} headingLevel={2} quiet icon={<Icon name="tag" />} note={NOTE}>
      <div className={styles.body}>
        <ul className={styles.list} aria-label={TITLE}>
          {summary.stats.map((stat) => (
            <li key={stat.id} className={styles.stat}>
              <span className={styles.name}>
                <strong>{stat.name}</strong>
                {stat.best ? (
                  <AriaButton
                    className={styles.best}
                    aria-label={`Лучший пост рубрики «${stat.name}»: ${itemTitle(stat.best)}`}
                    onPress={() => stat.best && onOpen(stat.best.id)}
                  >
                    Лучший: {itemTitle(stat.best)}
                  </AriaButton>
                ) : (
                  <span className={styles.meta}>Постов за период нет</span>
                )}
              </span>
              <span className={styles.figure}>
                <strong>{stat.multiple === null ? '—' : `${stat.multiple.toLocaleString('ru-RU')}×`}</strong>
                <span className={styles.meta}>
                  {stat.posts.length} {pluralRu(stat.posts.length, 'пост', 'поста', 'постов')}
                </span>
              </span>
              <span className={styles.figure}>
                <strong>{stat.medianViews === null ? '—' : formatCount(stat.medianViews)}</strong>
                <span className={styles.meta}>обычно просм.</span>
              </span>
              <span className={styles.figure}>
                <strong>{stat.bestHours === null ? '—' : `${stat.bestHours.from}–${stat.bestHours.to}`}</strong>
                <span className={styles.meta}>лучшие часы</span>
              </span>
            </li>
          ))}
        </ul>
        <p className={styles.meta}>
          Без рубрики: {summary.withoutRubric} {pluralRu(summary.withoutRubric, 'пост', 'поста', 'постов')}. Рубрика
          берётся из редактора поста, а если её там нет — из хештега или названия в начале поста.{' '}
          <AriaButton className={styles.link} onPress={onOpenSettings}>
            Рубрики
          </AriaButton>
        </p>
      </div>
    </Panel>
  );
}
