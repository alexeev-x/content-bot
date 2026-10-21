import type { AiComparisonDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { Banner, Button, EmptyState, ErrorState, Panel, Skeleton, TextField } from '../../../shared/ui';
import { aiComparisonsQueryOptions, useChooseAiComparison, useStartAiComparisons } from '../api/ai-queries';
import styles from './AiComparison.module.css';

const MODEL_LABEL: Record<string, string> = {
  'claude-opus-5-5': 'Claude Opus 5.5',
  'gpt-6.1-sol': 'GPT-6.1 Sol',
  'gpt-6-astra': 'GPT-6 Astra'
};
const label = (model: string) => MODEL_LABEL[model] ?? model;
const CHOICE: Record<'a' | 'b' | 'same', string> = { a: 'Лучше A', b: 'Лучше B', same: 'Одинаково' };

function Pair({ item }: { item: AiComparisonDto }) {
  const choose = useChooseAiComparison();
  const [note, setNote] = useState(item.note ?? '');
  const pick = (choice: 'a' | 'b' | 'same') =>
    choose.mutate({ id: item.id, choice, ...(note.trim() === '' ? {} : { note: note.trim() }) });
  return (
    <li className={styles.pair}>
      <h3 className={styles.label}>{item.label}</h3>
      {item.status === 'writing' ? (
        <p className={styles.muted} aria-live="polite">
          Обе модели пишут этот пост…
        </p>
      ) : item.status === 'failed' ? (
        <p className={styles.muted}>Одна из моделей не написала текст — эта пара не считается.</p>
      ) : (
        <>
          <div className={styles.columns}>
            {(['a', 'b'] as const).map((side) => (
              <section key={side} className={styles.version} data-chosen={item.choice === side || undefined}>
                <h4 className={styles.side}>
                  {side.toUpperCase()}
                  {item.models ? ` — ${label(item.models[side])}` : ''}
                </h4>
                <p className={styles.text}>{item[side]}</p>
              </section>
            ))}
          </div>
          <TextField label="Почему (необязательно)" value={note} onChange={setNote} maxLength={500} />
          <div className={styles.actions}>
            {(['a', 'b', 'same'] as const).map((choice) => (
              <Button
                key={choice}
                variant={item.choice === choice ? 'primary' : 'secondary'}
                isLoading={choose.isPending && choose.variables?.choice === choice}
                isDisabled={choose.isPending}
                onPress={() => pick(choice)}
              >
                {CHOICE[choice]}
              </Button>
            ))}
          </div>
          {choose.isError ? (
            <Banner tone="error" title="Не сохранилось">
              Сервер не подтвердил выбор. Повторите.
            </Banner>
          ) : null}
        </>
      )}
    </li>
  );
}

/** The blind provider comparison (docs/ai/claude-provider.md §3): pick the better post without knowing the model. */
export function AiComparison() {
  const list = useQuery(aiComparisonsQueryOptions());
  const start = useStartAiComparisons();
  const data = list.data;
  const reason = start.error instanceof ApiError ? start.error.reason : undefined;
  return (
    <Panel
      title="Сравнение моделей"
      headingLevel={2}
      quiet
      note={
        data && (data.tally.wins.length > 0 || data.tally.same > 0)
          ? [
              ...data.tally.wins.map((win) => `${label(win.model)}: ${win.count}`),
              `одинаково: ${data.tally.same}`
            ].join(' · ')
          : undefined
      }
      action={
        <Button variant="primary" icon="sparkle" isLoading={start.isPending} onPress={() => start.mutate()}>
          Запустить сравнение
        </Button>
      }
    >
      <p className={styles.muted}>
        Последние задания ИИ пишут обе модели одним и тем же способом. Выберите текст лучше — какая модель его написала,
        видно только после выбора.
      </p>
      {start.isError ? (
        <Banner tone="error" title="Не запустилось">
          {reason === 'NO_KEY'
            ? 'Нужны ключи обеих моделей и модель OpenAI в настройках ИИ.'
            : start.error instanceof ApiError && start.error.code === 'RATE_LIMIT'
              ? 'Сравнение уже запускали недавно. Подождите несколько минут.'
              : 'Сервер не подтвердил запуск. Повторите.'}
        </Banner>
      ) : null}
      {start.isSuccess ? (
        <Banner tone="info" title={`Запущено пар: ${start.data.created}`}>
          Тексты появятся здесь через несколько минут.
        </Banner>
      ) : null}
      {list.isPending ? (
        <Skeleton lines={8} />
      ) : !data ? (
        <ErrorState message="Не удалось загрузить сравнение. Повторите." onRetry={() => void list.refetch()} />
      ) : data.items.length === 0 ? (
        <EmptyState icon="sparkle" title="Сравнений пока нет" description="Нажмите «Запустить сравнение»." />
      ) : (
        <ol className={styles.list}>
          {data.items.map((item) => (
            <Pair key={item.id} item={item} />
          ))}
        </ol>
      )}
    </Panel>
  );
}
