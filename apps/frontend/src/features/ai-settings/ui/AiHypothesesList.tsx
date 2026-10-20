import type { AiHypothesisDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { ErrorState, Skeleton } from '../../../shared/ui';
import { aiHypothesesQueryOptions } from '../api/ai-queries';
import { copy } from './copy';
import styles from './AiRulesList.module.css';

const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short' });

function HypothesisRow({ hypothesis }: { hypothesis: AiHypothesisDto }) {
  return (
    <li className={styles.row} data-closed={hypothesis.status === 'refuted' || undefined}>
      <div className={styles.text}>
        <p className={styles.ruleText}>
          H{hypothesis.code}. {hypothesis.text}
        </p>
        <p className={styles.meta}>
          {copy.rules.scope[hypothesis.scope]} · {copy.hypotheses.kind[hypothesis.kind]} ·{' '}
          {copy.hypotheses.status[hypothesis.status]}, {copy.hypotheses.confidence[hypothesis.confidence]} ·{' '}
          {when(hypothesis.updatedAt)}
        </p>
        {hypothesis.note === null ? null : <p className={styles.excerpt}>{hypothesis.note}</p>}
        {hypothesis.asked ? <p className={styles.meta}>{copy.hypotheses.asked}</p> : null}
      </div>
    </li>
  );
}

/** The analyst's hypotheses (owner, 20.10.2026): read-only, the bot asks about the supported ones. Loads when opened. */
export function AiHypothesesList() {
  const query = useQuery(aiHypothesesQueryOptions());

  if (query.isPending)
    return (
      <div className={styles.body} aria-busy="true">
        <Skeleton lines={3} height={20} />
      </div>
    );
  if (query.isError) return <ErrorState message={copy.hypotheses.loadError} onRetry={() => void query.refetch()} />;

  const { items } = query.data;
  return (
    <div className={styles.body}>
      <p className={styles.hint}>{copy.hypotheses.hint}</p>
      {items.length === 0 ? (
        <p className={styles.hint}>{copy.hypotheses.empty}</p>
      ) : (
        <ul className={styles.list}>
          {items.map((hypothesis) => (
            <HypothesisRow key={hypothesis.code} hypothesis={hypothesis} />
          ))}
        </ul>
      )}
    </div>
  );
}
