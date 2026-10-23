import { ApiError } from '../../../shared/api/http-client';
import { Banner, Button } from '../../../shared/ui';
import { useSendRichSamples } from '../api/sources-queries';

const TARGET = { channel: 'Тест канал', owner: 'ваш чат' } as const;

/**
 * DEV only (owner, 23.10.2026): sends the Telegram rich message samples, made of posts already published, to the test
 * channel and the owner's chat, to see on a phone and a desktop before posts use them.
 */
export function RichSamplesButton({ state }: { state: ReturnType<typeof useSendRichSamples> }) {
  return (
    <Button
      variant="secondary"
      icon="send"
      isLoading={state.isPending}
      isDisabled={state.isPending}
      onPress={() => state.mutate()}
    >
      Rich-образцы (DEV)
    </Button>
  );
}

export function RichSamplesResult({ state }: { state: ReturnType<typeof useSendRichSamples> }) {
  if (state.error) {
    const reason = state.error instanceof ApiError ? state.error.reason : undefined;
    return (
      <Banner tone="error" title="Образцы не отправлены" onDismiss={() => state.reset()}>
        {reason === 'NO_TEST_CHANNEL'
          ? 'Нет включённого канала с названием «Тест…» в «Каналах».'
          : reason === 'RICH_SAMPLES_OFF'
            ? 'Образцы есть только на DEV.'
            : state.error.message}
      </Banner>
    );
  }
  if (!state.data) return null;
  const { results } = state.data;
  const failed = results.filter((each) => each.status === 'failed');
  return (
    <Banner
      tone={failed.length === 0 ? 'info' : 'warning'}
      title={`Отправлено ${results.length - failed.length} из ${results.length}`}
      onDismiss={() => state.reset()}
    >
      {failed.length === 0 ? (
        'Смотрите «Тест канал» и чат с ботом на телефоне и на компьютере.'
      ) : (
        <ul>
          {failed.map((each) => (
            <li key={`${each.sample}-${each.target}`}>
              {each.sample} → {TARGET[each.target]}: {each.error}
            </li>
          ))}
        </ul>
      )}
    </Banner>
  );
}
