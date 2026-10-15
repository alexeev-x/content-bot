import type { DashboardPublicationDto } from '@alexeev/contracts';
import { Link } from '@tanstack/react-router';
import { Button, Icon, Skeleton } from '../../../shared/ui';
import shell from './Dashboard.module.css';
import styles from './Overview.module.css';
import { Widget } from './Widget';

type Props = {
  next: DashboardPublicationDto | undefined;
  loading: boolean;
  now: Date;
  timezone: string;
  onOpenPublication: (publicationId: string) => void;
  /** Opens the post of a publication for editing (the page resolves the post). */
  onEditPublication: (publicationId: string) => void;
  onNewPost: () => void;
};

/** «через 3 ч 20 мин», «через 2 дня» */
function countdown(at: string, now: Date): string {
  const minutes = Math.max(0, Math.round((Date.parse(at) - now.getTime()) / 60_000));
  if (minutes < 60) return `через ${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `через ${hours} ч ${minutes % 60} мин`;
  const days = Math.floor(hours / 24);
  return `через ${days} ${days % 10 === 1 && days % 100 !== 11 ? 'день' : days % 10 >= 2 && days % 10 <= 4 && (days % 100 < 12 || days % 100 > 14) ? 'дня' : 'дней'}`;
}

/** «Следующая публикация»: what goes out next, where and when, with the countdown and the two ways in. */
export function NextPublication({
  next,
  loading,
  now,
  timezone,
  onOpenPublication,
  onEditPublication,
  onNewPost
}: Props) {
  const when = next
    ? new Intl.DateTimeFormat('ru-RU', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timezone
      }).format(new Date(next.scheduledAt))
    : '';
  return (
    <Widget
      id="nextPublication"
      title="Следующая публикация"
      busy={loading}
      action={
        <Link to="/publications" className={shell.more}>
          Все публикации <Icon name="chevron-right" size={16} />
        </Link>
      }
    >
      <div className={styles.body}>
        {loading ? (
          <Skeleton height={120} />
        ) : !next ? (
          <div className={styles.empty}>
            <p className={shell.quiet}>Ничего не запланировано.</p>
            <Button size="sm" variant="secondary" icon="plus" onPress={onNewPost}>
              Новый пост
            </Button>
          </div>
        ) : (
          <>
            <div className={styles.next}>
              <span className={styles.nextIcon} aria-hidden="true">
                <Icon name="send" size={28} />
              </span>
              <div className={styles.nextText}>
                <p className={styles.nextTitle}>{next.postTitle || 'Без названия'}</p>
                <p className={styles.chips}>
                  <span className={styles.chip}>
                    <Icon name="channel" size={14} /> {next.destinationName}
                  </span>
                </p>
                <p className={styles.when}>
                  <Icon name="calendar" size={16} /> {when}
                </p>
                <p className={styles.countdown}>{countdown(next.scheduledAt, now)}</p>
              </div>
            </div>
            <div className={styles.actions}>
              <Button variant="secondary" icon="external" onPress={() => onOpenPublication(next.publicationId)}>
                Открыть
              </Button>
              <Button icon="edit" onPress={() => onEditPublication(next.publicationId)}>
                Изменить
              </Button>
            </div>
          </>
        )}
      </div>
    </Widget>
  );
}
