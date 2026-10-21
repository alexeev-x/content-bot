import type { AiComparisonDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import {
  Banner,
  Button,
  ConfirmDialog,
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
          <Button
            variant={hasPairs ? 'secondary' : 'primary'}
            icon="sparkle"
            isLoading={start.isPending}
            onPress={() => start.mutate()}
          >
            {hasPairs ? 'Новые пары' : 'Запустить сравнение'}
          </Button>
        </div>
      }
    >
      <div className={styles.intro}>
        <p className={styles.muted}>
          Обе модели пишут одни и те же задания — посты и рубрики. В каждой паре выберите текст лучше. Какая модель что
          написала, откроется только после выбора во всех парах. «Новые пары» берут свежие задания, каждый запуск
          платный.
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
      ) : data.revealed && view === 'results' ? (
        <AiComparisonResults data={data} />
      ) : (
        <ol className={styles.list}>
          {data.items.map((item, index) => (
            <Pair key={item.id} item={item} index={index + 1} />
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
