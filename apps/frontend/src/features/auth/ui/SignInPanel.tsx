import { telegramWidgetSignInInputSchema } from '@alexeev/contracts';
import { useState, type ReactNode } from 'react';
import { ru } from '../../../shared/lib/ru';
import { Banner, Spinner } from '../../../shared/ui';
import { useSignInWidget } from '../api/auth-queries';
import { problemFromError, retryWait, type LoginProblem } from './login-feedback';
import { RetryAfterButton } from './RetryAfterButton';
import styles from './SignInPanel.module.css';
import { TelegramLoginWidget } from './TelegramLoginWidget';

type Props = {
  /** From the build (vite.config.ts); undefined shows a configuration error instead of a dead widget. */
  botUsername: string | undefined;
};

const COPY: Record<Exclude<LoginProblem['kind'], 'rateLimit'>, { title: string; body: string }> = {
  cancelled: { title: ru.login.cancelledTitle, body: ru.login.cancelledBody },
  invalid: { title: ru.login.invalidTitle, body: ru.login.invalidBody },
  expired: { title: ru.login.expiredTitle, body: ru.login.expiredBody },
  forbidden: { title: ru.login.forbiddenTitle, body: ru.login.forbiddenBody },
  unavailable: { title: ru.login.unavailableTitle, body: ru.login.unavailableBody }
};

/** Browser sign-in: the Login Widget plus every way it can fail. The session itself is set by the mutation. */
export function SignInPanel({ botUsername }: Props) {
  const signIn = useSignInWidget();
  const [problem, setProblem] = useState<LoginProblem | null>(null);
  // A new widget instance gives a fresh signature after any failure.
  const [widgetKey, setWidgetKey] = useState(0);

  if (!botUsername) {
    return (
      <Banner tone="error" title={ru.login.botMissingTitle}>
        {ru.login.botMissingBody}
      </Banner>
    );
  }

  const fail = (next: LoginProblem) => {
    setProblem(next);
    setWidgetKey((value) => value + 1);
  };

  const handleUser = (user: unknown) => {
    if (signIn.isPending) return;
    const parsed = telegramWidgetSignInInputSchema.safeParse(user);
    if (!parsed.success) {
      fail({ kind: 'invalid' });
      return;
    }
    setProblem(null);
    // The object goes to the server as Telegram sent it: the hash covers every field.
    signIn.mutate(user as typeof parsed.data, { onError: (error) => fail(problemFromError(error)) });
  };

  let notice: ReactNode = null;
  if (problem?.kind === 'rateLimit') {
    notice = (
      <Banner
        tone="warning"
        title={ru.login.rateLimitTitle}
        action={
          <RetryAfterButton
            key={widgetKey}
            seconds={retryWait(problem.retryAfterSeconds)}
            onRetry={() => setProblem(null)}
          />
        }
      >
        {ru.login.rateLimitBody(retryWait(problem.retryAfterSeconds))}
      </Banner>
    );
  } else if (problem) {
    const copy = COPY[problem.kind];
    notice = (
      <Banner tone={problem.kind === 'cancelled' ? 'info' : 'error'} title={copy.title}>
        {copy.body}
      </Banner>
    );
  }

  return (
    <div className={styles.panel}>
      {notice}
      {signIn.isPending ? (
        <p className={styles.pending}>
          <Spinner size={20} label={false} />
          <output>{ru.auth.signingIn}</output>
        </p>
      ) : null}
      {problem?.kind === 'rateLimit' ? null : (
        <div className={styles.widget} inert={signIn.isPending}>
          <TelegramLoginWidget
            key={widgetKey}
            botUsername={botUsername}
            onUser={handleUser}
            onCancel={() => fail({ kind: 'cancelled' })}
          />
        </div>
      )}
    </div>
  );
}
