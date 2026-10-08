import { useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  ColumnFilter,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  Menu,
  PageHeader,
  Panel,
  PanelList,
  Radio,
  RadioGroup,
  MediaTile,
  RowCard,
  SearchField,
  Select,
  StatusBadge,
  Tab,
  TabList,
  Tabs,
  useToast,
  type DataColumn,
  type MenuEntry,
  type RowSelection,
  type TableSort
} from '../../shared/ui';
import { excerptOf, type Post } from './data';
import { AppliedChips, FilterButton, FilterSheet, FooterLine, PhoneSkeletonRows, type Chip } from './parts';
import { usePostMedia } from './media';
import { useNarrow, useProtoNavigate, useProtoSearch, useProtoSearchUpdate, useScreenPhase } from './proto-kit';
import { useProtoStore } from './proto-store';
import styles from './Proto.module.css';

type View = 'all' | 'drafts' | 'archive';
const STATUS_OPTIONS = [
  { id: 'all', label: 'Все' },
  { id: 'draft', label: 'Черновик' },
  { id: 'approved', label: 'Утверждён' },
  { id: 'scheduled', label: 'Запланировано' },
  { id: 'preparing', label: 'Публикуется' },
  { id: 'sent', label: 'Опубликовано' },
  { id: 'unknown', label: 'Требует проверки' }
];
const SORT_OPTIONS = [
  { id: 'edited-desc', label: 'Сначала новые' },
  { id: 'edited-asc', label: 'Сначала старые' },
  { id: 'title', label: 'По названию' }
];
const PAGE = 6;

// Desktop sorts by clicking a column header; the phone sheet keeps the same choices as a list.
const toTableSort = (sort: string): TableSort =>
  sort.startsWith('title')
    ? { column: 'title', direction: sort === 'title' ? 'ascending' : 'descending' }
    : { column: 'edited', direction: sort === 'edited-asc' ? 'ascending' : 'descending' };
const fromTableSort = ({ column, direction }: TableSort): string =>
  column === 'title'
    ? direction === 'ascending'
      ? 'title'
      : 'title-desc'
    : direction === 'ascending'
      ? 'edited-asc'
      : 'edited-desc';
const titleOf = (post: Post) => post.title.trim() || 'Без названия';

function StateCell({ post }: { post: Post }) {
  return (
    <span className={styles.nowrap}>
      <StatusBadge status={post.state} />
      {post.state === 'scheduled' && post.plannedLabel ? (
        <span className={styles.plannedAt}> · {post.plannedLabel}</span>
      ) : null}
    </span>
  );
}

export function PostsScreen() {
  const narrow = useNarrow();
  const { phase, retry } = useScreenPhase();
  const search = useProtoSearch();
  const update = useProtoSearchUpdate();
  const go = useProtoNavigate();
  const toast = useToast();
  const { posts, deletePosts, restorePost } = useProtoStore();
  const media = usePostMedia();
  const view: View = search.view === 'drafts' || search.view === 'archive' ? search.view : 'all';
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('edited-desc');
  const [shown, setShown] = useState(PAGE);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<RowSelection>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState({ status: 'all', sort: 'edited-desc' });
  const [confirm, setConfirm] = useState<readonly string[] | null>(null);
  const [pending, setPending] = useState(false);

  const live = posts.filter((post) => !post.archived);
  const archived = posts.filter((post) => post.archived);
  const filtersCount = (status !== 'all' ? 1 : 0) + (sort !== 'edited-desc' ? 1 : 0);

  const rows = useMemo(() => {
    const source = view === 'archive' ? archived : view === 'drafts' ? live.filter((p) => p.state === 'draft') : live;
    const needle = query.trim().toLowerCase();
    const filtered = source.filter(
      (post) =>
        (status === 'all' || post.state === status) &&
        (!needle || `${post.title} ${post.body}`.toLowerCase().includes(needle))
    );
    return [...filtered].sort((a, b) =>
      sort === 'title'
        ? a.title.localeCompare(b.title, 'ru')
        : sort === 'title-desc'
          ? b.title.localeCompare(a.title, 'ru')
          : sort === 'edited-asc'
            ? a.editedAt - b.editedAt
            : b.editedAt - a.editedAt
    );
  }, [posts, view, query, status, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = rows.slice(0, shown);
  const selectedIds = selected === 'all' ? visible.map((p) => p.id) : [...selected];
  const noPostsAtAll = view === 'archive' ? archived.length === 0 : live.length === 0;
  const emptyData = phase === 'empty' || noPostsAtAll;
  const reset = () => {
    setQuery('');
    setStatus('all');
    setSort('edited-desc');
  };
  const chips: Chip[] = [
    ...(status !== 'all'
      ? [{ id: 'status', label: `Статус: ${STATUS_OPTIONS.find((o) => o.id === status)?.label}` }]
      : []),
    ...(sort !== 'edited-desc' ? [{ id: 'sort', label: SORT_OPTIONS.find((o) => o.id === sort)?.label ?? '' }] : [])
  ];
  const removeChip = (id: string) => (id === 'status' ? setStatus('all') : setSort('edited-desc'));
  const setView = (next: string) => {
    update({ view: next === 'all' ? undefined : next });
    setShown(PAGE);
    setSelected(new Set());
    setSelecting(false);
  };

  const menuFor = (post: Post): MenuEntry[] =>
    post.archived
      ? [
          { id: 'restore', label: 'Вернуть из архива', icon: 'retry' },
          { id: 'delete', label: 'Удалить сейчас', icon: 'trash', tone: 'danger' }
        ]
      : [
          { id: 'open', label: 'Открыть', icon: 'edit' },
          { id: 'delete', label: 'Удалить', icon: 'trash', tone: 'danger' }
        ];
  const onMenu = (post: Post, id: string) => {
    if (id === 'open') go(`posts/${post.id}`);
    else if (id === 'restore') {
      restorePost(post.id);
      toast.show({ tone: 'success', title: 'Пост возвращён из архива' });
    } else setConfirm([post.id]);
  };
  const rowMenu = (post: Post) => (
    <Menu label={`Действия: ${titleOf(post)}`} items={menuFor(post)} onAction={(id) => onMenu(post, id)} />
  );

  const doDelete = async () => {
    if (!confirm) return;
    setPending(true);
    await new Promise((resolve) => setTimeout(resolve, 700));
    deletePosts(confirm);
    setPending(false);
    setConfirm(null);
    setSelected(new Set());
    setSelecting(false);
    toast.show({
      tone: 'success',
      title: confirm.length === 1 ? 'Пост удалён' : `Удалено постов: ${confirm.length}`,
      description: view === 'archive' ? undefined : 'Они доступны в архиве 30 дней.'
    });
  };

  const columns: DataColumn<Post>[] = [
    {
      id: 'title',
      header: 'Пост',
      isRowHeader: true,
      allowsSorting: true,
      headerControl: (
        <ColumnFilter label="Поиск по постам" icon="search" isActive={query.trim() !== ''}>
          <SearchField
            label="Название или текст"
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
      cell: (post) => (
        <span className={styles.cellMedia}>
          <MediaTile src={media(post.id)} size={40} />
          <span className={styles.cellTitle}>
            <strong>{titleOf(post)}</strong>
            <span className={styles.excerpt}>{excerptOf(post.body) || 'Текст пока пустой'}</span>
          </span>
        </span>
      )
    },
    {
      id: 'state',
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
      cell: (post) => <StateCell post={post} />
    },
    {
      id: 'edited',
      header: view === 'archive' ? 'Удалится через' : 'Изменён',
      allowsSorting: true,
      cell: (post) => (
        <span className={`${styles.muted} ${styles.nowrap}`}>
          {view === 'archive' ? `${post.daysLeft} дн.` : post.edited}
        </span>
      )
    },
    { id: 'menu', header: '', align: 'end', cell: rowMenu }
  ];
  const filtered = query.trim() !== '' || status !== 'all';

  const toolbar = selecting ? (
    <div className={styles.toolbarRow} data-narrow={narrow || undefined}>
      <output>Выбрано: {selectedIds.length}</output>
      <span className={styles.toolbarSpacer} />
      <Button
        variant="danger"
        icon="trash"
        isDisabled={selectedIds.length === 0}
        onPress={() => setConfirm(selectedIds)}
      >
        Удалить
      </Button>
      <Button
        variant="secondary"
        onPress={() => {
          setSelecting(false);
          setSelected(new Set());
        }}
      >
        Отмена
      </Button>
    </div>
  ) : !narrow ? null : (
    <div className={styles.toolbarRow} data-narrow={narrow || undefined}>
      <div className={styles.toolbarSearch}>
        <SearchField
          label="Поиск по постам"
          placeholder={narrow ? 'Поиск' : 'Название или текст'}
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
          setDraft({ status, sort });
          setSheetOpen(true);
        }}
      />
    </div>
  );

  const resetAction =
    !narrow && filtered ? (
      <Button variant="ghost" size="sm" icon="x" onPress={reset}>
        Сбросить фильтры
      </Button>
    ) : null;
  const selectAction = narrow ? (
    <Menu
      label="Действия со списком"
      items={[{ id: 'select', label: 'Выбрать', icon: 'check-circle' }]}
      onAction={() => setSelecting(true)}
    />
  ) : (
    <Button
      variant="ghost"
      size="sm"
      icon="check-circle"
      isDisabled={rows.length === 0}
      onPress={() => setSelecting(true)}
    >
      Выбрать
    </Button>
  );

  let body;
  if (phase === 'loading') {
    body = narrow ? (
      <PhoneSkeletonRows thumb label="Загрузка постов" />
    ) : (
      <DataTable
        flush
        rowHeight="tall"
        aria-label="Загрузка постов"
        columns={columns}
        rows={[]}
        getRowId={(p) => p.id}
        isLoading
        loadingRows={8}
      />
    );
  } else if (phase === 'error') {
    body = (
      <ErrorState
        message="Не удалось загрузить посты. Проверьте соединение и повторите."
        requestId="req_8f3a21c9"
        onRetry={retry}
      />
    );
  } else if (emptyData) {
    body = (
      <EmptyState
        icon="file"
        title={view === 'archive' ? 'Архив пуст' : 'Пока нет постов'}
        description={
          view === 'archive'
            ? 'Здесь будут удалённые посты 30 дней, потом они исчезнут насовсем.'
            : 'Создайте первый пост: черновик сохраняется сам.'
        }
        action={
          view === 'archive' ? undefined : (
            <Button icon="plus" onPress={() => go('posts/new')}>
              Новый пост
            </Button>
          )
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
      <PanelList aria-label="Посты">
        {visible.map((post) => (
          <RowCard
            key={post.id}
            title={titleOf(post)}
            media={<MediaTile src={media(post.id)} size={44} />}
            status={<StatusBadge status={post.state} />}
            meta={
              view === 'archive'
                ? `Удалится через ${post.daysLeft} дн.`
                : post.state === 'scheduled' && post.plannedLabel
                  ? `Отправка ${post.plannedLabel}`
                  : post.edited
            }
            onPress={() => (selecting ? toggle(post.id) : go(`posts/${post.id}`))}
            leading={
              selecting ? (
                <Checkbox
                  aria-label={`Выбрать: ${titleOf(post)}`}
                  isSelected={selectedIds.includes(post.id)}
                  onChange={() => toggle(post.id)}
                />
              ) : undefined
            }
            menu={selecting ? undefined : rowMenu(post)}
          />
        ))}
      </PanelList>
    );
  } else {
    body = (
      <DataTable
        flush
        rowHeight="tall"
        aria-label="Посты"
        columns={columns}
        rows={visible}
        getRowId={(p) => p.id}
        sort={toTableSort(sort)}
        onSortChange={(next) => setSort(fromTableSort(next))}
        selectionMode={selecting ? 'multiple' : 'none'}
        selected={selected}
        onSelectionChange={setSelected}
        onRowAction={selecting ? undefined : (id) => go(`posts/${id}`)}
      />
    );
  }
  function toggle(id: string) {
    const next = new Set(selected === 'all' ? visible.map((p) => p.id) : selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  const stale = search.state === 'stale' && phase === 'ready';
  const footer =
    phase === 'ready' && !emptyData ? (
      <FooterLine
        text={stale ? 'Данные устарели' : `Загружено ${visible.length} из ${rows.length}`}
        action={
          stale ? (
            <Button variant="ghost" size="sm" icon="retry" onPress={() => update({ state: undefined })}>
              Обновить
            </Button>
          ) : visible.length < rows.length ? (
            <Button variant="ghost" size="sm" onPress={() => setShown((value) => value + PAGE)}>
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
        title="Посты"
        actions={
          <Button icon="plus" onPress={() => go('posts/new')}>
            Новый пост
          </Button>
        }
      />
      <Tabs selectedKey={view} onSelectionChange={(key) => setView(String(key))}>
        <TabList aria-label="Разделы постов">
          <Tab id="all">Все</Tab>
          <Tab id="drafts">Черновики</Tab>
          <Tab id="archive">
            Архив <span className="tab-count">{archived.length}</span>
          </Tab>
        </TabList>
      </Tabs>
      <Panel
        title={view === 'archive' ? 'Архив' : view === 'drafts' ? 'Черновики' : 'Все посты'}
        action={
          phase === 'ready' && !emptyData && !selecting ? (
            <>
              {resetAction}
              {selectAction}
            </>
          ) : undefined
        }
        reserveRows={phase === 'ready' && !emptyData ? undefined : narrow ? 6 : 8}
        footer={footer}
      >
        {toolbar}
        {phase === 'ready' && !emptyData ? <AppliedChips chips={narrow ? chips : []} onRemove={removeChip} /> : null}
        {body}
      </Panel>

      <FilterSheet
        isOpen={sheetOpen}
        onOpenChange={setSheetOpen}
        count={(draft.status !== 'all' ? 1 : 0) + (draft.sort !== 'edited-desc' ? 1 : 0)}
        onReset={() => setDraft({ status: 'all', sort: 'edited-desc' })}
        onApply={() => {
          setStatus(draft.status);
          setSort(draft.sort);
          setSheetOpen(false);
        }}
      >
        <Select
          label="Статус"
          options={STATUS_OPTIONS}
          value={draft.status}
          onChange={(value) => setDraft({ ...draft, status: value })}
        />
        <Select
          label="Сортировка"
          options={SORT_OPTIONS}
          value={draft.sort}
          onChange={(value) => setDraft({ ...draft, sort: value })}
        />
      </FilterSheet>

      <ConfirmDialog
        isOpen={confirm !== null}
        onOpenChange={(open) => !open && !pending && setConfirm(null)}
        title={
          confirm && confirm.length > 1
            ? `Удалить посты: ${confirm.length}?`
            : `Удалить «${titleOf(posts.find((p) => p.id === confirm?.[0]) ?? ({ title: '' } as Post))}»?`
        }
        description={
          view === 'archive'
            ? 'Пост исчезнет безвозвратно. Сообщения в Telegram останутся на месте.'
            : 'Пост уйдёт в архив на 30 дней. Сообщения, уже отправленные в Telegram, останутся в каналах.'
        }
        confirmLabel={view === 'archive' ? 'Удалить сейчас' : 'Удалить'}
        isPending={pending}
        onConfirm={() => void doDelete()}
      />
    </div>
  );
}
