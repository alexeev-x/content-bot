import { ApiError } from '../../../shared/api/http-client';
import { ru } from '../../../shared/lib/ru';
import { Banner, Button, Spinner } from '../../../shared/ui';
import styles from './SignInPanel.module.css';

type Props = {
  /** Sign-in is running (the bootstrap does it automatically at load). */
  isSigningIn: boolean;
  /** Why the automatic sign-in did not produce a session. */
  error: unknown;
  onRetry: () => void;
};

/** Inside Telegram there is no widget: the page only reports the automatic sign-in. */
export function MiniAppSignIn({ isSigningIn, error, onRetry }: Props) {
  if (isSigningIn) {
    return (
      <p className={styles.pending}>
        <Spinner size={20} label={false} />
        <output>{ru.auth.signingIn}</output>
      </p>
    );
  }
  const expired = error instanceof ApiError && error.status === 401;
  return (
    <div className={styles.panel}>
      <Banner
        tone="error"
        title={expired ? ru.login.miniAppExpiredTitle : ru.login.miniAppFailedTitle}
        action={
          <Button icon="retry" onPress={onRetry}>
            {ru.common.retry}
          </Button>
        }
      >
        {expired ? ru.login.miniAppExpiredBody : ru.login.miniAppFailedBody}
      </Banner>
    </div>
  );
}
