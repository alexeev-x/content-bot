import type { ReactNode } from 'react';
import { ru } from '../lib/ru';
import { Button } from './Button';
import styles from './ErrorState.module.css';
import { Icon } from './Icon';

type Props = {
  title?: string;
  /** Short plain-language cause and what to do; never a bare HTTP code. */
  message: string;
  requestId?: string;
  /** Pass only for safe reads: retry must not repeat a publish. */
  onRetry?: () => void;
  action?: ReactNode;
  actionPlacement?: 'after-title' | 'after-details';
};

export function ErrorState({
  title = ru.ui.errorTitle,
  message,
  requestId,
  onRetry,
  action,
  actionPlacement = 'after-details'
}: Props) {
  const actions =
    onRetry || action ? (
      <div className={styles.actions}>
        {onRetry ? (
          <Button variant="secondary" icon="retry" onPress={onRetry}>
            {ru.ui.retry}
          </Button>
        ) : null}
        {action}
      </div>
    ) : null;

  return (
    <div className={styles.error} role="alert">
      <span className={styles.icon}>
        <Icon name="alert" size={22} />
      </span>
      <h2 className={styles.title}>{title}</h2>
      {actionPlacement === 'after-title' ? actions : null}
      <p className={styles.message}>{message}</p>
      {requestId ? (
        <p className={styles.request}>
          {ru.ui.requestId}: <code>{requestId}</code>
        </p>
      ) : null}
      {actionPlacement === 'after-details' ? actions : null}
    </div>
  );
}
