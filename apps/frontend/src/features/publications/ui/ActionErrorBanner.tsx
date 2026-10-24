import { Banner } from '../../../shared/ui';
import type { ActionError } from '../model/publication-errors';
import { copy } from './copy';
import styles from './ActionErrorBanner.module.css';

type Props = { error: ActionError };

/** A failed action: what happened, what the owner's input is still safe, and the requestId for support. */
export function ActionErrorBanner({ error }: Props) {
  return (
    <Banner tone={error.tone} title={error.title}>
      <p className={styles.text}>{error.body}</p>
      {error.requestId ? (
        <p className={styles.request}>
          {copy.errors.requestId}: <code>{error.requestId}</code>
        </p>
      ) : null}
    </Banner>
  );
}
