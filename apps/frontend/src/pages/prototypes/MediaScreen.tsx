/* oxlint-disable react/set-state-in-effect, jsx-a11y/prefer-tag-over-role -- dev-only prototype: resets the fake upload on close; the bar is a styled progressbar */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Checkbox,
  ColumnFilter,
  ConfirmDialog,
  DataTable,
  Dialog,
  Drawer,
  EmptyState,
  ErrorState,
  Icon,
  Menu,
  Panel,
  PanelList,
  Radio,
  RadioGroup,
  RowCard,
  SearchField,
  SegmentedControl,
  SelectionBar,
  Select,
  Skeleton,
  Tab,
  TabList,
  Tabs,
  TextField,
  useToast,
  VisuallyHidden,
  type DataColumn,
  type TableSort
} from '../../shared/ui';
import { NOW, formatDateTime } from './data';
import { KIND_LABEL, MEDIA_ITEMS, formatSize, type MediaItem, type MediaKind } from './preview-data';
import { DemoChip, Pill, PreviewPage, Tag, Thumb, usePreviewToast } from './preview-kit';
import { AppliedChips, FilterButton, FilterSheet, FooterLine, PhoneSkeletonRows, type Chip } from './parts';
import { useNarrow, useProtoNavigate, useProtoSearch, useProtoSearchUpdate, useScreenPhase } from './proto-kit';
import { useProtoStore } from './proto-store';
import styles from './Media.module.css';
import kit from './Preview.module.css';

type Tab = 'all' | MediaKind;
const TABS: ReadonlyArray<{ id: Tab; label: string; short: string }> = [
  { id: 'all', label: 'Все', short: 'Все' },
  { id: 'image', label: 'Изображения', short: 'Фото' },
  { id: 'gif', label: 'GIF', short: 'GIF' },
  { id: 'video', label: 'Видео', short: 'Видео' },
  { id: 'doc', label: 'Документы', short: 'Файлы' }
];
const USAGE = [
  { id: 'all', label: 'Все' },
  { id: 'used', label: 'Используется' },
  { id: 'unused', label: 'Не используется' }
];
const SORTS = [
  { id: 'new', label: 'Сначала новые' },
  { id: 'old', label: 'Сначала старые' },
  { id: 'name', label: 'По названию' },
  { id: 'size', label: 'По размеру' }
];
const dims = (item: MediaItem) => (item.width ? `${item.width} × ${item.height}` : formatSize(item.size));
const meta = (item: MediaItem) => (item.width ? `${dims(item)} · ${formatSize(item.size)}` : formatSize(item.size));
const thumbLabel = (item: MediaItem) => (item.kind === 'video' ? '▶' : item.ext);

function Unavailable() {
  return (
    <Pill group="failed" icon="x-circle">
      Файл недоступен
    </Pill>
  );
}

type CardProps = {
  item: MediaItem;
  selected: boolean;
  selecting: boolean;
  active: boolean;
  onOpen: () => void;
  onToggle: (on: boolean) => void;
};

function MediaCard({ item, selected, selecting, active, onOpen, onToggle }: CardProps) {
  return (
    <li
      className={styles.card}
      data-selected={selected || undefined}
      data-active={active || undefined}
      data-selecting={selecting || undefined}
    >
      <button type="button" className={styles.cardMain} onClick={selecting ? () => onToggle(!selected) : onOpen}>
        <span className={styles.cardThumb}>
          <Thumb seed={item.name} fill broken={item.unavailable} label={thumbLabel(item)} />
        </span>
        <span className={styles.cardName} title={item.name}>
          {item.name}
        </span>
        <span className={styles.cardMeta}>
          {item.unavailable ? <Unavailable /> : <span className={kit.muted}>{meta(item)}</span>}
        </span>
      </button>
      <span className={styles.cardCheck}>
        <Checkbox
          aria-label={`Выбрать ${item.name}`}
          isSelected={selected}
          isDisabled={item.unavailable}
          onChange={onToggle}
        />
      </span>
      <span className={styles.cardBadge}>
        <Tag>{item.kind === 'gif' ? 'GIF' : item.ext.toUpperCase()}</Tag>
      </span>
    </li>
  );
}

function SkeletonGrid({ count }: { count: number }) {
  return (
    <ul className={styles.grid} aria-busy="true" aria-label="Загрузка файлов">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className={styles.card}>
          <span className={styles.cardMain}>
            <span className={styles.cardThumb}>
              <Skeleton height="100%" radius="var(--radius-1)" />
            </span>
            <Skeleton height={14} width="70%" />
            <Skeleton height={12} width="50%" />
          </span>
        </li>
      ))}
    </ul>
  );
}

type UploadFile = { name: string; pct: number; failed: boolean };
const UPLOAD_FILES: UploadFile[] = [
  { name: 'cover-novosti-2.jpg', pct: 0, failed: false },
  { name: 'klip-final.mp4', pct: 0, failed: false },
  { name: 'tablitsa.pdf', pct: 0, failed: false }
];

function UploadDialog({
  isOpen,
  onOpenChange,
  forceDrag
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  forceDrag: boolean;
}) {
  const [files, setFiles] = useState<UploadFile[] | null>(null);
  const [drag, setDrag] = useState(false);
  const preview = usePreviewToast();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  useEffect(() => {
    if (!isOpen) {
      setFiles(null);
      stop();
    }
  }, [isOpen]);
  const start = () => {
    setDrag(false);
    setFiles(UPLOAD_FILES);
    stop();
    timer.current = setInterval(() => {
      setFiles((current) =>
        (current ?? []).map((file, index) => {
          if (file.failed || file.pct >= 100) return file;
          const next = Math.min(100, file.pct + (index === 0 ? 34 : 18));
          // The second file always fails halfway: the per-file error state with «Повторить».
          return index === 1 && next >= 60 ? { ...file, pct: 62, failed: true } : { ...file, pct: next };
        })
      );
    }, 300);
  };
  const running = files?.some((file) => !file.failed && file.pct < 100) ?? false;
  useEffect(() => {
    if (files && !running) stop();
  }, [files, running]);
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Загрузить файлы"
      description="Превью: файлы никуда не отправляются, показан только ход загрузки."
      footer={
        <>
          <Button variant="secondary" onPress={() => onOpenChange(false)}>
            Закрыть
          </Button>
          <Button
            isDisabled={!files || running}
            onPress={() => {
              onOpenChange(false);
              preview();
            }}
          >
            Готово
          </Button>
        </>
      }
    >
      {files ? (
        <ul className={styles.uploads} aria-label="Ход загрузки">
          {files.map((file, index) => (
            <li key={file.name} className={styles.upload}>
              <div className={styles.uploadTop}>
                <span className={styles.cardName} title={file.name}>
                  {file.name}
                </span>
                {file.failed ? (
                  <Pill group="failed" icon="x-circle">
                    Не загружен
                  </Pill>
                ) : file.pct >= 100 ? (
                  <Pill group="done" icon="check-circle">
                    Готово
                  </Pill>
                ) : (
                  <span className={`${kit.mono} ${kit.muted}`}>{file.pct}%</span>
                )}
              </div>
              <div
                className={styles.bar}
                data-failed={file.failed || undefined}
                role="progressbar"
                aria-label={`Загрузка ${file.name}`}
                aria-valuenow={file.pct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: `${file.pct}%` }} />
              </div>
              {file.failed ? (
                <div className={kit.inlineRow}>
                  <span className={styles.failText}>Соединение прервалось. Файл не сохранён.</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="retry"
                    onPress={() => {
                      setFiles((current) =>
                        (current ?? []).map((f, i) => (i === index ? { ...f, pct: 100, failed: false } : f))
                      );
                    }}
                  >
                    Повторить
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div
          className={styles.drop}
          data-drag={drag || forceDrag || undefined}
          onDragEnter={(event) => {
            event.preventDefault();
            setDrag(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDrag(false)}
          onDrop={(event) => {
            event.preventDefault();
            start();
          }}
        >
          <Icon name="upload" size={28} />
          <strong>{drag || forceDrag ? 'Отпустите, чтобы загрузить' : 'Перетащите файлы сюда'}</strong>
          <span className={kit.muted}>JPG, PNG, GIF, MP4, PDF · до 50 МБ</span>
          <Button variant="secondary" onPress={start}>
            Выбрать файлы
          </Button>
        </div>
      )}
    </Dialog>
  );
}

function Inspector({ item, onClose, onInsert }: { item: MediaItem; onClose: () => void; onInsert: () => void }) {
  const narrow = useNarrow();
  const preview = usePreviewToast();
  const go = useProtoNavigate();
  const [tags, setTags] = useState(item.tags);
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const uses = item.usedIn.length;
  const addTag = () => {
    const next = draft.trim().toLowerCase();
    if (next && !tags.includes(next)) setTags([...tags, next]);
    setDraft('');
  };
  return (
    <>
      <Drawer
        variant={narrow ? 'bottom' : 'side'}
        isOpen
        onOpenChange={(open) => !open && onClose()}
        title={item.name}
        meta={item.unavailable ? <Unavailable /> : <Tag>{KIND_LABEL[item.kind]}</Tag>}
        footer={
          item.unavailable ? (
            <Button variant="danger" icon="trash" onPress={() => setConfirmDelete(true)}>
              Удалить
            </Button>
          ) : (
            <div className={kit.footerRow}>
              <Button onPress={onInsert} icon="plus">
                Вставить в пост
              </Button>
              <Button variant="secondary" icon="copy" onPress={() => preview()}>
                Копировать ссылку
              </Button>
              <Button variant="secondary" icon="download" onPress={() => preview()}>
                Скачать
              </Button>
              <Button variant="danger" icon="trash" onPress={() => setConfirmDelete(true)}>
                Удалить
              </Button>
            </div>
          )
        }
      >
        <div className={kit.stack}>
          <div className={styles.preview}>
            <Thumb seed={item.name} fill broken={item.unavailable} label={thumbLabel(item)} />
          </div>
          {item.unavailable ? (
            <p className={styles.failText}>
              Файл удалён из хранилища или недоступен. Его можно только удалить из библиотеки.
            </p>
          ) : null}
          <dl className={kit.facts}>
            <div className={kit.fact}>
              <dt>Тип</dt>
              <dd>
                {KIND_LABEL[item.kind]}, {item.ext.toUpperCase()}
              </dd>
            </div>
            <div className={kit.fact}>
              <dt>Размер</dt>
              <dd>{formatSize(item.size)}</dd>
            </div>
            {item.width ? (
              <div className={kit.fact}>
                <dt>Разрешение</dt>
                <dd>{dims(item)}</dd>
              </div>
            ) : null}
            <div className={kit.fact}>
              <dt>Загружен</dt>
              <dd>{formatDateTime(item.uploadedAt)}</dd>
            </div>
          </dl>
          <section className={kit.stack} aria-label="Теги">
            <h3 className={kit.sectionTitle}>Теги</h3>
            <ul className={kit.chipRow}>
              {tags.map((tag) => (
                <li key={tag} style={{ listStyle: 'none' }}>
                  <button
                    type="button"
                    className={kit.removable}
                    onClick={() => setTags(tags.filter((t) => t !== tag))}
                  >
                    {tag}
                    <Icon name="x" size={14} />
                    <VisuallyHidden>, убрать</VisuallyHidden>
                  </button>
                </li>
              ))}
            </ul>
            <div className={styles.tagAdd}>
              <TextField
                label="Новый тег"
                placeholder="Например, финал"
                value={draft}
                onChange={setDraft}
                onKeyDown={(event) => event.key === 'Enter' && addTag()}
              />
              <Button variant="secondary" size="field" onPress={addTag}>
                Добавить
              </Button>
            </div>
          </section>
          {item.description ? (
            <section className={kit.stack}>
              <h3 className={kit.sectionTitle}>Описание</h3>
              <p className={kit.muted} style={{ margin: 0 }}>
                {item.description}
              </p>
            </section>
          ) : null}
          <section className={kit.stack} aria-label="Где используется">
            <h3 className={kit.sectionTitle}>Используется в ({uses})</h3>
            {uses === 0 ? (
              <p className={kit.muted} style={{ margin: 0 }}>
                Пока не используется ни в одном посте.
              </p>
            ) : (
              <ul className={styles.usedList}>
                {item.usedIn.map((title) => (
                  <li key={title}>
                    <button type="button" className={styles.linkButton} onClick={() => go('posts')}>
                      {title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </Drawer>
      <ConfirmDialog
        isOpen={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Удалить файл «${item.name}»?`}
        description={
          uses > 0
            ? `Он используется в ${uses} ${uses === 1 ? 'посте' : 'постах'}: там файл пропадёт.`
            : 'Файл не используется в постах. Вернуть его будет нельзя.'
        }
        confirmLabel="Удалить файл"
        cancelLabel="Не удалять"
        onConfirm={() => {
          setConfirmDelete(false);
          preview();
        }}
      />
    </>
  );
}

function PostPicker({
  isOpen,
  onOpenChange,
  count
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
}) {
  const { posts } = useProtoStore();
  const toast = useToast();
  const go = useProtoNavigate();
  const drafts = posts.filter((post) => post.state === 'draft').slice(0, 3);
  const [postId, setPostId] = useState<string>('');
  const chosen = postId || drafts[0]?.id || '';
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Выберите пост"
      description={`${count === 1 ? 'Файл добавится' : `Файлов: ${count}. Они добавятся`} в черновик. Опубликованные посты не меняются.`}
      footer={
        <>
          <Button variant="secondary" onPress={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            isDisabled={!chosen}
            onPress={() => {
              onOpenChange(false);
              toast.show({
                title: 'Превью: файл добавлен в пост',
                tone: 'success',
                action: { label: 'Открыть пост', onPress: () => go(`posts/${chosen}`) },
                timeout: 8000
              });
            }}
          >
            Добавить в пост
          </Button>
        </>
      }
    >
      <RadioGroup label="Черновики" value={chosen} onChange={setPostId}>
        {drafts.map((post) => (
          <Radio key={post.id} value={post.id}>
            {post.title}
          </Radio>
        ))}
      </RadioGroup>
    </Dialog>
  );
}

/** The editor's «Выбрать из медиатеки»: the same library in selection mode with a counted footer action. */
function SelectionSheet({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  const narrow = useNarrow();
  const toast = useToast();
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState('');
  const pool = MEDIA_ITEMS.filter(
    (item) => !item.unavailable && item.kind !== 'doc' && item.name.includes(query.trim().toLowerCase())
  );
  return (
    <Drawer
      variant={narrow ? 'bottom' : 'side'}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Выбрать из медиатеки"
      footer={
        <>
          <Button variant="secondary" onPress={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            isDisabled={chosen.size === 0}
            onPress={() => {
              onOpenChange(false);
              toast.show({ title: 'Превью: файлы добавлены в пост', tone: 'info' });
            }}
          >
            Добавить ({chosen.size})
          </Button>
        </>
      }
    >
      <div className={kit.stack}>
        <SearchField label="Поиск файлов" placeholder="Поиск по названию" value={query} onChange={setQuery} />
        <ul className={styles.sheetGrid}>
          {pool.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              selected={chosen.has(item.id)}
              selecting
              active={false}
              onOpen={() => undefined}
              onToggle={(on) => {
                const next = new Set(chosen);
                if (on) next.add(item.id);
                else next.delete(item.id);
                setChosen(next);
              }}
            />
          ))}
        </ul>
      </div>
    </Drawer>
  );
}

export function MediaScreen() {
  const narrow = useNarrow();
  const { phase, retry } = useScreenPhase();
  const search = useProtoSearch();
  const update = useProtoSearchUpdate();
  const tab: Tab = TABS.find((entry) => entry.id === search.view)?.id ?? 'all';
  const mode = search.mode === 'list' ? 'list' : 'grid';
  const [query, setQuery] = useState('');
  const [usage, setUsage] = useState('all');
  const [sort, setSort] = useState('new');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(search.state === 'upload' || search.state === 'upload-drag');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerFor, setPickerFor] = useState(1);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState({ usage: 'all', sort: 'new' });
  const [selectOpen, setSelectOpen] = useState(search.state === 'select');

  const counts = useMemo(() => {
    const result: Record<Tab, number> = { all: MEDIA_ITEMS.length, image: 0, gif: 0, video: 0, doc: 0 };
    for (const item of MEDIA_ITEMS) result[item.kind] += 1;
    return result;
  }, []);
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return MEDIA_ITEMS.filter(
      (item) =>
        (tab === 'all' || item.kind === tab) &&
        (usage === 'all' || (usage === 'used' ? item.usedIn.length > 0 : item.usedIn.length === 0)) &&
        (!needle || item.name.includes(needle) || item.tags.some((tag) => tag.includes(needle)))
    ).sort((a, b) =>
      sort === 'old'
        ? a.uploadedAt - b.uploadedAt
        : sort === 'name'
          ? a.name.localeCompare(b.name)
          : sort === 'size'
            ? b.size - a.size
            : b.uploadedAt - a.uploadedAt
    );
  }, [tab, query, usage, sort]);
  const active = MEDIA_ITEMS.find((item) => item.id === search.id);
  const blank = phase === 'empty';
  const filtered = query.trim() !== '' || usage !== 'all';
  const reset = () => {
    setQuery('');
    setUsage('all');
    setSort('new');
  };
  const filtersCount = (usage !== 'all' ? 1 : 0) + (sort !== 'new' ? 1 : 0);
  const open = (id: string) => update({ id }, false);
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setSelected(next);
    if (next.size > 0) setSelecting(true);
  };
  const insertFor = (count: number) => {
    setPickerFor(count);
    setPickerOpen(true);
  };
  const chips: Chip[] = [
    ...(usage !== 'all' ? [{ id: 'usage', label: USAGE.find((o) => o.id === usage)?.label ?? '' }] : []),
    ...(sort !== 'new' ? [{ id: 'sort', label: SORTS.find((o) => o.id === sort)?.label ?? '' }] : [])
  ];
  const tableSort: TableSort = {
    column: sort === 'name' ? 'name' : sort === 'size' ? 'size' : 'uploaded',
    direction: sort === 'old' || sort === 'name' ? 'ascending' : 'descending'
  };

  const columns: DataColumn<MediaItem>[] = [
    {
      id: 'name',
      header: 'Название',
      isRowHeader: true,
      allowsSorting: true,
      headerControl: (
        <ColumnFilter label="Поиск по названию и тегам" icon="search" isActive={query.trim() !== ''}>
          <SearchField label="Название или тег" placeholder="Что ищем?" value={query} onChange={setQuery} />
        </ColumnFilter>
      ),
      cell: (item) => (
        <span className={styles.nameCell}>
          <Thumb seed={item.name} size={32} broken={item.unavailable} label={thumbLabel(item)} />
          <span className={kit.cellTitle}>
            <strong title={item.name}>{item.name}</strong>
            <span className={kit.sub}>{item.tags.join(' · ')}</span>
          </span>
        </span>
      )
    },
    { id: 'type', header: 'Тип', cell: (item) => KIND_LABEL[item.kind] },
    {
      id: 'size',
      header: 'Размер',
      allowsSorting: true,
      cell: (item) => <span className={kit.mono}>{formatSize(item.size)}</span>
    },
    {
      id: 'used',
      header: 'Используется',
      headerControl: (
        <ColumnFilter label="Фильтр по использованию" isActive={usage !== 'all'}>
          <RadioGroup label="Использование" value={usage} onChange={setUsage}>
            {USAGE.map((option) => (
              <Radio key={option.id} value={option.id}>
                {option.label}
              </Radio>
            ))}
          </RadioGroup>
        </ColumnFilter>
      ),
      cell: (item) =>
        item.unavailable ? (
          <Unavailable />
        ) : item.usedIn.length > 0 ? (
          `В ${item.usedIn.length}`
        ) : (
          <span className={kit.muted}>Не используется</span>
        )
    },
    {
      id: 'uploaded',
      header: 'Загружено',
      allowsSorting: true,
      cell: (item) => <span className={`${kit.mono} ${kit.nowrap}`}>{formatDateTime(item.uploadedAt)}</span>
    },
    {
      id: 'actions',
      header: 'Действия',
      align: 'end',
      cell: (item) => (
        <Menu
          label={`Действия: ${item.name}`}
          items={[
            { id: 'open', label: 'Открыть', icon: 'link' },
            { id: 'insert', label: 'Вставить в пост', icon: 'plus', isDisabled: item.unavailable ?? false },
            { id: 'delete', label: 'Удалить', icon: 'trash', tone: 'danger' }
          ]}
          onAction={(id) => (id === 'open' ? open(item.id) : id === 'insert' ? insertFor(1) : open(item.id))}
        />
      )
    }
  ];

  let body;
  if (phase === 'error') {
    body = (
      <ErrorState
        message="Не удалось загрузить медиатеку. Файлы не затронуты."
        requestId="req_8e21a0c3"
        onRetry={retry}
      />
    );
  } else if (phase === 'loading') {
    body =
      mode === 'grid' ? (
        <SkeletonGrid count={10} />
      ) : narrow ? (
        <PhoneSkeletonRows label="Загрузка файлов" />
      ) : (
        <DataTable
          flush
          aria-label="Загрузка файлов"
          columns={columns}
          rows={[]}
          getRowId={(r) => r.id}
          isLoading
          loadingRows={8}
        />
      );
  } else if (blank) {
    body = (
      <EmptyState
        icon="image"
        title="Файлов пока нет"
        description="Загрузите изображения, GIF, видео или документы: потом их можно вставлять в посты."
        action={
          <Button icon="upload" onPress={() => setUploadOpen(true)}>
            Загрузить файлы
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
  } else if (mode === 'grid') {
    body = (
      <ul className={styles.grid} aria-label="Файлы">
        {rows.map((item) => (
          <MediaCard
            key={item.id}
            item={item}
            selected={selected.has(item.id)}
            selecting={selecting}
            active={search.id === item.id}
            onOpen={() => open(item.id)}
            onToggle={(on) => toggle(item.id, on)}
          />
        ))}
      </ul>
    );
  } else if (narrow) {
    body = (
      <PanelList aria-label="Файлы">
        {rows.map((item) => (
          <RowCard
            key={item.id}
            title={item.name}
            leading={<Thumb seed={item.name} size={56} broken={item.unavailable} label={thumbLabel(item)} />}
            status={item.unavailable ? <Unavailable /> : undefined}
            meta={`${KIND_LABEL[item.kind]} · ${formatSize(item.size)} · ${item.usedIn.length ? `в ${item.usedIn.length}` : 'не используется'}`}
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
        aria-label="Файлы"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        activeId={search.id}
        onRowAction={open}
        sort={tableSort}
        onSortChange={(next) =>
          setSort(
            next.column === 'name'
              ? 'name'
              : next.column === 'size'
                ? 'size'
                : next.direction === 'ascending'
                  ? 'old'
                  : 'new'
          )
        }
      />
    );
  }

  const ready = phase === 'ready' && !blank;
  return (
    <PreviewPage
      title="Медиатека"
      actions={
        <>
          <Button icon="upload" onPress={() => setUploadOpen(true)}>
            {narrow ? 'Загрузить' : 'Загрузить файлы'}
          </Button>
          <Menu
            label="Действия с медиатекой"
            items={[
              { id: 'select', label: selecting ? 'Закончить выбор' : 'Выбрать несколько', icon: 'check' },
              { id: 'editor', label: 'Как в редакторе: выбор файлов', icon: 'image' }
            ]}
            onAction={(id) => {
              if (id === 'editor') setSelectOpen(true);
              else {
                setSelecting(!selecting);
                setSelected(new Set());
              }
            }}
          />
        </>
      }
    >
      <Tabs
        selectedKey={tab}
        onSelectionChange={(key) => update({ view: key === 'all' ? undefined : String(key), id: undefined })}
      >
        <TabList aria-label="Типы файлов">
          {TABS.map((entry) => (
            <Tab key={entry.id} id={entry.id}>
              {narrow ? entry.short : entry.label} <span className="tab-count">{counts[entry.id]}</span>
            </Tab>
          ))}
        </TabList>
      </Tabs>
      <Panel
        title="Файлы"
        marker={<DemoChip />}
        reserveRows={ready ? undefined : narrow ? 6 : 8}
        footer={
          <FooterLine
            text={
              ready
                ? `${rows.length} из ${MEDIA_ITEMS.length} · 2,4 ГБ из 10 ГБ`
                : phase === 'loading'
                  ? 'Загружаем…'
                  : ' '
            }
            action={ready ? <DemoChip /> : undefined}
          />
        }
        action={
          !narrow && filtered && ready ? (
            <Button variant="ghost" size="sm" icon="x" onPress={reset}>
              Сбросить фильтры
            </Button>
          ) : undefined
        }
      >
        <div className={kit.toolbar} data-narrow={narrow || undefined}>
          <div className={kit.grow}>
            <SearchField
              label="Поиск файлов"
              placeholder="Название или тег"
              value={query}
              isDisabled={phase === 'loading'}
              onChange={setQuery}
            />
          </div>
          {narrow ? (
            <FilterButton
              count={filtersCount}
              onPress={() => {
                setDraft({ usage, sort });
                setSheetOpen(true);
              }}
            />
          ) : mode === 'grid' ? (
            <>
              <Select label="Использование" inlineLabel options={USAGE} value={usage} onChange={setUsage} />
              <Select label="Сортировка" inlineLabel options={SORTS} value={sort} onChange={setSort} />
            </>
          ) : null}
          {narrow ? null : <span className={kit.spacer} />}
          {narrow ? null : (
            <SegmentedControl
              label="Вид"
              value={mode}
              onChange={(id) => update({ mode: id === 'grid' ? undefined : id })}
              options={[
                { id: 'grid', label: 'Сетка', icon: 'grid' },
                { id: 'list', label: 'Список', icon: 'list' }
              ]}
            />
          )}
        </div>
        {narrow ? (
          <div className={styles.modeRow}>
            <SegmentedControl
              label="Вид"
              fullWidth
              value={mode}
              onChange={(id) => update({ mode: id === 'grid' ? undefined : id })}
              options={[
                { id: 'grid', label: 'Сетка', icon: 'grid' },
                { id: 'list', label: 'Список', icon: 'list' }
              ]}
            />
          </div>
        ) : null}
        {ready && narrow ? (
          <AppliedChips chips={chips} onRemove={(id) => (id === 'usage' ? setUsage('all') : setSort('new'))} />
        ) : null}
        {body}
      </Panel>

      {selecting && selected.size > 0 ? (
        <SelectionBar label="Выбранные файлы" summary={`Выбрано ${selected.size}`}>
          <Button onPress={() => insertFor(selected.size)}>Вставить в пост</Button>
          <Button
            variant="secondary"
            onPress={() => {
              setSelected(new Set());
              setSelecting(false);
            }}
          >
            Отмена
          </Button>
        </SelectionBar>
      ) : null}

      <FilterSheet
        isOpen={sheetOpen}
        onOpenChange={setSheetOpen}
        count={(draft.usage !== 'all' ? 1 : 0) + (draft.sort !== 'new' ? 1 : 0)}
        onReset={() => setDraft({ usage: 'all', sort: 'new' })}
        onApply={() => {
          setUsage(draft.usage);
          setSort(draft.sort);
          setSheetOpen(false);
        }}
      >
        <Select
          label="Использование"
          options={USAGE}
          value={draft.usage}
          onChange={(v) => setDraft({ ...draft, usage: v })}
        />
        <Select
          label="Сортировка"
          options={SORTS}
          value={draft.sort}
          onChange={(v) => setDraft({ ...draft, sort: v })}
        />
      </FilterSheet>

      {active ? (
        <Inspector
          key={active.id}
          item={active}
          onClose={() => update({ id: undefined })}
          onInsert={() => insertFor(1)}
        />
      ) : null}
      <UploadDialog isOpen={uploadOpen} onOpenChange={setUploadOpen} forceDrag={search.state === 'upload-drag'} />
      <PostPicker isOpen={pickerOpen} onOpenChange={setPickerOpen} count={pickerFor} />
      <SelectionSheet isOpen={selectOpen} onOpenChange={setSelectOpen} />
      <span hidden>{NOW}</span>
    </PreviewPage>
  );
}
