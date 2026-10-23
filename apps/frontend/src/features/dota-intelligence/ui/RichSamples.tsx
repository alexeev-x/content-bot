import type { RichSampleKey } from '@alexeev/contracts';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { Banner, Button, Checkbox, Dialog } from '../../../shared/ui';
import { useSendRichSamples } from '../api/sources-queries';

const SAMPLES: { key: RichSampleKey; label: string }[] = [
  { key: 'patch_f', label: 'Патч 7.41f' },
  { key: 'patch_e', label: 'Патч 7.41e' },
  { key: 'hotfix', label: 'Хотфикс 1 июля' },
  { key: 'series_event', label: 'Серия ивента 1/3: карнавал' },
  { key: 'series_cosmetics', label: 'Серия ивента 2/3: автоматоны' },
  { key: 'series_treasure', label: 'Серия ивента 3/3: сокровище' },
  { key: 'trove_news', label: 'Trove of Terror: новость' },
  { key: 'trove_sets', label: 'Trove of Terror: сеты' },
  { key: 'trove_details', label: 'Trove of Terror: шансы' },
  { key: 'news_scrub', label: 'Новость: Летняя чистка' },
  { key: 'news_ti', label: 'Новость: The International' },
  { key: 'datamine', label: 'Файлы игры (rich)' },
  { key: 'datamine_classic', label: 'Файлы игры (обычный pre)' },
  { key: 'daily_report', label: 'Отчёт за день (в ваш чат)' },
  { key: 'weekly_report', label: 'Отчёт за неделю (в ваш чат)' }
];

type State = ReturnType<typeof useSendRichSamples>;

/**
 * DEV only (owner, 23.10.2026): the chosen rich message samples go out (posts to the test channel, reports to the
 * owner's chat), so after a fix only the samples with remarks are sent again; and the paid picture trial.
 */
export function RichSamplesButton({ state }: { state: State }) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<ReadonlySet<RichSampleKey>>(new Set());
  const toggle = (key: RichSampleKey, on: boolean) =>
    setChosen((previous) => {
      const next = new Set(previous);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  const run = (input: Parameters<State['mutate']>[0]) => {
    state.mutate(input);
    setOpen(false);
  };
  return (
    <>
      <Button variant="secondary" icon="send" isLoading={state.isPending} onPress={() => setOpen(true)}>
        Rich-образцы (DEV)
      </Button>
      <Dialog
        isOpen={open}
        onOpenChange={setOpen}
        title="Rich-образцы"
        description="Посты уходят в «Тест канал», отчёты — в ваш чат."
        footer={
          <>
            <Button
              variant="primary"
              isDisabled={chosen.size === 0 || state.isPending}
              onPress={() => run({ samples: [...chosen] })}
            >
              Отправить выбранные ({chosen.size})
            </Button>
            <Button variant="secondary" isDisabled={state.isPending} onPress={() => run({ pictureTrial: true })}>
              Улучшить 5 картинок через ИИ (платно)
            </Button>
          </>
        }
      >
        {SAMPLES.map((sample) => (
          <Checkbox key={sample.key} isSelected={chosen.has(sample.key)} onChange={(on) => toggle(sample.key, on)}>
            {sample.label}
          </Checkbox>
        ))}
      </Dialog>
    </>
  );
}

export function RichSamplesResult({ state }: { state: State }) {
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
  if (state.data.pictureTrialQueued)
    return (
      <Banner tone="info" title="Проверка картинок запущена" onDismiss={() => state.reset()}>
        Пять «до / после» со стоимостью придут в чат с ботом за несколько минут.
      </Banner>
    );
  const { results } = state.data;
  const failed = results.filter((each) => each.status === 'failed');
  return (
    <Banner
      tone={failed.length === 0 ? 'info' : 'warning'}
      title={`Отправлено ${results.length - failed.length} из ${results.length}`}
      onDismiss={() => state.reset()}
    >
      {failed.length === 0 ? (
        'Смотрите «Тест канал» и чат с ботом.'
      ) : (
        <ul>
          {failed.map((each) => (
            <li key={`${each.sample}-${each.target}`}>
              {each.sample}: {each.error}
            </li>
          ))}
        </ul>
      )}
    </Banner>
  );
}
