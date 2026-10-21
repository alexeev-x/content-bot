import type { AiComparisonDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import {
  Banner,
  Button,
  ConfirmDialog,
  Disclosure,
  DisclosureGroup,
  EmptyState,
  ErrorState,
  Panel,
  Skeleton,
  Spinner,
  TextField
} from '../../../shared/ui';
import {
  aiComparisonsQueryOptions,
  useChooseAiComparison,
  useClearAiComparisons,
  useStartAiComparisons
} from '../api/ai-queries';
import styles from './AiComparison.module.css';
import { AiComparisonResults } from './AiComparisonResults';
const CHOICE: Record<'a' | 'b' | 'same', string> = { a: 'Лучше A', b: 'Лучше B', same: 'Одинаково' };
const CHOSEN: Record<'a' | 'b' | 'same', string> = { a: 'Выбран A', b: 'Выбран B', same: 'Одинаково' };

function Pair({ item }: { item: AiComparisonDto }) {
  const choose = useChooseAiComparison();
  const [note, setNote] = useState(item.note ?? '');
  const pick = (choice: 'a' | 'b' | 'same') =>
    choose.mutate({ id: item.id, choice, ...(note.trim() === '' ? {} : { note: note.trim() }) });
  return (
    <li className={styles.pair}>
      <div className={styles.pairHead}>
        {item.code ? <span className={styles.index}>{item.code}</span> : null}
        <h3 className={styles.label}>{item.label}</h3>
        {item.choice ? <span className={styles.chosen}>{CHOSEN[item.choice]}</span> : null}
      </div>
      <DisclosureGroup>
        <Disclosure id={`task-${item.id}`} title="Задание и источники">
          <p className={styles.task}>{item.task}</p>
        </Disclosure>
      </DisclosureGroup>
      {item.status === 'writing' ? (
        <p className={styles.state} aria-live="polite">
          <Spinner size={16} label="" /> Обе модели пишут этот текст…
        </p>
      ) : item.status === 'failed' ? (
        <p className={styles.state}>
          {item.failure === 'budget'
            ? 'Не завершена: закончился лимит расходов на ИИ (день или месяц). Пара не считается.'
            : 'Не завершена: одна из моделей не ответила и после повтора. Пара не считается; код ошибки откроется вместе с моделями.'}
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
                  {item.asked[side] ? <span className={styles.model}>задала вопрос вместо текста</span> : null}
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
  const clear = useClearAiComparisons();
  const [clearing, setClearing] = useState(false);
  const [view, setView] = useState<'pick' | 'results'>('pick');
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
        <div className={styles.headActions}>
          {data?.revealed ? (
            <Button
              variant={view === 'pick' ? 'primary' : 'secondary'}
              icon={view === 'pick' ? 'eye' : undefined}
              onPress={() => setView(view === 'pick' ? 'results' : 'pick')}
            >
              {view === 'pick' ? 'Показать модели' : 'К парам'}
            </Button>
          ) : null}
          {hasPairs ? (
            <Button variant="ghost" icon="trash" onPress={() => setClearing(true)}>
              Очистить
            </Button>
          ) : null}
          {hasPairs ? null : (
            <Button variant="primary" icon="sparkle" isLoading={start.isPending} onPress={() => start.mutate()}>
              Запустить тест
            </Button>
          )}
        </div>
      }
    >
      <div className={styles.intro}>
        <p className={styles.muted}>
          Тест № 2: 13 заданий — Reels, рубрики, посты в Telegram, серия «Тёмного карнавала» и списки идей. Каждое пишут
          обе модели через редактор; A и B распределены случайно в каждой паре. Выберите текст лучше — модели, цена и
          время откроются только после выбора во всех парах. Запуск платный, около $4–6.
        </p>
        {data?.revealed && view === 'pick' ? (
          <Banner tone="info" title="Все пары выбраны">
            Теперь можно посмотреть, какая модель что написала.
          </Banner>
        ) : null}
        {start.isError ? (
          <Banner tone="error" title="Не запустилось">
            {reason === 'NO_KEY'
              ? 'Нужны ключи обеих моделей и модель OpenAI в настройках ИИ.'
              : reason === 'NOT_EMPTY'
                ? 'Сначала очистите прошлые пары, чтобы тесты не смешались.'
                : reason === 'NO_SOURCES'
                  ? 'В «Источниках» не хватает новостей или патча для постов в Telegram.'
                  : start.error instanceof ApiError && start.error.code === 'RATE_LIMIT'
                    ? 'Сравнение уже запускали недавно. Подождите несколько минут.'
                    : 'Сервер не подтвердил запуск. Повторите.'}
          </Banner>
        ) : null}
        {clear.isError ? (
          <Banner tone="error" title="Не очистилось">
            Сервер не подтвердил удаление. Повторите.
          </Banner>
        ) : null}
        {start.isSuccess ? (
          <Banner tone="info" title={`Запущено пар: ${start.data.created}`}>
            Тексты появятся здесь через 5–15 минут; вторые посты серий пишутся после первых.
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
        <EmptyState icon="sparkle" title="Пар пока нет" description="Нажмите «Запустить тест»." />
      ) : data.revealed && view === 'results' ? (
        <AiComparisonResults data={data} />
      ) : (
        <ol className={styles.list}>
          {data.items.map((item) => (
            <Pair key={item.id} item={item} />
          ))}
        </ol>
      )}
      <ConfirmDialog
        isOpen={clearing}
        onOpenChange={setClearing}
        title="Удалить все пары?"
        description="Пропадут все пары, выборы и счёт. Тексты останутся в истории черновиков ИИ."
        confirmLabel="Удалить"
        cancelLabel="Оставить"
        isPending={clear.isPending}
        onConfirm={() => {
          void clear.mutateAsync().then(
            () => setClearing(false),
            () => setClearing(false)
          );
        }}
      />
    </Panel>
  );
}
