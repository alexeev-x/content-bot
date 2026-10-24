import type { AutopublishActivityItemDto, AutopublishHeldReason, AutopublishSource } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { EmptyState, ErrorState, Icon, Panel, PanelList, PanelRow, Skeleton, StatusPill } from '../../../shared/ui';
import { autopublishActivityQueryOptions } from '../api/operations-queries';
import { useOwnerTimezone } from '../model/use-owner-timezone';
import styles from './AutopublishActivity.module.css';

const SOURCE: Record<AutopublishSource, string> = {
  event: 'Новость Valve',
  game_files: 'Файлы игры',
  steam: 'Сигнал Steam',
  series: 'Серия постов'
};

// Why it did not go out by itself; the owner got the post as a draft or a note in the bot instead.
const REASON: Record<AutopublishHeldReason, string> = {
  off: 'автопубликация была выключена',
  channel: 'канал не выбран или выключен',
  limit: 'дневной лимит исчерпан',
  too_long: 'текст длиннее, чем вмещает пост',
  link: 'в тексте ссылка — проверьте сами',
  no_images: 'не загрузились картинки',
  failed: 'сбой при публикации'
};

function Row({ item, timezone }: { item: AutopublishActivityItemDto; timezone: string }) {
  const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: timezone }).format(
    new Date(item.at)
  );
  const published = item.outcome === 'published';
  return (
    <PanelRow>
      <div className={styles.row}>
        <time className={styles.time} dateTime={item.at}>
          {time}
        </time>
        <div className={styles.main}>
          {item.postId === null ? (
            <span className={styles.title}>{item.title}</span>
          ) : (
            <Link to="/posts/$id" params={{ id: item.postId }} className={styles.title}>
              {item.title}
            </Link>
          )}
          <span className={styles.meta}>
            {SOURCE[item.source]}
            {!published && item.reason !== null ? ` · ${REASON[item.reason]}` : ''}
          </span>
        </div>
        <StatusPill
          label={published ? 'Вышел' : 'Не вышел'}
          group={published ? 'done' : 'unknown'}
          icon={published ? 'check-circle' : 'alert'}
        />
      </div>
    </PanelRow>
  );
}

/** «За сутки»: what went out without the owner and what was held, and why (owner, 24.10.2026). */
export function AutopublishActivity() {
  const timezone = useOwnerTimezone();
  const query = useQuery(autopublishActivityQueryOptions());
  const data = query.data;
  return (
    <Panel
      title="Автопубликация за сутки"
      icon={<Icon name="send" />}
      {...(data === undefined
        ? {}
        : {
            note: `Вышло без вас: ${data.usedToday} из ${data.dailyLimit}.${data.enabled ? '' : ' Сейчас автопубликация выключена.'}`
          })}
    >
      {query.isError && data === undefined ? (
        <ErrorState message="Не удалось загрузить историю автопубликации." onRetry={() => void query.refetch()} />
      ) : data === undefined ? (
        <div className={styles.loading} aria-hidden="true">
          <Skeleton width="100%" height="2lh" />
          <Skeleton width="100%" height="2lh" />
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon="send"
          title="За сутки ничего не было"
          description="Здесь появятся посты, которые вышли без вас, и те, что пришли вам черновиком, — с причиной."
        />
      ) : (
        <PanelList aria-label="Автопубликация за сутки">
          {data.items.map((item) => (
            <Row key={item.id} item={item} timezone={timezone} />
          ))}
        </PanelList>
      )}
    </Panel>
  );
}
