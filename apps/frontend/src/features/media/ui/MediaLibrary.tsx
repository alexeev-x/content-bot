import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { mediaLibraryUsageFilterSchema, type MediaLibraryItemDto, type MediaLibraryKind } from '@alexeev/contracts';
import type { z } from 'zod';
import { classifyApiError } from '../../../shared/api/error-kind';
import { ApiError } from '../../../shared/api/http-client';
import {
  Button,
  Checkbox,
  Drawer,
  EmptyState,
  ErrorState,
  Panel,
  PageHeader,
  SearchField,
  SegmentedControl,
  SelectionBar,
  Select,
  Skeleton,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  useMediaQuery,
  useToast
} from '../../../shared/ui';
import { ru } from '../../../shared/lib/ru';
import { pluralRu } from '../../../shared/lib/ru-format';
import { mediaInfiniteQueryOptions, useCreatePostWithMedia } from '../api/media-queries';
import type { MediaFilters } from '../api/media-api';
import { AttachDialog } from './AttachDialog';
import { formatDate } from './media-format';
import { PrivateMediaPreview } from './PrivateMediaPreview';
import styles from './MediaLibrary.module.css';

type SearchState = {
  kind?: MediaLibraryKind;
  usage?: MediaLibraryUsageFilter;
  search?: string;
  view?: 'grid' | 'list';
  id?: string;
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

function MediaCard({
  item,
  selected,
  onToggle,
  onOpen
}: {
  item: MediaLibraryItemDto;
  selected: boolean;
  onToggle: (checked: boolean) => void;
  onOpen: () => void;
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
    </li>
  );
}

function MediaList({
  items,
  selected,
  onToggle,
  onOpen
}: {
  items: MediaLibraryItemDto[];
  selected: ReadonlySet<string>;
  onToggle: (item: MediaLibraryItemDto, checked: boolean) => void;
  onOpen: (item: MediaLibraryItemDto) => void;
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
        </li>
      ))}
    </ul>
  );
}

function MediaSkeleton({ view }: { view: 'grid' | 'list' }) {
  return view === 'grid' ? (
    <ul className={styles.grid} aria-label="Загрузка медиатеки" aria-busy="true">
      {Array.from({ length: 10 }, (_, index) => (
        <li className={styles.card} key={index}>
          <div className={styles.cardButton}>
            <Skeleton height="140px" radius="var(--radius-1)" />
            <Skeleton height={14} width="70%" />
            <Skeleton height={12} width="45%" />
          </div>
        </li>
      ))}
    </ul>
  ) : (
    <div aria-label="Загрузка медиатеки" aria-busy="true">
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton key={index} height={64} />
      ))}
    </div>
  );
}

function Details({
  item,
  onClose,
  onAttach,
  onOpenPost
}: {
  item: MediaLibraryItemDto;
  onClose: () => void;
  onAttach: () => void;
  onOpenPost: (postId: string) => void;
}) {
  const narrow = useMediaQuery('(max-width: 859px)');
  return (
    <Drawer
      variant={narrow ? 'bottom' : 'side'}
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={item.fileName}
      meta={kindLabel(item.kind)}
      footer={
        <Button onPress={onAttach} icon="plus">
          Добавить в пост
        </Button>
      }
    >
      <div className={styles.details}>
        <PrivateMediaPreview mediaId={item.id} kind={item.kind} eager allowRetry />
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
              {item.usages.map((usage) => (
                <li key={usage.postId}>
                  <Button variant="link" onPress={() => onOpenPost(usage.postId)}>
                    {usage.title || 'Без названия'}
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
  );
}

export function MediaLibrary({ searchState, onSearchState, onCreatePost, onLogin, onOpenPost }: Props) {
  const narrow = useMediaQuery('(max-width: 859px)');
  const [searchInput, setSearchInput] = useState(searchState.search ?? '');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [attachOpen, setAttachOpen] = useState(false);
  const filters: MediaFilters = useMemo(
    () => ({
      kind: searchState.kind ?? 'all',
      usage: searchState.usage ?? 'all',
      ...(searchState.search ? { search: searchState.search } : {})
    }),
    [searchState.kind, searchState.search, searchState.usage]
  );
  const query = useInfiniteQuery(mediaInfiniteQueryOptions(filters));
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const active = items.find((item) => item.id === searchState.id);
  // The list is a desktop affordance: phones always get the grid.
  const view = narrow ? 'grid' : (searchState.view ?? 'grid');
  const createPost = useCreatePostWithMedia();
  const toast = useToast();

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
    items.length === 0 &&
    query.data?.pages.length === 1 &&
    query.data.pages[0]?.items.length === 0 &&
    !filters.search &&
    filters.kind === 'all' &&
    filters.usage === 'all'
  ) {
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
  } else if (items.length === 0) {
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
          />
        ))}
      </ul>
    );
  } else {
    body = <MediaList items={items} selected={selected} onToggle={changeSelected} onOpen={openDetails} />;
  }

  return (
    <main className={styles.page}>
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
          {KIND_OPTIONS.map((option) => (
            <TabPanel key={option.id} id={option.id}>
              <Panel
                footer={
                  <div className={styles.footer}>
                    <span>{query.isPending ? 'Загрузка…' : `${items.length} показано`}</span>
                    <output className={styles.status} aria-live="polite" aria-atomic="true">
                      {query.isFetchingNextPage ? 'Загружаем ещё файлы…' : ''}
                    </output>
                    {query.hasNextPage ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onPress={() => void query.fetchNextPage()}
                        isDisabled={query.isFetchingNextPage}
                      >
                        Показать ещё
                      </Button>
                    ) : (
                      <span>Конец списка</span>
                    )}
                  </div>
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
                  </div>
                ) : null}
                <div className={styles.content}>{body}</div>
              </Panel>
            </TabPanel>
          ))}
        </Tabs>
      </div>
      {selected.size ? (
        <SelectionBar label="Выбранные файлы" summary={`Выбрано ${selected.size}`} hint="Добавление не публикует пост.">
          <Button onPress={createPostWithFiles} isLoading={createPost.isPending}>
            Новый пост с этими файлами
          </Button>
          <Button variant="secondary" onPress={() => setAttachOpen(true)} isDisabled={createPost.isPending}>
            Добавить в черновик
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
          onOpenPost={onOpenPost}
          onAttach={() => {
            setSelected((current) => new Set([...current, active.id]));
            closeDetails();
            setAttachOpen(true);
          }}
        />
      ) : null}
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
    </main>
  );
}
