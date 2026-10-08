import { fromAbsolute, type ZonedDateTime } from '@internationalized/date';
import { useMemo, useState } from 'react';
import {
  Banner,
  Button,
  ConfirmDialog,
  DataTable,
  DateTimeField,
  Dialog,
  Disclosure,
  Drawer,
  EmptyState,
  ErrorState,
  Icon,
  PageHeader,
  Panel,
  PanelList,
  Radio,
  RadioGroup,
  MediaTile,
  RowCard,
  ColumnFilter,
  SearchField,
  Select,
  StatusBadge,
  Tab,
  TabList,
  Tabs,
  TextField,
  useToast,
  type DataColumn,
  type TableSort
} from '../../shared/ui';
import { NOW, excerptOf, formatDateTime, formatUtc, type Publication } from './data';
import {
  AppliedChips,
  FilterButton,
  FilterSheet,
  FooterLine,
  PhoneSkeletonRows,
  channelName,
  shortChannel,
  type Chip
} from './parts';
import { PublishDialog, ZONE } from './PublishDialog';
import { usePostMedia } from './media';
import { useNarrow, useProtoNavigate, useProtoSearch, useProtoSearchUpdate, useScreenPhase } from './proto-kit';
import { useProtoStore, type ResolveChoice } from './proto-store';
import styles from './Proto.module.css';
import inspector from './Inspector.module.css';

type View = 'all' | 'scheduled' | 'sent' | 'errors';
const GROUPS: Record<Exclude<View, 'all'>, readonly string[]> = {
  scheduled: ['scheduled', 'queued', 'retry_wait', 'preparing', 'sending'],
  sent: ['sent'],
  errors: ['failed', 'unknown']
};
const STATUS_OPTIONS = [
  { id: 'all', label: 'Все' },
  { id: 'scheduled', label: 'Запланировано' },
  { id: 'queued', label: 'В очереди' },
  { id: 'sending', label: 'Публикуется' },
  { id: 'sent', label: 'Опубликовано' },
  { id: 'retry_wait', label: 'Повтор по расписанию' },
  { id: 'failed', label: 'Ошибка' },
  { id: 'unknown', label: 'Требует проверки' },
  { id: 'cancelled', label: 'Отменено' }
];
const SORT_OPTIONS = [
  { id: 'time-desc', label: 'Сначала новые' },
  { id: 'time-asc', label: 'Сначала старые' }
];
const PAGE = 8;
const IN_PROGRESS = ['preparing', 'sending', 'queued'];

const LABELS: Record<string, string> = {
  created: 'Создана',
  prepared: 'Подготовка',
  sent: 'Отправка',
  result: 'Результат'
};

/** Pipeline steps: reached ones are solid, future ones muted (no clock icons). */
function Pipeline({ item }: { item: Publication }) {
  const reached =
    item.status === 'scheduled' || item.status === 'retry_wait'
      ? 1
      : item.status === 'queued'
        ? 2
        : item.status === 'preparing'
          ? 2
          : item.status === 'sending'
            ? 3
            : 4;
  const failed = item.status === 'failed' || item.status === 'unknown' || item.status === 'cancelled';
  const steps = Object.entries(LABELS);
  return (
    <ol className={inspector.pipeline} aria-label="Этапы публикации">
      {steps.map(([key, text], index) => {
        const done = index < reached - (index === 3 && failed ? 1 : 0);
        const current = index === reached - 1 && !done;
        return (
          <li key={key} data-done={done || undefined} data-current={current || undefined}>
            <span className={inspector.stepMark}>{done ? <Icon name="check" size={12} /> : null}</span>
            <span>
              {index === 3 && failed
                ? item.status === 'cancelled'
                  ? 'Отменена'
                  : item.status === 'unknown'
                    ? 'Ответа нет'
                    : 'Ошибка'
                : text}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className={inspector.fact}>
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

type InspectorProps = { id: string; onClose: () => void };

function Inspector({ id, onClose }: InspectorProps) {
  const narrow = useNarrow();
  const toast = useToast();
  const go = useProtoNavigate();
  const { publications, posts, channels, cancelPublication, reschedule, resolveUnknown, offline } = useProtoStore();
  const item = publications.find((row) => row.id === id);
  const post = posts.find((row) => row.id === item?.postId);
  const [reconciling, setReconciling] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const [messageNo, setMessageNo] = useState('');
  const [resendAt, setResendAt] = useState<ZonedDateTime | null>(() => fromAbsolute(NOW + 3 * 3_600_000, ZONE));
  const [confirmResolve, setConfirmResolve] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveAt, setMoveAt] = useState<ZonedDateTime | null>(null);
  const [pending, setPending] = useState(false);

  if (!item) return null;
  const channel = channelName(channels, item.channelId);
  const short = shortChannel(channel);
  const title = post?.title ?? 'Пост удалён';
  const status = item.status;
  const canMove = ['scheduled', 'queued', 'retry_wait'].includes(status);

  const resolveText =
    choice === 'sent'
      ? `Публикация будет закрыта как опубликованная${messageNo ? ` (сообщение ${messageNo})` : ''}. Повторная отправка не запустится.`
      : choice === 'resend'
        ? `Пост будет отправлен повторно ${resendAt ? formatDateTime(resendAt.toDate().getTime()) : ''} в «${short}». Возможен дубль, если сообщение всё же есть.`
        : 'Публикация будет закрыта без отправки. Пост в канал не уйдёт.';
  const doResolve = async () => {
    if (!choice) return;
    setPending(true);
    await resolveUnknown(item.id, choice as ResolveChoice, resendAt?.toDate().getTime());
    setPending(false);
    setConfirmResolve(false);
    setReconciling(false);
    toast.show({
      tone: 'success',
      title:
        choice === 'sent'
          ? 'Закрыто как опубликованное'
          : choice === 'resend'
            ? 'Отправка запланирована'
            : 'Публикация отменена',
      description: 'Инцидент закрыт.'
    });
  };

  const footer = reconciling ? (
    <>
      <Button variant="secondary" onPress={() => setReconciling(false)}>
        Назад
      </Button>
      <Button isDisabled={!choice || offline} onPress={() => setConfirmResolve(true)}>
        Подтвердить
      </Button>
    </>
  ) : status === 'unknown' ? (
    <Button onPress={() => setReconciling(true)}>Проверить в Telegram и закрыть</Button>
  ) : canMove ? (
    <>
      <Button
        variant="secondary"
        isDisabled={offline}
        onPress={() => {
          setMoveAt(fromAbsolute(item.at, ZONE));
          setMoveOpen(true);
        }}
      >
        Перенести
      </Button>
      <Button variant="danger" isDisabled={offline} onPress={() => setConfirmCancel(true)}>
        Отменить публикацию
      </Button>
    </>
  ) : status === 'sent' ? (
    <Button variant="secondary" icon="link">
      Открыть в Telegram
    </Button>
  ) : status === 'failed' || status === 'cancelled' ? (
    <Button variant="secondary" onPress={() => post && go(`posts/${post.id}`)}>
      Открыть пост
    </Button>
  ) : (
    <span className={inspector.note}>
      <Icon name="loader" size={16} /> Идёт отправка. Страница обновится сама.
    </span>
  );

  return (
    <>
      <Drawer
        variant={narrow ? 'bottom' : 'side'}
        isOpen
        onOpenChange={(open) => !open && onClose()}
        title={reconciling ? 'Проверка публикации' : title}
        meta={<StatusBadge status={status} />}
        footer={footer}
      >
        {reconciling ? (
          <div className={inspector.stack}>
            <Banner tone="warning" title="Telegram не ответил. Сообщение могло уйти.">
              Не повторяйте отправку, пока не проверили канал.
            </Banner>
            <ol className={inspector.steps}>
              <li>
                <strong>Откройте канал «{short}» и найдите пост.</strong>
                <span className={inspector.copyRow}>
                  <code className={inspector.copy}>{title}</code>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="link"
                    onPress={() => toast.show({ tone: 'info', title: 'Название скопировано' })}
                  >
                    Копировать
                  </Button>
                </span>
              </li>
              <li>
                <strong>Выберите, что вы увидели.</strong>
              </li>
            </ol>
            <RadioGroup label="Результат проверки" variant="card" value={choice ?? ''} onChange={setChoice}>
              <Radio value="sent" description="Закроем публикацию как опубликованную.">
                Сообщение есть в канале
              </Radio>
              <Radio value="resend" description="Выберите время новой отправки.">
                Сообщения нет, отправить снова
              </Radio>
              <Radio value="drop" description="Публикация будет отменена.">
                Сообщения нет, не отправлять
              </Radio>
            </RadioGroup>
            {choice === 'sent' ? (
              <TextField
                label="Номер сообщения"
                description="Необязательно"
                value={messageNo}
                onChange={setMessageNo}
              />
            ) : null}
            {choice === 'resend' ? (
              <DateTimeField label="Когда отправить" value={resendAt} onChange={setResendAt} timeZone={ZONE} />
            ) : null}
          </div>
        ) : (
          <div className={inspector.stack}>
            {status === 'unknown' ? (
              <Banner tone="warning" title="Telegram не ответил. Сообщение могло уйти.">
                Не повторяйте отправку, пока не проверили канал.
              </Banner>
            ) : null}
            {status === 'failed' && item.failure ? (
              <Banner tone="error" title="Не удалось отправить">
                {item.failure}. Исправьте причину и запланируйте пост заново из самого поста.
              </Banner>
            ) : null}
            <Pipeline item={item} />
            <dl className={inspector.facts}>
              <Fact term="Канал">{channel}</Fact>
              <Fact term="Время">
                {formatDateTime(item.at)} <span className={styles.muted}>(UTC+3)</span>
              </Fact>
              {item.messageId ? (
                <Fact term="Сообщение">
                  <a className={styles.link} href="#telegram" onClick={(event) => event.preventDefault()}>
                    #{item.messageId} в Telegram
                  </a>
                </Fact>
              ) : null}
              <Fact term="Пост">
                {post ? (
                  <button type="button" className={inspector.linkButton} onClick={() => go(`posts/${post.id}`)}>
                    {post.title}
                  </button>
                ) : (
                  'Пост удалён'
                )}
              </Fact>
            </dl>
            <Disclosure id="tech" title="Технические данные">
              <dl className={inspector.facts}>
                <Fact term="ID публикации">
                  <code>{item.id}</code>
                </Fact>
                <Fact term="Время UTC">
                  <code>{formatUtc(item.at)}</code>
                </Fact>
                <Fact term="Попыток">{item.attempts}</Fact>
                <Fact term="Request ID">
                  <code>req_{item.id}c9a1</code>
                </Fact>
              </dl>
            </Disclosure>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        isOpen={confirmResolve}
        onOpenChange={(open) => !open && !pending && setConfirmResolve(false)}
        title="Подтвердить проверку?"
        description={resolveText}
        confirmLabel={
          choice === 'resend'
            ? 'Отправить снова'
            : choice === 'sent'
              ? 'Закрыть как опубликовано'
              : 'Отменить публикацию'
        }
        cancelLabel="Не подтверждать"
        tone={choice === 'resend' ? 'danger' : 'default'}
        isPending={pending}
        onConfirm={() => void doResolve()}
      />
      <ConfirmDialog
        isOpen={confirmCancel}
        onOpenChange={(open) => !open && !pending && setConfirmCancel(false)}
        title={`Отменить публикацию в «${short}» на ${formatDateTime(item.at)}?`}
        description="Отменить это действие нельзя. Пост можно будет запланировать заново из самого поста."
        confirmLabel="Отменить публикацию"
        cancelLabel="Не отменять"
        isPending={pending}
        onConfirm={() => {
          setPending(true);
          void cancelPublication(item.id).then(() => {
            setPending(false);
            setConfirmCancel(false);
            toast.show({ tone: 'success', title: 'Публикация отменена' });
          });
        }}
      />
      <Dialog
        isOpen={moveOpen}
        onOpenChange={(open) => !pending && setMoveOpen(open)}
        title="Перенести публикацию"
        description={`Сейчас: ${formatDateTime(item.at)}${moveAt ? `. Будет: ${formatDateTime(moveAt.toDate().getTime())}` : ''}`}
        footer={
          <>
            <Button variant="secondary" onPress={() => setMoveOpen(false)}>
              Отмена
            </Button>
            <Button
              isLoading={pending}
              onPress={() => {
                if (!moveAt) return;
                setPending(true);
                void reschedule(item.id, moveAt.toDate().getTime()).then(() => {
                  setPending(false);
                  setMoveOpen(false);
                  toast.show({ tone: 'success', title: `Перенесено на ${formatDateTime(moveAt.toDate().getTime())}` });
                });
              }}
            >
              Перенести
            </Button>
          </>
        }
      >
        <DateTimeField
          label="Новое время"
          value={moveAt}
          onChange={setMoveAt}
          timeZone={ZONE}
          description={`Часовой пояс: ${ZONE}`}
        />
      </Dialog>
    </>
  );
}

export function PublicationsScreen() {
  const narrow = useNarrow();
  const { phase, retry } = useScreenPhase();
  const search = useProtoSearch();
  const update = useProtoSearchUpdate();
  const { publications, posts, channels } = useProtoStore();
  const media = usePostMedia();
  const view: View =
    search.view === 'scheduled' || search.view === 'sent' || search.view === 'errors' ? search.view : 'all';
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [channel, setChannel] = useState('all');
  const [sort, setSort] = useState('time-desc');
  const [shown, setShown] = useState(PAGE);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState({ status: 'all', channel: 'all', sort: 'time-desc' });
  const [publishOpen, setPublishOpen] = useState(false);

  const postOf = (item: Publication) => posts.find((p) => p.id === item.postId);
  const errorCount = publications.filter((item) => GROUPS.errors.includes(item.status)).length;
  const filtersCount = (status !== 'all' ? 1 : 0) + (channel !== 'all' ? 1 : 0) + (sort !== 'time-desc' ? 1 : 0);
  const channelOptions = [
    { id: 'all', label: 'Все' },
    ...channels.map((c) => ({ id: c.id, label: shortChannel(c.name) }))
  ];

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return publications
      .filter(
        (item) =>
          (view === 'all' || GROUPS[view].includes(item.status)) &&
          (status === 'all' || item.status === status) &&
          (channel === 'all' || item.channelId === channel) &&
          (!needle || (postOf(item)?.title ?? '').toLowerCase().includes(needle))
      )
      .sort((a, b) => (sort === 'time-asc' ? a.at - b.at : b.at - a.at));
  }, [publications, posts, view, query, status, channel, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const visible = rows.slice(0, shown);
  const empty = phase === 'empty' || publications.length === 0;
  const reset = () => {
    setQuery('');
    setStatus('all');
    setChannel('all');
    setSort('time-desc');
  };
  const chips: Chip[] = [
    ...(status !== 'all'
      ? [{ id: 'status', label: `Статус: ${STATUS_OPTIONS.find((o) => o.id === status)?.label}` }]
      : []),
    ...(channel !== 'all'
      ? [{ id: 'channel', label: `Канал: ${channelOptions.find((o) => o.id === channel)?.label}` }]
      : []),
    ...(sort !== 'time-desc' ? [{ id: 'sort', label: 'Сначала старые' }] : [])
  ];
  const removeChip = (id: string) =>
    id === 'status' ? setStatus('all') : id === 'channel' ? setChannel('all') : setSort('time-desc');
  const open = (id: string) => update({ id }, false);

  const filtered = query.trim() !== '' || status !== 'all' || channel !== 'all';
  const tableSort: TableSort = { column: 'time', direction: sort === 'time-asc' ? 'ascending' : 'descending' };

  // Desktop: sort, search and filters live in the column headers; the phone keeps the filter sheet.
  const columns: DataColumn<Publication>[] = [
    {
      id: 'time',
      header: 'Время',
      allowsSorting: true,
      cell: (item) => <span className={`${styles.mono} ${styles.nowrap}`}>{formatDateTime(item.at)}</span>
    },
    {
      id: 'post',
      header: 'Пост',
      isRowHeader: true,
      headerControl: (
        <ColumnFilter label="Поиск по публикациям" icon="search" isActive={query.trim() !== ''}>
          <SearchField
            label="Название поста"
            placeholder="Что ищем?"
            value={query}
            // The owner opened the search popover on purpose: its only field takes focus.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            onChange={(value) => {
              setQuery(value);
              setShown(PAGE);
            }}
          />
        </ColumnFilter>
      ),
      cell: (item) => (
        <span className={styles.cellMedia}>
          <MediaTile src={media(item.postId)} size={40} />
          <span className={styles.cellTitle}>
            <strong>{postOf(item)?.title ?? 'Пост удалён'}</strong>
            <span className={styles.excerpt}>{excerptOf(postOf(item)?.body ?? '') || '—'}</span>
          </span>
        </span>
      )
    },
    {
      id: 'channel',
      header: 'Канал',
      headerControl: (
        <ColumnFilter label="Фильтр по каналу" isActive={channel !== 'all'}>
          <RadioGroup label="Канал" value={channel} onChange={setChannel}>
            {channelOptions.map((option) => (
              <Radio key={option.id} value={option.id}>
                {option.label}
              </Radio>
            ))}
          </RadioGroup>
        </ColumnFilter>
      ),
      cell: (item) => <span className={styles.clamp}>{shortChannel(channelName(channels, item.channelId))}</span>
    },
    {
      id: 'status',
      header: 'Статус',
      headerControl: (
        <ColumnFilter label="Фильтр по статусу" isActive={status !== 'all'}>
          <RadioGroup label="Статус" value={status} onChange={setStatus}>
            {STATUS_OPTIONS.map((option) => (
              <Radio key={option.id} value={option.id}>
                {option.label}
              </Radio>
            ))}
          </RadioGroup>
        </ColumnFilter>
      ),
      cell: (item) => <StatusBadge status={item.status} />
    },
    {
      id: 'message',
      header: 'Сообщение',
      cell: (item) =>
        item.messageId ? (
          <span className={`${styles.mono} ${styles.muted}`}>#{item.messageId}</span>
        ) : (
          <span className={styles.muted}>—</span>
        )
    }
  ];

  let body;
  if (phase === 'loading') {
    body = narrow ? (
      <PhoneSkeletonRows thumb label="Загрузка публикаций" />
    ) : (
      <DataTable
        flush
        rowHeight="tall"
        aria-label="Загрузка публикаций"
        columns={columns}
        rows={[]}
        getRowId={(r) => r.id}
        isLoading
        loadingRows={8}
      />
    );
  } else if (phase === 'error') {
    body = (
      <ErrorState
        message="Не удалось загрузить публикации. Данные в Telegram не затронуты."
        requestId="req_41d0be77"
        onRetry={retry}
      />
    );
  } else if (empty) {
    body = (
      <EmptyState
        icon="send"
        title="Публикаций пока нет"
        description="Опубликуйте утверждённый пост сейчас или по расписанию."
        action={
          <Button icon="send" onPress={() => setPublishOpen(true)}>
            Опубликовать пост
          </Button>
        }
      />
    );
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        icon="search"
        title="Ничего не найдено"
        description="Измените запрос или фильтры."
        action={
          <Button variant="secondary" onPress={reset}>
            Сбросить фильтры
          </Button>
        }
      />
    );
  } else if (narrow) {
    body = (
      <PanelList aria-label="Публикации">
        {visible.map((item) => (
          <RowCard
            key={item.id}
            title={postOf(item)?.title ?? 'Пост удалён'}
            media={<MediaTile src={media(item.postId)} size={44} />}
            status={<StatusBadge status={item.status} />}
            meta={`${formatDateTime(item.at)} · ${shortChannel(channelName(channels, item.channelId))}`}
            {...(item.status === 'unknown' ? { warning: 'Проверьте канал' } : {})}
            isActive={search.id === item.id}
            onPress={() => open(item.id)}
          />
        ))}
      </PanelList>
    );
  } else {
    body = (
      <DataTable
        flush
        rowHeight="tall"
        aria-label="Публикации"
        columns={columns}
        rows={visible}
        getRowId={(r) => r.id}
        activeId={search.id}
        onRowAction={open}
        sort={tableSort}
        onSortChange={(next) => setSort(next.direction === 'ascending' ? 'time-asc' : 'time-desc')}
      />
    );
  }

  const stale = search.state === 'stale' && phase === 'ready';
  const footer =
    phase === 'ready' && !empty ? (
      <FooterLine
        text={
          stale
            ? 'Данные устарели'
            : `${narrow ? '' : 'Загружено '}${visible.length} из ${rows.length}${rows.some((r) => IN_PROGRESS.includes(r.status)) ? ' · обновляется' : ''}`
        }
        action={
          stale ? (
            <Button variant="ghost" size="sm" icon="retry" onPress={() => update({ state: undefined })}>
              Обновить
            </Button>
          ) : visible.length < rows.length ? (
            <Button variant="ghost" size="sm" onPress={() => setShown((v) => v + PAGE)}>
              Показать ещё
            </Button>
          ) : undefined
        }
      />
    ) : phase === 'loading' ? (
      <FooterLine text="Загружаем…" />
    ) : undefined;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Публикации"
        actions={
          <Button icon="send" onPress={() => setPublishOpen(true)}>
            Опубликовать пост
          </Button>
        }
      />
      <Tabs
        selectedKey={view}
        onSelectionChange={(key) => {
          update({ view: key === 'all' ? undefined : String(key) });
          setShown(PAGE);
        }}
      >
        <TabList aria-label="Разделы публикаций">
          <Tab id="all">Все</Tab>
          <Tab id="scheduled">{narrow ? 'Планы' : 'Запланированные'}</Tab>
          <Tab id="sent">{narrow ? 'Отправлено' : 'Отправленные'}</Tab>
          <Tab id="errors">
            Ошибки <span className="tab-count">{errorCount}</span>
          </Tab>
        </TabList>
      </Tabs>
      <Panel
        title={narrow ? 'Публикации' : 'Все публикации'}
        action={
          <>
            {!narrow && filtered && phase === 'ready' ? (
              <Button variant="ghost" size="sm" icon="x" onPress={reset}>
                Сбросить фильтры
              </Button>
            ) : null}
            <span className={styles.panelNote}>{ZONE}, UTC+3</span>
          </>
        }
        reserveRows={phase === 'ready' && !empty ? undefined : narrow ? 6 : 8}
        footer={footer}
      >
        {narrow ? (
          <div className={styles.toolbarRow} data-narrow>
            <div className={styles.toolbarSearch}>
              <SearchField
                label="Поиск по публикациям"
                placeholder="Поиск"
                value={query}
                isDisabled={phase === 'loading'}
                onChange={(value) => {
                  setQuery(value);
                  setShown(PAGE);
                }}
              />
            </div>
            <FilterButton
              count={filtersCount}
              onPress={() => {
                setDraft({ status, channel, sort });
                setSheetOpen(true);
              }}
            />
          </div>
        ) : null}
        {phase === 'ready' && !empty && narrow ? <AppliedChips chips={chips} onRemove={removeChip} /> : null}
        {body}
      </Panel>

      <FilterSheet
        isOpen={sheetOpen}
        onOpenChange={setSheetOpen}
        count={
          (draft.status !== 'all' ? 1 : 0) + (draft.channel !== 'all' ? 1 : 0) + (draft.sort !== 'time-desc' ? 1 : 0)
        }
        onReset={() => setDraft({ status: 'all', channel: 'all', sort: 'time-desc' })}
        onApply={() => {
          setStatus(draft.status);
          setChannel(draft.channel);
          setSort(draft.sort);
          setSheetOpen(false);
        }}
      >
        <Select
          label="Статус"
          options={STATUS_OPTIONS}
          value={draft.status}
          onChange={(v) => setDraft({ ...draft, status: v })}
        />
        <Select
          label="Канал"
          options={channelOptions}
          value={draft.channel}
          onChange={(v) => setDraft({ ...draft, channel: v })}
        />
        <Select
          label="Сортировка"
          options={SORT_OPTIONS}
          value={draft.sort}
          onChange={(v) => setDraft({ ...draft, sort: v })}
        />
      </FilterSheet>

      {search.id ? <Inspector key={search.id} id={search.id} onClose={() => update({ id: undefined })} /> : null}
      <PublishDialog isOpen={publishOpen} onOpenChange={setPublishOpen} />
    </div>
  );
}
