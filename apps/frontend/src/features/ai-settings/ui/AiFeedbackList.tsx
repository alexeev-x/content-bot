import { useQuery } from '@tanstack/react-query';
import { ErrorState, IconButton, Skeleton, useToast } from '../../../shared/ui';
import { aiFeedbackQueryOptions, useDeleteAiFeedback } from '../api/ai-queries';
import { copy } from './copy';
import styles from './AiFeedbackList.module.css';

const when = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** The verdicts recorded by «Что не так?», newest first, each one removable (plan stage 2). Loads when opened. */
export function AiFeedbackList() {
  const query = useQuery(aiFeedbackQueryOptions());
  const remove = useDeleteAiFeedback();
  const toast = useToast();

  if (query.isPending)
    return (
      <div className={styles.body} aria-busy="true">
        <Skeleton lines={3} height={20} />
      </div>
    );
  if (query.isError)
    return <ErrorState message={copy.quality.feedbackLoadError} onRetry={() => void query.refetch()} />;

  const items = query.data.items;
  return (
    <div className={styles.body}>
      <p className={styles.hint}>{copy.quality.feedbackListHint}</p>
      {items.length === 0 ? (
        <p className={styles.hint}>{copy.quality.feedbackEmpty}</p>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => {
            const reason = copy.quality.feedback[item.kind];
            return (
              <li key={item.id} className={styles.row}>
                <div className={styles.text}>
                  <p className={styles.reason}>
                    {reason}
                    <span className={styles.meta}>
                      {' · '}
                      {copy.quality.format[item.format]} · {when(item.createdAt)}
                    </span>
                  </p>
                  <p className={styles.excerpt}>{item.text ?? item.task}</p>
                </div>
                <IconButton
                  label={copy.quality.feedbackDelete(reason)}
                  icon="trash"
                  isDisabled={remove.isPending}
                  onPress={() =>
                    remove.mutate(item.id, {
                      onSuccess: () => toast.show({ tone: 'success', title: copy.quality.feedbackDeleted }),
                      onError: () => toast.show({ tone: 'error', title: copy.quality.feedbackDeleteFailed })
                    })
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
