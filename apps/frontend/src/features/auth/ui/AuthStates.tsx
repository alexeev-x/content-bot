import { ApiError } from '../../../shared/api/http-client';
import { ru } from '../../../shared/lib/ru';
import { Button, ErrorState, Spinner } from '../../../shared/ui';
import styles from './AuthStates.module.css';

/** Full-viewport wait while the session is being restored or created. */
export function AuthLoadingScreen({ label }: { label: string }) {
  return (
    <div className={styles.screen} aria-busy="true">
      <Spinner size={28} label={label} />
      <p className={styles.label} aria-hidden="true">
        {label}
      </p>
    </div>
  );
}

/** 403: signed in, but not as the owner. No data, one way out. */
export function NoAccessState({ onAction }: { onAction: () => void }) {
  return (
    <ErrorState
      title={ru.auth.noAccessTitle}
      message={ru.auth.noAccessDescription}
      action={
        <Button variant="secondary" onPress={onAction}>
          {ru.auth.noAccessAction}
        </Button>
      }
    />
  );
}

/** The session could not be checked (network, 429, 503); a retry is a safe read. */
export function AuthUnavailableState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  // A 429 is not «the server did not answer»: it answered, and says when to come back.
  const limited = error instanceof ApiError && error.status === 429;
  const minutes = Math.max(
    1,
    Math.ceil(((error instanceof ApiError ? error.retryAfterSeconds : undefined) ?? 60) / 60)
  );
  return (
    <main className={styles.unavailableScreen}>
      <ErrorState
        title={limited ? ru.auth.rateLimitedTitle : ru.auth.unavailableTitle}
        message={limited ? ru.auth.rateLimitedDescription(minutes) : ru.auth.unavailableDescription}
        {...(requestId ? { requestId } : {})}
        actionPlacement="after-title"
        action={
          <Button variant="secondary" icon="retry" onPress={onRetry}>
            {ru.auth.retry}
          </Button>
        }
      />
    </main>
  );
}
