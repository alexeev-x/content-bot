import type { ActivityCategory, ActivityItemDto } from '@alexeev/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { formatClock } from '../../../shared/lib/clock';
import { Button, FilterChips, Icon, Skeleton } from '../../../shared/ui';
import { activityFeedQueryOptions } from '../api/activity-queries';
import { activityView, CATEGORY_LABELS } from '../model/activity-view';
import { toneStyle } from '../model/tone';
import styles from './ActivityFeed.module.css';
import { copy } from './copy';
import shell from './Dashboard.module.css';
import { Widget } from './Widget';

type Props = {
  timezone: string;
  now: Date;
  onOpen: (items: readonly ActivityItemDto[]) => void;
};

const CHIPS = [
  { id: 'all', label: copy.activity.all },
  ...(Object.keys(CATEGORY_LABELS) as ActivityCategory[]).map((id) => ({ id, label: CATEGORY_LABELS[id] }))
];

const formatFull = (iso: string, timezone: string) =>
  new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(iso));

const dayKey = (iso: string, timezone: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(iso)
  );

function dayLabel(key: string, now: Date, timezone: string): string {
  const today = dayKey(now.toISOString(), timezone);
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000).toISOString(), timezone);
  if (key === today) return copy.activity.today;
  if (key === yesterday) return copy.activity.yesterday;
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(`${key}T12:00:00Z`));
}

/** Everything that happened in the studio, newest first, grouped by day, with one filter row and «Показать ещё». */
export function ActivityFeed({ timezone, now, onOpen }: Props) {
  const [category, setCategory] = useState<'all' | ActivityCategory>('all');
  const query = useInfiniteQuery(activityFeedQueryOptions(category === 'all' ? {} : { category }));
  const items = query.data?.pages.flatMap((page) => page.items);
  const groups: { key: string; items: ActivityItemDto[] }[] = [];
  for (const item of items ?? []) {
    const key = dayKey(item.at, timezone);
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, items: [item] });
  }

  return (
    <Widget id="activity" title={copy.activity.title} busy={query.isPending}>
      <div className={`${shell.body} ${styles.body}`}>
        <FilterChips
          label={copy.activity.filter}
          chips={CHIPS}
          value={category}
          onChange={(id) => setCategory(id as 'all' | ActivityCategory)}
        />
        {query.isPending ? (
          <ul className={styles.list} aria-hidden="true">
            {['a', 'b', 'c', 'd'].map((key) => (
              <li key={key} className={styles.skeletonRow}>
                <Skeleton width={32} height={32} radius="var(--radius-pill)" />
                <Skeleton width="70%" height={14} />
              </li>
            ))}
          </ul>
        ) : query.isError ? (
          <div className={shell.emptyBlock}>
            <p className={shell.quiet}>{copy.activity.error}</p>
            <Button size="sm" variant="secondary" onPress={() => void query.refetch()}>
              {copy.activity.retry}
            </Button>
          </div>
        ) : groups.length === 0 ? (
          <p className={shell.quiet}>{copy.activity.empty}</p>
        ) : (
          <div className={styles.days}>
            {groups.map((group) => (
              <section key={group.key} className={styles.day} aria-label={dayLabel(group.key, now, timezone)}>
                <h3 className={styles.dayTitle}>{dayLabel(group.key, now, timezone)}</h3>
                <ol className={styles.timeline}>
                  {group.items.map((item) => {
                    const view = activityView(item);
                    return (
                      <li key={item.id} className={styles.event} data-tone={view.tone} style={toneStyle(view.tone)}>
                        <span className={styles.node} aria-hidden="true">
                          <Icon name={view.icon} size={14} />
                        </span>
                        <AriaButton className={styles.row} onPress={() => onOpen([item])}>
                          <span className={styles.line}>
                            <span className={styles.what}>{view.text}</span>
                            {view.subject ? <span className={styles.subject}>{view.subject}</span> : null}
                          </span>
                          <span className={styles.meta}>
                            {item.actor === 'owner' ? copy.activity.owner : copy.activity.systemShort}
                            {item.channelTitle ? ` · ${item.channelTitle}` : ''}
                            {' · '}
                            <time dateTime={item.at} title={formatFull(item.at, timezone)}>
                              {formatClock(item.at, timezone)}
                            </time>
                          </span>
                        </AriaButton>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
            {query.hasNextPage ? (
              <Button
                size="sm"
                variant="ghost"
                isLoading={query.isFetchingNextPage}
                onPress={() => void query.fetchNextPage()}
              >
                {copy.activity.more}
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </Widget>
  );
}
