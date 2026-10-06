import { useEffect, useRef, useState } from 'react';
import { ru } from '../../../shared/lib/ru';
import { Banner, Button, Skeleton, VisuallyHidden } from '../../../shared/ui';
import styles from './TelegramLoginWidget.module.css';

const WIDGET_SRC = 'https://telegram.org/js/telegram-widget.js?22';
const WIDGET_ORIGIN = 'https://oauth.telegram.org';
/** The iframe reports `ready` as soon as it loads; silence this long means the script or frame is blocked. */
const READY_TIMEOUT_MS = 12_000;

type Props = {
  botUsername: string;
  /** The user object exactly as Telegram sent it (the signature covers every field). */
  onUser: (user: unknown) => void;
  /** Telegram answered without a user (the operator closed or refused the Telegram window). */
  onCancel: () => void;
};

type LoadState = 'loading' | 'ready' | 'failed';

/**
 * Official Telegram Login Widget in callback mode: the signed user object reaches JavaScript, never a URL.
 * The `data-onauth` attribute is deliberately not used: the widget `eval`s it, which would force
 * `'unsafe-eval'` into the CSP. The same iframe posts the same `auth_user` message to this window instead,
 * and the sender is checked by origin and by window.
 */
export function TelegramLoginWidget({ botUsername, onUser, onCancel }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [attempt, setAttempt] = useState(0);
  const handlers = useRef({ onUser, onCancel });
  useEffect(() => {
    handlers.current = { onUser, onCancel };
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const script = document.createElement('script');
    script.async = true;
    script.src = WIDGET_SRC;
    script.dataset['telegramLogin'] = botUsername;
    script.dataset['size'] = 'large';
    script.dataset['radius'] = '12';
    script.dataset['userpic'] = 'false';
    script.dataset['lang'] = 'ru';
    script.onerror = () => setState('failed');
    const timer = setTimeout(
      () => setState((current) => (current === 'loading' ? 'failed' : current)),
      READY_TIMEOUT_MS
    );

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== WIDGET_ORIGIN) return;
      const iframe = host.querySelector('iframe');
      if (!iframe || event.source !== iframe.contentWindow) return;
      let data: unknown;
      try {
        data = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (typeof data !== 'object' || data === null) return;
      const message = data as { event?: unknown; auth_data?: unknown; init?: unknown };
      if (message.event === 'ready' || message.event === 'resize') {
        clearTimeout(timer);
        setState('ready');
      } else if (message.event === 'auth_user' && !message.init) {
        if (message.auth_data) handlers.current.onUser(message.auth_data);
        else handlers.current.onCancel();
      }
    };
    window.addEventListener('message', onMessage);
    host.append(script);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      script.onerror = null;
      host.replaceChildren();
    };
  }, [botUsername, attempt]);

  return (
    <div className={styles.root}>
      {state === 'failed' ? (
        <Banner
          tone="error"
          title={ru.login.widgetFailedTitle}
          action={
            <Button
              variant="secondary"
              icon="retry"
              onPress={() => {
                setState('loading');
                setAttempt((value) => value + 1);
              }}
            >
              {ru.common.retry}
            </Button>
          }
        >
          {ru.login.widgetFailedBody}
        </Banner>
      ) : null}
      {state === 'loading' ? (
        <div className={styles.placeholder} aria-busy="true">
          <Skeleton width={238} height={40} radius="var(--radius-2)" />
          <VisuallyHidden>{ru.login.widgetLoading}</VisuallyHidden>
        </div>
      ) : null}
      {/* Owned by the widget script: React renders no children here, so it never fights the injected iframe. */}
      <div ref={hostRef} className={styles.host} hidden={state === 'failed'} />
    </div>
  );
}
