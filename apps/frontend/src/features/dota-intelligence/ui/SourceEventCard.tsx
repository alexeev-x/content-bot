import type { SourceEventDto, SourceEventEntityDto, SourceEventStatus } from '@alexeev/contracts';
import { Link } from '@tanstack/react-router';
import { Button, Icon, StatusBadge, StatusPill, VisuallyHidden } from '../../../shared/ui';
import { DotaTime } from './DotaTime';
import styles from './SourceEventCard.module.css';

const STATUS_PILLS: Record<
  SourceEventStatus,
  { label: string; group: 'active' | 'muted' | 'done'; icon: 'sparkle' | 'edit' | 'check-circle' | 'minus-circle' }
> = {
  new: { label: 'Новое', group: 'active', icon: 'sparkle' },
  drafted: { label: 'Черновик', group: 'muted', icon: 'edit' },
  published: { label: 'Опубликовано', group: 'done', icon: 'check-circle' },
  hidden: { label: 'Пропущено', group: 'muted', icon: 'minus-circle' }
};
const FACTS_SHOWN = 10;

const entityKey = (entity: SourceEventEntityDto) => `${entity.kind}:${entity.name.toLocaleLowerCase('en-US')}`;
const kindWord = (kind: SourceEventEntityDto['kind'], count: number) =>
  kind === 'hero' ? (count === 1 ? 'герой' : 'героев') : count === 1 ? 'предмет' : 'предметов';

function Facts({ event }: { event: SourceEventDto }) {
  if (event.type !== 'patch' || event.facts.length === 0) return null;
  const watched = new Set(event.watchHits.map(entityKey));
  const ordered = [
    ...event.facts.filter((fact) => watched.has(entityKey(fact))),
    ...event.facts.filter((fact) => !watched.has(entityKey(fact)))
  ];
  const shown = ordered.slice(0, FACTS_SHOWN);
  const heroes = event.facts.filter((fact) => fact.kind === 'hero').length;
  const items = event.facts.length - heroes;
  return (
    <div className={styles.facts}>
      <p className={styles.factsLine}>
        Изменения:{' '}
        {[
          heroes > 0 ? `${heroes} ${kindWord('hero', heroes)}` : '',
          items > 0 ? `${items} ${kindWord('item', items)}` : ''
        ]
          .filter(Boolean)
          .join(', ')}
      </p>
      <ul className={styles.chips} aria-label="Затронутые герои и предметы">
        {shown.map((fact) => (
          <li key={entityKey(fact)} className={styles.chip} data-watched={watched.has(entityKey(fact)) || undefined}>
            {watched.has(entityKey(fact)) ? <Icon name="bell" size={13} /> : null}
            {fact.name}
            {watched.has(entityKey(fact)) ? <VisuallyHidden>, вы следите</VisuallyHidden> : null}
          </li>
        ))}
        {ordered.length > shown.length ? <li className={styles.more}>и ещё {ordered.length - shown.length}</li> : null}
      </ul>
    </div>
  );
}

type Props = {
  event: SourceEventDto;
  now: number;
  timezone: string;
  busy: 'draft' | 'visibility' | null;
  onMakeDraft: (event: SourceEventDto) => void;
  onSetHidden: (event: SourceEventDto, hidden: boolean) => void;
  onOpenDraft: (postId: string) => void;
  onPublish: (postId: string) => void;
};

export function SourceEventCard({
  event,
  now,
  timezone,
  busy,
  onMakeDraft,
  onSetHidden,
  onOpenDraft,
  onPublish
}: Props) {
  const status = STATUS_PILLS[event.status];
  const draft = event.draft;
  const sourceLabel = event.sourceName;
  return (
    <article className={styles.card} aria-labelledby={`event-${event.id}`}>
      <div className={styles.head}>
        {event.status === 'drafted' && event.publication ? (
          <StatusBadge status={event.publication.status} />
        ) : (
          <StatusPill {...status} />
        )}
        <span className={styles.time}>
          <DotaTime iso={event.publishedAt} now={now} timezone={timezone} />
        </span>
      </div>
      <h3 id={`event-${event.id}`} className={styles.title}>
        {event.title}
      </h3>
      <p className={styles.source}>
        {sourceLabel}
        {' · '}
        <a href={event.sourceUrl} target="_blank" rel="noreferrer" className={styles.link}>
          Открыть источник
          <Icon name="external" size={13} />
        </a>
        {event.type === 'patch' ? (
          <>
            {' · '}
            <Link className={styles.link} to="/sources" search={(previous) => ({ ...previous, update: event.id })}>
              Разбор патча
            </Link>
          </>
        ) : null}
      </p>
      {event.summary ? <p className={styles.summary}>{event.summary}</p> : null}
      <Facts event={event} />
      <div className={styles.actions}>
        {event.status === 'hidden' ? (
          <Button
            size="sm"
            variant="secondary"
            isLoading={busy === 'visibility'}
            onPress={() => onSetHidden(event, false)}
          >
            Вернуть
          </Button>
        ) : draft ? (
          <>
            {event.status === 'drafted' ? (
              <Button size="sm" variant="primary" icon="send" onPress={() => onPublish(draft.postId)}>
                Опубликовать
              </Button>
            ) : null}
            <Button size="sm" variant="secondary" icon="edit" onPress={() => onOpenDraft(draft.postId)}>
              {event.status === 'published' ? 'Открыть пост' : 'Открыть черновик'}
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="primary"
            icon="plus"
            isLoading={busy === 'draft'}
            onPress={() => onMakeDraft(event)}
          >
            Сделать пост
          </Button>
        )}
        {event.status === 'new' || event.status === 'drafted' ? (
          <Button size="sm" variant="ghost" isLoading={busy === 'visibility'} onPress={() => onSetHidden(event, true)}>
            Пропустить
          </Button>
        ) : null}
      </div>
    </article>
  );
}

/** A typical card (status, two-line title, source line, three summary lines, two actions) in the card's own classes and line heights. */
export function SourceEventCardSkeleton() {
  const lines = (count: number) =>
    Array.from({ length: count }, (_, index) => (
      <span key={index} className={styles.placeholderLine}>
        {'\u00a0'}
      </span>
    ));
  return (
    <article className={styles.card} aria-hidden="true">
      <div className={styles.head}>
        <span className={`${styles.placeholder} ${styles.placeholderBadge}`}>{'\u00a0'}</span>
      </div>
      <h3 className={styles.title}>{lines(2)}</h3>
      <p className={styles.source}>
        <span className={`${styles.placeholder} ${styles.placeholderLink}`}>{'\u00a0'}</span>
      </p>
      <p className={styles.summary}>{lines(3)}</p>
      <div className={styles.actions}>
        <span className={`${styles.placeholder} ${styles.placeholderButton}`} />
        <span className={`${styles.placeholder} ${styles.placeholderButton}`} />
      </div>
    </article>
  );
}
