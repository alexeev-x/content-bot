import type { AiComparisonDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { Banner, Button, EmptyState, ErrorState, Panel, Skeleton, Spinner, TextField } from '../../../shared/ui';
import { aiComparisonsQueryOptions, useChooseAiComparison, useStartAiComparisons } from '../api/ai-queries';
import styles from './AiComparison.module.css';

const MODEL_LABEL: Record<string, string> = {
  'claude-opus-5-5': 'Claude Opus 5.5',
  'gpt-6.1-sol': 'GPT-6.1 Sol',
  'gpt-6-astra': 'GPT-6 Astra'
};
const label = (model: string) => MODEL_LABEL[model] ?? model;
const CHOICE: Record<'a' | 'b' | 'same', string> = { a: 'Лучше A', b: 'Лучше B', same: 'Одинаково' };
const CHOSEN: Record<'a' | 'b' | 'same', string> = { a: 'Выбран A', b: 'Выбран B', same: 'Одинаково' };

function Pair({ item, index }: { item: AiComparisonDto; index: number }) {
  const choose = useChooseAiComparison();
  const [note, setNote] = useState(item.note ?? '');
  const pick = (choice: 'a' | 'b' | 'same') =>
    choose.mutate({ id: item.id, choice, ...(note.trim() === '' ? {} : { note: note.trim() }) });
  return (
    <li className={styles.pair}>
      <div className={styles.pairHead}>
        <span className={styles.index} aria-hidden="true">
          {index}
        </span>
        <h3 className={styles.label}>{item.label}</h3>
        {item.choice ? <span className={styles.chosen}>{CHOSEN[item.choice]}</span> : null}
      </div>
      {item.status === 'writing' ? (
        <p className={styles.state} aria-live="polite">
          <Spinner size={16} label="" /> Обе модели пишут этот текст…
        </p>
      ) : item.status === 'failed' ? (
        <p className={styles.state}>
          {item.failure === 'budget'
            ? 'Не написано: закончился лимит расходов на ИИ (день или месяц). Поднимите его в «Настройки → ИИ» и нажмите «Новые пары».'
            : 'Не написано: модель вернула ошибку. Пара не считается; «Новые пары» попробуют это задание снова.'}
        </p>
      ) : (
        <>
          <div className={styles.columns}>
            {(['a', 'b'] as const).map((side) => (
              <section
                key={side}
                className={styles.version}
                data-chosen={item.choice === side || item.choice === 'same' || undefined}
                aria-label={`Вариант ${side.toUpperCase()}`}
              >
                <div className={styles.side}>
                  <span className={styles.letter}>{side.toUpperCase()}</span>
                  {item.models ? <span className={styles.model}>{label(item.models[side])}</span> : null}
                </div>
                <p className={styles.text}>{item[side]}</p>
              </section>
            ))}
          </div>
          <div className={styles.footer}>
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
            <div className={styles.note}>
              <TextField
                label="Почему (необязательно)"
                value={note}
                onChange={setNote}
                maxLength={500}
                placeholder="Например: живее начало, меньше шуток"
              />
            </div>
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

/** The blind provider comparison (docs/ai/claude-provider.md §3): pick the better text without knowing the model. */
export function AiComparison() {
  const list = useQuery(aiComparisonsQueryOptions());
  const start = useStartAiComparisons();
  const data = list.data;
  const reason = start.error instanceof ApiError ? start.error.reason : undefined;
  const hasPairs = data !== undefined && data.items.length > 0;
  const ready = data?.items.filter((item) => item.status === 'ready') ?? [];
  const chosen = ready.filter((item) => item.choice !== null).length;
  return (
    <Panel
      title="Сравнение моделей"
      headingLevel={2}
      quiet
      note={hasPairs ? `выбрано ${chosen} из ${ready.length}` : undefined}
      action={
        <Button
          variant={hasPairs ? 'secondary' : 'primary'}
          icon="sparkle"
          isLoading={start.isPending}
          onPress={() => start.mutate()}
        >
          {hasPairs ? 'Новые пары' : 'Запустить сравнение'}
        </Button>
      }
    >
      <div className={styles.intro}>
        <p className={styles.muted}>
          Обе модели пишут одни и те же задания — посты и рубрики. В каждой паре выберите текст лучше: какая модель его
          написала, видно только после выбора. «Новые пары» берут свежие задания, каждый запуск платный.
        </p>
        {data && (data.tally.wins.length > 0 || data.tally.same > 0) ? (
          <ul className={styles.tally} aria-label="Счёт">
            {data.tally.wins.map((win) => (
              <li key={win.model}>
                <span className={styles.tallyModel}>{label(win.model)}</span>
                <span className={styles.tallyCount}>{win.count}</span>
              </li>
            ))}
            <li>
              <span className={styles.tallyModel}>Одинаково</span>
              <span className={styles.tallyCount}>{data.tally.same}</span>
            </li>
          </ul>
        ) : null}
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
      </div>
      {list.isPending ? (
        <div className={styles.intro}>
          <Skeleton lines={8} />
        </div>
      ) : !data ? (
        <ErrorState message="Не удалось загрузить сравнение. Повторите." onRetry={() => void list.refetch()} />
      ) : data.items.length === 0 ? (
        <EmptyState icon="sparkle" title="Сравнений пока нет" description="Нажмите «Запустить сравнение»." />
      ) : (
        <ol className={styles.list}>
          {data.items.map((item, index) => (
            <Pair key={item.id} item={item} index={index + 1} />
          ))}
        </ol>
      )}
    </Panel>
  );
}
