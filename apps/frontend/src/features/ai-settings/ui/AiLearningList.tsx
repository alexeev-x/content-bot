import type { AiLearningItemDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { ErrorState, Skeleton, Switch } from '../../../shared/ui';
import { aiLearningQueryOptions, useSetAiLearningExcluded } from '../api/ai-queries';
import { copy } from './copy';
import styles from './AiLearningList.module.css';

const when = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });

function sourceLabel(item: AiLearningItemDto) {
  if (item.source === 'post' || item.editRatio === null) return copy.learning.ownPost;
  return copy.learning.revision(Math.round(item.editRatio * 100));
}

/** One text: its own mutation, so only its switch is locked while the request runs. */
function LearningRow({ item }: { item: AiLearningItemDto }) {
  const mutation = useSetAiLearningExcluded();
  // While the request runs the switch shows the asked state; the cache changes only on the server's answer.
  const excluded = mutation.isPending ? mutation.variables.excluded : item.excluded;
  const parts = item.changedParts.map((part) => copy.quality.part[part]).join(', ');
  return (
    <li className={styles.row}>
      <div className={styles.text}>
        <p className={styles.source}>
          {sourceLabel(item)}
          <span className={styles.meta}>
            {' · '}
            {copy.quality.format[item.format]} · {when(item.createdAt)}
          </span>
        </p>
        {parts ? <p className={styles.meta}>{copy.learning.revisionParts(parts)}</p> : null}
        <p className={styles.excerpt}>{item.excerpt}</p>
        {mutation.isError ? (
          <p className={styles.error} role="alert">
            {copy.learning.saveFailed}
          </p>
        ) : null}
      </div>
      <Switch
        isSelected={!excluded}
        isDisabled={mutation.isPending}
        onChange={(included) => mutation.mutate({ source: item.source, id: item.id, excluded: !included })}
      >
        {copy.learning.include}
      </Switch>
    </li>
  );
}

/** What the writer learns from, newest first, each text switchable (plan stage 2). Loads when opened. */
export function AiLearningList() {
  const query = useQuery(aiLearningQueryOptions());

  if (query.isPending)
    return (
      <div className={styles.body} aria-busy="true">
        <Skeleton lines={3} height={20} />
      </div>
    );
  if (query.isError) return <ErrorState message={copy.learning.loadError} onRetry={() => void query.refetch()} />;

  const items = query.data.items;
  return (
    <div className={styles.body}>
      <p className={styles.hint}>{copy.learning.hint}</p>
      {items.length === 0 ? (
        <p className={styles.hint}>{copy.learning.empty}</p>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => (
            <LearningRow key={`${item.source}:${item.id}`} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
