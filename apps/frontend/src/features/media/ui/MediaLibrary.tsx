import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { mediaLibraryUsageFilterSchema, type MediaLibraryItemDto, type MediaLibraryKind } from '@alexeev/contracts';
import type { z } from 'zod';
import { classifyApiError } from '../../../shared/api/error-kind';
import { PAGE_SIZE } from '../../../shared/api/page-query';
import { useTabSwitch } from '../../../shared/api/use-tab-switch';
import { ApiError } from '../../../shared/api/http-client';
import {
  Button,
  Checkbox,
  Drawer,
  EmptyState,
  ErrorState,
  Menu,
  Panel,
  PageHeader,
  Pagination,
  SearchField,
  SegmentedControl,
  SelectionBar,
  Select,
  StaleRegion,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  useMediaQuery,
  useToast
} from '../../../shared/ui';
import { ru } from '../../../shared/lib/ru';
import { pluralRu } from '../../../shared/lib/ru-format';
import {
  mediaPageQueryOptions,
  mediaUsageQueryOptions,
  useCreatePostWithMedia,
  useHideMedia,
  usePrefetchMediaTabs
} from '../api/media-queries';
import type { DeriveMode, MediaFilters } from '../api/media-api';
import { deleteVerdict } from '../model/media-usage';
import { useLibraryCrop } from '../model/use-library-crop';
import { AttachDialog } from './AttachDialog';
import { DeleteMediaDialog, type DeleteTarget } from './DeleteMediaDialog';
import { LibraryCropDialog } from './LibraryCropDialog';
import { PhotoViewer } from './PhotoViewer';
import { formatDate } from './media-format';
import { PrivateMediaPreview } from './PrivateMediaPreview';
import styles from './MediaLibrary.module.css';

type SearchState = {
  kind?: MediaLibraryKind;
  usage?: MediaLibraryUsageFilter;
  hidden?: true;
  search?: string;
  view?: 'grid' | 'list';
  id?: string;
  page?: number;
};
type MediaLibraryUsageFilter = z.infer<typeof mediaLibraryUsageFilterSchema>;
type Props = {
  searchState: SearchState;
  onSearchState: (patch: Partial<SearchState>, options?: { replace?: boolean }) => void;
  onCreatePost: () => void;
  onLogin: () => void;
  onOpenPost: (postId: string) => void;
};
const KIND_OPTIONS = [
  { id: 'all', label: 'Все файлы' },
  { id: 'photo', label: 'Фото' },
  { id: 'video', label: 'Видео' }
] as const;
const USAGE_OPTIONS = [
  { id: 'all', label: 'Все' },
  { id: 'used', label: 'Используются' },
  { id: 'unused', label: 'Не используются' }
] as const;
const VIEW_OPTIONS = [
  { id: 'grid', label: 'Сетка', icon: 'grid' as const },
  { id: 'list', label: 'Список', icon: 'list' as const }
];

function formatBytes(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1_000))} КБ`;
  return `${(bytes / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} МБ`;
}

function kindLabel(kind: MediaLibraryItemDto['kind']): string {
  if (kind === 'video') return 'Видео';
  if (kind === 'animation') return 'GIF';
  return 'Фото';
}

function itemMeta(item: MediaLibraryItemDto): string {
  const dimensions = item.width && item.height ? `${item.width} × ${item.height}` : undefined;
  const duration = item.durationMs ? `${Math.round(item.durationMs / 1000)} сек.` : undefined;
  return [kindLabel(item.kind), dimensions, duration, formatBytes(item.sizeBytes)].filter(Boolean).join(' · ');
}

/** Delete is always offered: the dialog reads where the file is used and explains what will (not) happen. */
function ItemMenu({
  item,
  hiddenView,
  onDelete,
  onHide,
  className
}: {
  item: MediaLibraryItemDto;
  hiddenView: boolean;
  onDelete: () => void;
  onHide: () => void;
  className?: string;
}) {
  return (
    <span className={className}>
      <Menu
        label={`Действия для ${item.fileName}`}
        items={[
          hiddenView ? { id: 'hide', label: 'Вернуть', icon: 'eye' } : { id: 'hide', label: 'Скрыть из медиатеки' },
          { id: 'delete', label: 'Удалить', icon: 'trash', tone: 'danger' }
        ]}
        onAction={(id) => {
          if (id === 'delete') onDelete();
          if (id === 'hide') onHide();
        }}
      />
    </span>
  );
}

/** Filter chip: shows only the files the owner hid. */
function HiddenChip({ active, onChange }: { active: boolean; onChange: (active: boolean) => void }) {
  return (
    <Button
      variant={active ? 'soft' : 'secondary'}
      icon={active ? 'check' : undefined}
      aria-pressed={active}
      onPress={() => onChange(!active)}
    >
      Скрытые
    </Button>
  );
}

function MediaCard({
  item,
  selected,
  onToggle,
  onOpen,
  onDelete,
  onHide,
  hiddenView
}: {
  item: MediaLibraryItemDto;
  selected: boolean;
  onToggle: (checked: boolean) => void;
  onOpen: () => void;
  onDelete: () => void;
  onHide: () => void;
  hiddenView: boolean;
}) {
  return (
    <li className={styles.card} data-selected={selected || undefined}>
      <button type="button" className={styles.cardButton} onClick={onOpen}>
        <PrivateMediaPreview mediaId={item.id} kind={item.kind} />
        <span className={styles.name} title={item.fileName}>
          {item.fileName}
        </span>
        <span className={styles.meta}>{itemMeta(item)}</span>
      </button>
      <span className={styles.check}>
        <Checkbox aria-label={`Выбрать ${item.fileName}`} isSelected={selected} onChange={onToggle} />
      </span>
      <ItemMenu item={item} hiddenView={hiddenView} onDelete={onDelete} onHide={onHide} className={styles.cardMenu} />
    </li>
  );
}

function MediaList({
  items,
  selected,
  onToggle,
  onOpen,
  onDelete,
  onHide,
  hiddenView
}: {
  items: MediaLibraryItemDto[];
  selected: ReadonlySet<string>;
  onToggle: (item: MediaLibraryItemDto, checked: boolean) => void;
  onOpen: (item: MediaLibraryItemDto) => void;
  onDelete: (item: MediaLibraryItemDto) => void;
  onHide: (item: MediaLibraryItemDto) => void;
  hiddenView: boolean;
}) {
  return (
    <ul className={styles.list} aria-label="Файлы медиатеки">
      {items.map((item) => (
        <li key={item.id} className={styles.listRow}>
          <span className={`${styles.preview} ${styles.listPreview}`}>
            <PrivateMediaPreview mediaId={item.id} kind={item.kind} />
          </span>
          <button
            type="button"
            className={styles.cardButton}
            aria-label={`Открыть ${item.fileName}`}
            onClick={() => onOpen(item)}
          >
            <span className={styles.listText}>
              <span className={styles.name} title={item.fileName}>
                {item.fileName}
              </span>
              <span className={styles.meta}>{itemMeta(item)}</span>
            </span>
          </button>
          <span className={styles.listUsage}>
            {item.usageCount
              ? `В ${item.usageCount} ${pluralRu(item.usageCount, 'посте', 'постах', 'постах')}`
              : 'Не используется'}
          </span>
          <Checkbox
            aria-label={`Выбрать ${item.fileName}`}
            isSelected={selected.has(item.id)}
            onChange={(checked) => onToggle(item, checked)}
          />
          <ItemMenu item={item} hiddenView={hiddenView} onDelete={() => onDelete(item)} onHide={() => onHide(item)} />
        </li>
      ))}
    </ul>
  );
}

/** The same markup and classes as the loaded cards and rows, so the swap moves nothing. */
function MediaSkeleton({ view }: { view: 'grid' | 'list' }) {
  const rows = Array.from({ length: PAGE_SIZE }, (_, index) => index);
  return view === 'grid' ? (
    <ul className={styles.grid} aria-label="Загрузка медиатеки" aria-busy="true">
      {rows.map((index) => (
        <li className={styles.card} key={index}>
          <div className={styles.cardButton}>
            <span className={`${styles.preview} ${styles.skeletonBlock}`} aria-hidden="true" />
            <span className={`${styles.name} ${styles.skeletonText}`} aria-hidden="true">
               
            </span>
            <span className={`${styles.meta} ${styles.skeletonText}`} aria-hidden="true">
               
            </span>
          </div>
        </li>
      ))}
    </ul>
  ) : (
    <ul className={styles.list} aria-label="Загрузка медиатеки" aria-busy="true">
      {rows.map((index) => (
        <li className={styles.listRow} key={index}>
          <span className={`${styles.preview} ${styles.listPreview} ${styles.skeletonBlock}`} aria-hidden="true" />
          <span className={styles.listText}>
            <span className={`${styles.name} ${styles.skeletonText}`} aria-hidden="true">
               
            </span>
            <span className={`${styles.meta} ${styles.skeletonText}`} aria-hidden="true">
               
            </span>
          </span>
          <span className={`${styles.listUsage} ${styles.skeletonText}`} aria-hidden="true">
             
          </span>
          <span className={styles.listCheck} />
          <span className={styles.listCheck} />
        </li>
      ))}
    </ul>
  );
}

function Details({
  item,
  onClose,
  photos,
  onNavigate,
  onAttach,
  onOpenPost,
  onSaved,
  hiddenView,
  onDelete,
  onHide
}: {
  item: MediaLibraryItemDto;
  onClose: () => void;
  /** Photos of the current page, for the viewer's arrows. */
  photos: MediaLibraryItemDto[];
  onNavigate: (item: MediaLibraryItemDto) => void;
  onAttach: () => void;
  onOpenPost: (postId: string) => void;
  onSaved: (item: MediaLibraryItemDto, mode: DeriveMode) => void;
  hiddenView: boolean;
  onDelete: () => void;
  onHide: () => void;
}) {
  const narrow = useMediaQuery('(max-width: 859px)');
  const [viewerId, setViewerId] = useState<string | null>(null);
  const crop = useLibraryCrop(onSaved);
  const usage = useQuery(mediaUsageQueryOptions(item.id));
  const verdict = usage.data ? deleteVerdict(usage.data) : undefined;
  const blockedReasons = verdict?.kind === 'blocked' ? verdict.reasons : [];
  const blockedPosts = usage.data ? [...usage.data.published, ...usage.data.approved] : [];
  const croppable = item.kind === 'photo' || item.kind === 'video';
  return (
    <>
      <Drawer
        variant={narrow ? 'bottom' : 'side'}
        isOpen
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title={item.fileName}
        meta={kindLabel(item.kind)}
        footer={
          <>
            <Button onPress={onAttach} icon="plus">
              Добавить в пост
            </Button>
            {croppable ? (
              <Button variant="secondary" icon="crop" onPress={() => crop.open(item)}>
                Кадрировать
              </Button>
            ) : null}
            <span title={blockedReasons.length ? blockedReasons.join('. ') : undefined}>
              <Button
                variant="secondary"
                icon="trash"
                isDisabled={verdict === undefined || verdict.kind === 'blocked'}
                aria-describedby={blockedReasons.length ? 'media-delete-reason' : undefined}
                onPress={onDelete}
              >
                Удалить
              </Button>
            </span>
            {verdict?.kind === 'blocked' || hiddenView ? (
              <Button variant="secondary" onPress={onHide}>
                {hiddenView ? 'Вернуть' : 'Скрыть из медиатеки'}
              </Button>
            ) : null}
          </>
        }
      >
        <div className={styles.details}>
          <PrivateMediaPreview mediaId={item.id} kind={item.kind} eager allowRetry />
          {item.kind === 'photo' ? (
            <Button variant="secondary" icon="maximize" onPress={() => setViewerId(item.id)}>
              На весь экран
            </Button>
          ) : null}
          {usage.isError ? (
            <p className={styles.meta} role="alert">
              Не удалось проверить, где используется файл. Удаление недоступно.{' '}
              <Button variant="link" onPress={() => void usage.refetch()}>
                Повторить
              </Button>
            </p>
          ) : null}
          {blockedReasons.length ? (
            <section className={styles.usage} aria-labelledby="media-delete-reason-title">
              <h3 id="media-delete-reason-title">Почему нельзя удалить</h3>
              <ul id="media-delete-reason">
                {blockedReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <ul>
                {blockedPosts.map((post) => (
                  <li key={post.postId}>
                    <Button variant="link" onPress={() => onOpenPost(post.postId)}>
                      {`Открыть пост «${post.title || 'Без названия'}»`}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt>Размер</dt>
              <dd>{formatBytes(item.sizeBytes)}</dd>
            </div>
            <div className={styles.fact}>
              <dt>Формат</dt>
              <dd>{item.contentType}</dd>
            </div>
            <div className={styles.fact}>
              <dt>Размер изображения</dt>
              <dd>{item.width && item.height ? `${item.width} × ${item.height}` : '—'}</dd>
            </div>
            <div className={styles.fact}>
              <dt>Добавлен</dt>
              <dd>{formatDate(item.createdAt)}</dd>
            </div>
            <div className={styles.fact}>
              <dt>Совпадения по содержимому</dt>
              <dd>{item.duplicateCount}</dd>
            </div>
            <div className={styles.fact}>
              <dt>Используется в постах</dt>
              <dd>{item.usageCount}</dd>
            </div>
          </dl>
          <section className={styles.usage} aria-labelledby="media-usage-title">
            <h3 id="media-usage-title">Текущие посты</h3>
            {item.usages.length ? (
              <ul>
                {item.usages.map((holder) => (
                  <li key={holder.postId}>
                    <Button variant="link" onPress={() => onOpenPost(holder.postId)}>
                      {holder.title || 'Без названия'}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.meta}>Нет текущих постов. Файл может храниться в истории черновика.</p>
            )}
            {item.usageCount > item.usages.length ? (
              <p className={styles.meta}>
                Показаны последние {item.usages.length} из {item.usageCount}.
              </p>
            ) : null}
          </section>
        </div>
      </Drawer>
      <PhotoViewer
        photos={photos}
        openId={viewerId}
        onChange={(id) => {
          setViewerId(id);
          const next = photos.find((photo) => photo.id === id);
          if (next) onNavigate(next);
        }}
        onClose={() => setViewerId(null)}
      />
      <LibraryCropDialog crop={crop} />
    </>
  );
}

export function MediaLibrary({ searchState, onSearchState, onCreatePost, onLogin, onOpenPost }: Props) {
  const narrow = useMediaQuery('(max-width: 859px)');
  const [searchInput, setSearchInput] = useState(searchState.search ?? '');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [attachOpen, setAttachOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DeleteTarget[] | null>(null);
  const filters: MediaFilters = useMemo(
    () => ({
      kind: searchState.kind ?? 'all',
      usage: searchState.usage ?? 'all',
      ...(searchState.hidden ? { hidden: true as const } : {}),
      ...(searchState.search ? { search: searchState.search } : {})
    }),
    [searchState.hidden, searchState.kind, searchState.search, searchState.usage]
  );
  const page = searchState.page ?? 1;
  const query = useQuery(mediaPageQueryOptions(filters, page));
  usePrefetchMediaTabs(KIND_OPTIONS.map((option) => ({ ...filters, kind: option.id })));
  const { switching } = useTabSwitch(filters.kind, query.isPlaceholderData);
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const totalCount = query.data?.totalCount ?? 0;
  const lastPage = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  // A page emptied by deletions falls back to the new last page.
  useEffect(() => {
    if (!query.isPlaceholderData && !query.isPending && !query.isError && page > lastPage) {
      onSearchState({ page: lastPage > 1 ? lastPage : undefined }, { replace: true });
    }
  }, [lastPage, onSearchState, page, query.isError, query.isPending, query.isPlaceholderData]);
  const isSearchSettling =
    searchInput.trim() !== (searchState.search ?? '') || (query.isPlaceholderData && query.isFetching);
  const active = items.find((item) => item.id === searchState.id);
  // The list is a desktop affordance: phones always get the grid.
  const view = narrow ? 'grid' : (searchState.view ?? 'grid');
  const createPost = useCreatePostWithMedia();
  const toast = useToast();
  const hideMedia = useHideMedia();
  const hiddenView = filters.hidden === true;
  const hideItem = (item: MediaLibraryItemDto) =>
    hideMedia.mutate(
      { id: item.id, hidden: !hiddenView },
      {
        onSuccess: () => {
          setSelected((current) => new Set([...current].filter((id) => id !== item.id)));
          if (active?.id === item.id) closeDetails();
          toast.show({
            title: hiddenView ? 'Файл возвращён в медиатеку' : 'Файл скрыт из медиатеки',
            description: `«${item.fileName}»`,
            tone: 'success'
          });
        },
        onError: (error) =>
          toast.show({
            title: hiddenView ? 'Не удалось вернуть файл' : 'Не удалось скрыть файл',
            description: error instanceof ApiError && error.requestId ? `Запрос ${error.requestId}` : undefined,
            tone: 'error'
          })
      }
    );
  const askDelete = (targets: MediaLibraryItemDto[]) =>
    setPendingDelete(targets.map(({ id, fileName }) => ({ id, fileName })));
  const afterDeleted = (ids: string[]) => {
    setSelected((current) => new Set([...current].filter((id) => !ids.includes(id))));
    if (active !== undefined && ids.includes(active.id)) closeDetails();
  };

  // Route search is external history state: sync Back/Forward without discarding local keystrokes.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => setSearchInput(searchState.search ?? ''), [searchState.search]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const normalized = searchInput.trim();
      if (normalized !== (searchState.search ?? ''))
        onSearchState({ search: normalized || undefined, id: undefined }, { replace: true });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput, searchState.search, onSearchState]);

  const errorKind = query.error ? classifyApiError(query.error) : undefined;
  const forbidden = errorKind === 'forbidden';
  const unauthorized = errorKind === 'unauthorized';
  const resetFilters = () => {
    setSearchInput('');
    onSearchState({ search: undefined, usage: undefined, hidden: undefined, id: undefined });
  };
  const changeSelected = (item: MediaLibraryItemDto, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(item.id);
      else next.delete(item.id);
      return next;
    });
  };
  const applyUsage = (usage: MediaLibraryUsageFilter) => {
    onSearchState({ usage: usage === 'all' ? undefined : usage, id: undefined });
  };
  const applyHidden = (next: boolean) => onSearchState({ hidden: next ? true : undefined, id: undefined });
  const closeDetails = () => onSearchState({ id: undefined });
  const openDetails = (item: MediaLibraryItemDto) => onSearchState({ id: item.id });
  const createPostWithFiles = () =>
    createPost.mutate([...selected], {
      onSuccess: onOpenPost,
      onError: (error) =>
        toast.show({
          title: 'Не удалось создать пост с файлами',
          description: error instanceof ApiError && error.requestId ? `Запрос ${error.requestId}` : 'Выбор сохранён.',
          tone: 'error'
        })
    });
  const retry = () => void query.refetch();
  const getError = () => (query.error instanceof ApiError ? query.error : undefined);

  let body;
  if (query.isPending) {
    body = <MediaSkeleton view={view} />;
  } else if (unauthorized) {
    body = (
      <EmptyState
        title="Сеанс завершён"
        description="Войдите снова, чтобы открыть личную медиатеку."
        action={
          <Button variant="secondary" onPress={onLogin}>
            Перейти ко входу
          </Button>
        }
      />
    );
  } else if (forbidden) {
    body = <EmptyState title="Нет доступа" description="Медиатека доступна только владельцу." />;
  } else if (query.isError) {
    body = (
      <ErrorState
        message="Не удалось загрузить медиатеку. Файлы не изменены."
        requestId={getError()?.requestId}
        onRetry={retry}
      />
    );
  } else if (totalCount === 0 && !filters.search && filters.kind === 'all' && filters.usage === 'all' && !hiddenView) {
    body = (
      <EmptyState
        title="Файлов пока нет"
        description="Загрузить файл можно в редакторе нового поста."
        action={
          <Button variant="secondary" onPress={onCreatePost}>
            Создать пост
          </Button>
        }
      />
    );
  } else if (totalCount === 0) {
    body = (
      <EmptyState
        title="Ничего не найдено"
        description="Измените поиск или фильтры."
        action={
          <Button variant="secondary" onPress={resetFilters}>
            Сбросить фильтры
          </Button>
        }
      />
    );
  } else if (view === 'grid') {
    body = (
      <ul className={styles.grid} aria-label="Файлы медиатеки">
        {items.map((item) => (
          <MediaCard
            key={item.id}
            item={item}
            selected={selected.has(item.id)}
            onToggle={(checked) => changeSelected(item, checked)}
            onOpen={() => openDetails(item)}
            onDelete={() => askDelete([item])}
            onHide={() => hideItem(item)}
            hiddenView={hiddenView}
          />
        ))}
      </ul>
    );
  } else {
    body = (
      <MediaList
        items={items}
        selected={selected}
        onToggle={changeSelected}
        onOpen={openDetails}
        onDelete={(item) => askDelete([item])}
        onHide={hideItem}
        hiddenView={hiddenView}
      />
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title={ru.pages.media}
        description="Сохранённые файлы из черновиков и истории постов."
        focusHeadingOnMount
        actions={
          <Button icon="plus" onPress={onCreatePost}>
            Создать пост
          </Button>
        }
      />
      <div className={styles.tabs}>
        <Tabs
          selectedKey={filters.kind}
          onSelectionChange={(key) =>
            onSearchState({
              kind: String(key) === 'all' ? undefined : (String(key) as MediaLibraryKind),
              id: undefined
            })
          }
        >
          <TabList aria-label="Тип медиа">
            {KIND_OPTIONS.map((option) => (
              <Tab key={option.id} id={option.id}>
                {option.label}
              </Tab>
            ))}
          </TabList>
          {/* One panel for every tab: the grid stays mounted across a switch instead of blinking. */}
          <TabPanel id={filters.kind}>
            <Panel
              footer={
                query.isPending ? (
                  <Pagination page={1} pageSize={PAGE_SIZE} totalCount={0} onPageChange={() => {}} isLoading />
                ) : (
                  <Pagination
                    page={page}
                    pageSize={PAGE_SIZE}
                    totalCount={totalCount}
                    onPageChange={(next) => {
                      setSelected(new Set());
                      onSearchState({ page: next > 1 ? next : undefined, id: undefined }, { replace: true });
                    }}
                    isSearching={isSearchSettling}
                  />
                )
              }
            >
              <div className={styles.toolbar}>
                <div className={styles.search}>
                  <SearchField
                    label="Поиск по имени файла"
                    placeholder="Имя файла"
                    value={searchInput}
                    onChange={setSearchInput}
                  />
                </div>
                {narrow ? null : (
                  <Select
                    label="Использование"
                    inlineLabel
                    options={USAGE_OPTIONS}
                    value={filters.usage}
                    onChange={(value) => applyUsage(value as MediaLibraryUsageFilter)}
                  />
                )}
                {narrow ? null : <HiddenChip active={hiddenView} onChange={applyHidden} />}
                {narrow ? null : (
                  <div className={styles.toolbarEnd}>
                    <SegmentedControl
                      label="Вид файлов"
                      options={VIEW_OPTIONS}
                      value={view}
                      onChange={(value) => onSearchState({ view: value === 'grid' ? undefined : 'list' })}
                    />
                  </div>
                )}
              </div>
              {narrow ? (
                <div className={styles.chips}>
                  <SegmentedControl
                    label="Использование"
                    options={USAGE_OPTIONS}
                    value={filters.usage}
                    onChange={(value) => applyUsage(value as MediaLibraryUsageFilter)}
                    fullWidth
                  />
                  <HiddenChip active={hiddenView} onChange={applyHidden} />
                </div>
              ) : null}
              <div className={styles.content}>
                <StaleRegion busy={switching}>{body}</StaleRegion>
              </div>
            </Panel>
          </TabPanel>
        </Tabs>
      </div>
      {selected.size ? (
        <SelectionBar
          label="Выбранные файлы"
          summary={`Выбрано ${selected.size}`}
          hint="Добавление не публикует пост. Перед удалением покажем, что будет с постами."
        >
          <Button onPress={createPostWithFiles} isLoading={createPost.isPending}>
            Новый пост с этими файлами
          </Button>
          <Button variant="secondary" onPress={() => setAttachOpen(true)} isDisabled={createPost.isPending}>
            Добавить в черновик
          </Button>
          <Button
            variant="secondary"
            icon="trash"
            onPress={() => askDelete(items.filter((item) => selected.has(item.id)))}
          >
            {`Удалить (${selected.size})`}
          </Button>
          <Button variant="secondary" onPress={() => setSelected(new Set())}>
            Снять выбор
          </Button>
        </SelectionBar>
      ) : null}
      {active ? (
        <Details
          item={active}
          onClose={closeDetails}
          photos={items.filter((candidate) => candidate.kind === 'photo')}
          onNavigate={openDetails}
          hiddenView={hiddenView}
          onDelete={() => askDelete([active])}
          onHide={() => hideItem(active)}
          onSaved={(created, mode) => {
            toast.show({
              title: mode === 'replace' ? 'Файл заменён в черновиках' : 'Сохранено как новый файл',
              tone: 'success'
            });
            // The list refetches; the new item opens once it arrives.
            onSearchState({ id: created.id, page: undefined });
          }}
          onOpenPost={onOpenPost}
          onAttach={() => {
            setSelected((current) => new Set([...current, active.id]));
            closeDetails();
            setAttachOpen(true);
          }}
        />
      ) : null}
      <DeleteMediaDialog
        targets={pendingDelete}
        inHiddenView={hiddenView}
        onClose={() => setPendingDelete(null)}
        onDeleted={afterDeleted}
      />
      {attachOpen ? (
        <AttachDialog
          open
          onOpenChange={setAttachOpen}
          mediaIds={[...selected]}
          onAttached={() => setSelected(new Set())}
          onCreatePost={onCreatePost}
          onLogin={onLogin}
        />
      ) : null}
    </div>
  );
}
