import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { mediaLibraryUsageFilterSchema, type MediaLibraryItemDto, type MediaLibraryKind } from '@alexeev/contracts';
import type { z } from 'zod';
import { classifyApiError } from '../../../shared/api/error-kind';
import { PAGE_SIZE } from '../../../shared/api/page-query';
import { useTabSwitch } from '../../../shared/api/use-tab-switch';
import { ApiError } from '../../../shared/api/http-client';
import {
  ActiveFilters,
  Button,
  Checkbox,
  ConfirmDialog,
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
import { mediaPageQueryOptions, useCreatePostWithMedia, usePrefetchMediaTabs } from '../api/media-queries';
import type { DeriveMode, MediaFilters } from '../api/media-api';
import { useLibraryCrop } from '../model/use-library-crop';
import { UPLOAD_ACCEPT, useLibraryUpload, type UploadEntry } from '../model/use-library-upload';
import { useUploadIntake } from '../model/use-upload-intake';
import { AttachDialog } from './AttachDialog';
import { DeleteMediaDialog, type DeleteTarget } from './DeleteMediaDialog';
import { LibraryCropDialog } from './LibraryCropDialog';
import { PhotoViewer } from './PhotoViewer';
import { UploadCard, UploadListRow } from './UploadTiles';
import { formatDate } from './media-format';
import { PrivateMediaPreview } from './PrivateMediaPreview';
import styles from './MediaLibrary.module.css';

type SearchState = {
  kind?: MediaLibraryKind;
  usage?: MediaLibraryUsageFilter;
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
  /** Owner timezone for scheduled times shown in the delete dialog. */
  timezone: string;
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
  onOpen,
  onDelete,
  className
}: {
  item: MediaLibraryItemDto;
  onOpen: () => void;
  onDelete: () => void;
  className?: string;
}) {
  return (
    <span className={className}>
      <Menu
        label={`Действия для ${item.fileName}`}
        items={[
          { id: 'open', label: 'Открыть', icon: 'eye' },
          { id: 'delete', label: 'Удалить', icon: 'trash', tone: 'danger' }
        ]}
        onAction={(id) => {
          if (id === 'open') onOpen();
          if (id === 'delete') onDelete();
        }}
      />
    </span>
  );
}

function MediaCard({
  item,
  selected,
  onToggle,
  onOpen,
  onDelete
}: {
  item: MediaLibraryItemDto;
  selected: boolean;
  onToggle: (checked: boolean) => void;
  onOpen: () => void;
  onDelete: () => void;
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
      <ItemMenu item={item} onOpen={onOpen} onDelete={onDelete} className={styles.cardMenu} />
    </li>
  );
}

function MediaList({
  uploads,
  onRetry,
  onRemoveUpload,
  items,
  selected,
  onToggle,
  onOpen,
  onDelete
}: {
  uploads: UploadEntry[];
  onRetry: (key: string) => void;
  onRemoveUpload: (key: string) => void;
  items: MediaLibraryItemDto[];
  selected: ReadonlySet<string>;
  onToggle: (item: MediaLibraryItemDto, checked: boolean) => void;
  onOpen: (item: MediaLibraryItemDto) => void;
  onDelete: (item: MediaLibraryItemDto) => void;
}) {
  return (
    <ul className={styles.list} aria-label="Файлы медиатеки">
      {uploads.map((entry) => (
        <UploadListRow
          key={entry.key}
          entry={entry}
          onRetry={() => onRetry(entry.key)}
          onRemove={() => onRemoveUpload(entry.key)}
        />
      ))}
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
          <ItemMenu item={item} onOpen={() => onOpen(item)} onDelete={() => onDelete(item)} />
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
  onDelete
}: {
  item: MediaLibraryItemDto;
  onClose: () => void;
  /** Photos of the current page, for the viewer's arrows. */
  photos: MediaLibraryItemDto[];
  onNavigate: (item: MediaLibraryItemDto) => void;
  onAttach: () => void;
  onOpenPost: (postId: string) => void;
  onSaved: (item: MediaLibraryItemDto, mode: DeriveMode) => void;
  onDelete: () => void;
}) {
  const narrow = useMediaQuery('(max-width: 859px)');
  const [viewerId, setViewerId] = useState<string | null>(null);
  const crop = useLibraryCrop(onSaved);
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
            <Button variant="secondary" icon="trash" onPress={onDelete}>
              Удалить
            </Button>
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
          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt>Размер</dt>
              <dd>{formatBytes(item.sizeBytes)}</dd>
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
              <p className={styles.meta}>Файл пока не прикреплён ни к одному посту.</p>
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

export function MediaLibrary({ searchState, onSearchState, onCreatePost, onLogin, onOpenPost, timezone }: Props) {
  const narrow = useMediaQuery('(max-width: 859px)');
  const [searchInput, setSearchInput] = useState(searchState.search ?? '');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [attachOpen, setAttachOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DeleteTarget[] | null>(null);
  const filters: MediaFilters = useMemo(
    () => ({
      kind: searchState.kind ?? 'all',
      usage: searchState.usage ?? 'all',
      ...(searchState.search ? { search: searchState.search } : {})
    }),
    [searchState.kind, searchState.search, searchState.usage]
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
  const upload = useLibraryUpload();
  const fileInput = useRef<HTMLInputElement>(null);
  const dragging = useUploadIntake(upload.add, true);
  const uploadItems = upload.entries;
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
    onSearchState({ search: undefined, usage: undefined, id: undefined });
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
  } else if (
    totalCount === 0 &&
    uploadItems.length === 0 &&
    !filters.search &&
    filters.kind === 'all' &&
    filters.usage === 'all'
  ) {
    body = (
      <EmptyState
        title="Загрузите первые файлы"
        description="JPG, PNG, WebP, GIF или MP4. Можно перетащить файлы на страницу или вставить из буфера."
        action={
          <Button icon="upload" onPress={() => fileInput.current?.click()}>
            Загрузить
          </Button>
        }
      />
    );
  } else if (totalCount === 0 && uploadItems.length === 0) {
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
        {uploadItems.map((entry) => (
          <UploadCard
            key={entry.key}
            entry={entry}
            onRetry={() => upload.retry(entry.key)}
            onRemove={() => upload.remove(entry.key)}
          />
        ))}
        {items.map((item) => (
          <MediaCard
            key={item.id}
            item={item}
            selected={selected.has(item.id)}
            onToggle={(checked) => changeSelected(item, checked)}
            onOpen={() => openDetails(item)}
            onDelete={() => askDelete([item])}
          />
        ))}
      </ul>
    );
  } else {
    body = (
      <MediaList
        uploads={uploadItems}
        onRetry={upload.retry}
        onRemoveUpload={upload.remove}
        items={items}
        selected={selected}
        onToggle={changeSelected}
        onOpen={openDetails}
        onDelete={(item) => askDelete([item])}
      />
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title={ru.pages.media}
        description="Файлы для постов: загрузите их сюда или возьмите из черновиков и истории."
        focusHeadingOnMount
        actions={
          <Button icon="upload" onPress={() => fileInput.current?.click()}>
            Загрузить
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
                {/* One filter row on every screen: the usage choice is a compact select next to the search. */}
                <Select
                  label="Использование"
                  inlineLabel
                  options={USAGE_OPTIONS}
                  value={filters.usage}
                  onChange={(value) => applyUsage(value as MediaLibraryUsageFilter)}
                />
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
              <div className={styles.activeFilters}>
                <ActiveFilters
                  label="Включённые фильтры"
                  resetLabel="Сбросить всё"
                  onResetAll={() => {
                    setSearchInput('');
                    onSearchState({ search: undefined, usage: undefined, id: undefined });
                  }}
                  filters={[
                    ...((searchState.search ?? '') !== ''
                      ? [
                          {
                            id: 'search',
                            label: `Имя: «${searchState.search ?? ''}»`,
                            onRemove: () => {
                              setSearchInput('');
                              onSearchState({ search: undefined });
                            }
                          }
                        ]
                      : []),
                    ...(filters.usage !== 'all'
                      ? [
                          {
                            id: 'usage',
                            label: USAGE_OPTIONS.find((option) => option.id === filters.usage)?.label ?? filters.usage,
                            onRemove: () => applyUsage('all')
                          }
                        ]
                      : [])
                  ]}
                />
              </div>
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
          onDelete={() => askDelete([active])}
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
        timezone={timezone}
        onClose={() => setPendingDelete(null)}
        onDeleted={afterDeleted}
        onOpenPost={onOpenPost}
      />
      <input
        ref={fileInput}
        type="file"
        multiple
        accept={UPLOAD_ACCEPT}
        className={styles.hiddenInput}
        aria-label="Выбрать файлы для загрузки"
        tabIndex={-1}
        onChange={(event) => {
          upload.add([...(event.target.files ?? [])]);
          event.target.value = '';
        }}
      />
      {dragging ? (
        <div className={styles.dropOverlay} aria-hidden="true">
          <span>Отпустите, чтобы загрузить</span>
        </div>
      ) : null}
      <ConfirmDialog
        isOpen={upload.blocker.status === 'blocked'}
        onOpenChange={(open) => {
          if (!open) upload.blocker.reset?.();
        }}
        title="Загрузки прервутся. Уйти?"
        description="Файлы, которые ещё не загрузились, придётся добавить заново."
        confirmLabel="Да"
        cancelLabel="Нет"
        onConfirm={() => upload.blocker.proceed?.()}
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
