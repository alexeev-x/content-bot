import { useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';
import { safeRedirect, useAuth } from '../app/auth';
import { readAppEnvironment, readTelegramBotUsername, showEnvironmentBadge } from '../app/environment';
import { useDocumentTitle } from '../app/use-document-title';
import { AuthLoadingScreen, MiniAppSignIn, NoAccessState, SignInPanel } from '../features/auth';
import { ru } from '../shared/lib/ru';
import { isInsideTelegram } from '../shared/telegram/web-app';
import { Banner, Button, Card, PageHeader, Spinner } from '../shared/ui';
import styles from './LoginPage.module.css';

type Props = {
  /** Where the guard sent the operator from; sanitised before use. */
  redirect?: string | undefined;
};

export function LoginPage({ redirect }: Props) {
  useDocumentTitle(ru.pages.login);
  const router = useRouter();
  const auth = useAuth();
  const insideTelegram = isInsideTelegram();
  const target = auth.signedOutByUser ? '/' : safeRedirect(redirect);

  useEffect(() => {
    if (auth.status === 'authenticated') router.history.replace(target);
  }, [auth.status, router, target]);

  if (auth.status === 'authenticated') return <AuthLoadingScreen label={ru.auth.signingIn} />;

  let body;
  if (auth.status === 'forbidden') {
    body = <NoAccessState onAction={auth.leaveForbidden} />;
  } else if (insideTelegram) {
    body = <MiniAppSignIn isSigningIn={auth.status === 'checking'} error={auth.error} onRetry={auth.retry} />;
  } else if (auth.status === 'checking') {
    // Inline and as tall as the Telegram button that replaces it: a full-screen loader here made the card jump.
    body = (
      <p className={styles.checking}>
        <Spinner size={20} label={false} />
        <output>{ru.auth.checking}</output>
      </p>
    );
  } else {
    body = (
      <div className={styles.stack}>
        {auth.logoutUnconfirmed ? (
          <Banner tone="warning" title={ru.login.logoutUnconfirmedTitle}>
            {ru.login.logoutUnconfirmedBody}
          </Banner>
        ) : null}
        {auth.status === 'unavailable' ? (
          <Banner
            tone="warning"
            title={ru.login.restoreFailedTitle}
            action={
              <Button variant="secondary" icon="retry" onPress={auth.retry}>
                {ru.common.retry}
              </Button>
            }
          >
            {ru.login.restoreFailedBody}
          </Banner>
        ) : null}
        <SignInPanel botUsername={readTelegramBotUsername()} />
      </div>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.panel}>
        <div className={styles.brand}>
          <span className={styles.logo} aria-hidden="true">
            A
          </span>
          <span className={styles.brandText}>
            <strong>ALEXEEV</strong>
            <small>Studio</small>
          </span>
          {showEnvironmentBadge(readAppEnvironment()) ? <span className={styles.env}>{ru.shell.envBadge}</span> : null}
        </div>
        <Card>
          <div className={styles.stack}>
            <PageHeader title={ru.login.title} description={ru.login.description} />
            {body}
          </div>
        </Card>
        <p className={styles.note}>{ru.login.note}</p>
      </div>
    </main>
  );
}
