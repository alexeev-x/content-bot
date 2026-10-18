import type { AiReelsScriptDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { ErrorState, Skeleton } from '../../../shared/ui';
import { aiUnlinkedScriptsQueryOptions } from '../api/ai-queries';
import { copy } from './copy';
import styles from './AiLearningList.module.css';

const when = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });

function ScriptRow({ script }: { script: AiReelsScriptDto }) {
  return (
    <li className={styles.rowSingle}>
      <p className={styles.source}>
        {copy.quality.format[script.format]}
        <span className={styles.meta}>
          {' · '}
          {copy.unlinked.approved(when(script.approvedAt))}
        </span>
      </p>
      <p className={styles.excerpt}>{script.excerpt}</p>
    </li>
  );
}

/** Approved scripts no video is linked to (plan stage 4). Loads when opened. */
export function AiUnlinkedScripts() {
  const query = useQuery(aiUnlinkedScriptsQueryOptions());

  if (query.isPending)
    return (
      <div className={styles.body} aria-busy="true">
        <Skeleton lines={3} height={20} />
      </div>
    );
  if (query.isError) return <ErrorState message={copy.unlinked.loadError} onRetry={() => void query.refetch()} />;

  const items = query.data.items;
  return (
    <div className={styles.body}>
      <p className={styles.hint}>{copy.unlinked.hint}</p>
      {items.length === 0 ? (
        <p className={styles.hint}>{copy.unlinked.empty}</p>
      ) : (
        <ul className={styles.list}>
          {items.map((script) => (
            <ScriptRow key={script.revisionId} script={script} />
          ))}
        </ul>
      )}
    </div>
  );
}
