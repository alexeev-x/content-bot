import { useEffect, useState } from 'react';
import { Banner, Button, EmptyState, Icon, PageHeader } from '../../shared/ui';
import { useProtoNavigate, useProtoSearch } from './proto-kit';
import styles from './Auth.module.css';

/** Sign-in page: bare (no shell). The Telegram widget is a mock button; it signs in to the prototype only. */
export function LoginScreen() {
  const go = useProtoNavigate();
  const state = useProtoSearch().state;
  const [pending, setPending] = useState(state === 'loading');
  const [wait, setWait] = useState(state === 'retry' ? 42 : 0);
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const signIn = () => {
    setPending(true);
    setTimeout(() => go(''), 1000);
  };

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="login-title">
        <span className={styles.logo} aria-hidden="true">
          A
        </span>
        <p className={styles.brand}>ALEXEEV Studio</p>
        <h1 id="login-title" className={styles.title}>
          Вход
        </h1>
        {state === 'forbidden' ? (
          <Banner tone="error" title="Нет доступа к этой панели">
            Этот аккаунт Telegram не является владельцем. Войдите другим аккаунтом.
          </Banner>
        ) : null}
        {state === 'expired' ? <Banner tone="warning" title="Ссылка устарела, войдите снова" /> : null}
        {state === 'cancelled' ? <Banner tone="info" title="Вход отменён" /> : null}
        <div className={styles.slot}>
          <Button fullWidth icon="send" isLoading={pending} isDisabled={wait > 0} onPress={signIn}>
            {wait > 0 ? `Повторить через ${wait} с` : 'Войти через Telegram'}
          </Button>
        </div>
        <p className={styles.note}>
          <Icon name="info" size={14} /> Только для владельца
        </p>
      </section>
    </main>
  );
}

export function NotFoundScreen({ stub = false }: { stub?: boolean }) {
  const go = useProtoNavigate();
  return (
    <div className={styles.notFound}>
      <PageHeader title={stub ? 'Раздел в разработке' : 'Страница не найдена'} />
      <EmptyState
        icon={stub ? 'sparkle' : 'search'}
        title={stub ? 'Раздел появится позже' : 'Такой страницы нет'}
        description={
          stub ? 'Пока можно работать с публикациями.' : 'Возможно, ссылка устарела или адрес набран с ошибкой.'
        }
        action={<Button onPress={() => go(stub ? 'publications' : '')}>{stub ? 'К публикациям' : 'К обзору'}</Button>}
      />
    </div>
  );
}
