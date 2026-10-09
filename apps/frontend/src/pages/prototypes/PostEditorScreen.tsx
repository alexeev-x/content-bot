/* oxlint-disable react/refs, react/set-state-in-effect, react/exhaustive-effect-dependencies, react/capitalized-calls, jsx-a11y/prefer-tag-over-role, jsx-a11y/no-autofocus, jsx-a11y/no-noninteractive-element-interactions, unicorn/prefer-add-event-listener, eslint/no-shadow -- dev-only prototype: mock timers, live regions and a full-screen crop layer */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionRow,
  BottomSheet,
  Button,
  Banner,
  Card,
  Icon,
  IconButton,
  Menu,
  PageHeader,
  Panel,
  SelectionBar,
  Skeleton,
  useToast
} from '../../shared/ui';
import type { IconName } from '../../shared/ui';
import { useNarrow, useProtoNavigate, useProtoSearch } from './proto-kit';
import { CropDialog, CropScreen } from './PostEditorCrop';
import { AddMediaDialog, PREFILLED_QUEUE, SourceSheet, queueItemFor, type QueueItem } from './PostEditorMedia';
import { MediaBlock, PreviewContent, RichText, SaveState, TitleField, type SaveStatus } from './PostEditorParts';
import { PostEditorPublication } from './PostEditorPublication';
import {
  BODY,
  BODY_MAX,
  FIVE_MEDIA,
  LONG_TITLE,
  POST_MEDIA_MAX_ITEMS,
  TITLE,
  TITLE_MAX,
  initialMedia,
  type PostMedia
} from './post-editor-data';
import type { CropResult } from './post-editor-crop';
import styles from './PostEditor.module.css';

type Overlay =
  | { kind: 'none' }
  | { kind: 'add'; tab: 'pc' | 'library' | 'recent' }
  | { kind: 'sheet' }
  | { kind: 'tile'; id: string }
  | { kind: 'crop'; id: string; fail: boolean; forced?: boolean };

type View = 'editor' | 'preview' | 'publication';

const focusTile = (id: string | null, add = false) =>
  requestAnimationFrame(() =>
    document
      .querySelector<HTMLElement>(id ? `[data-tile="${id}"] button` : add ? '[data-add-tile] button' : 'none')
      ?.focus()
  );

/** `/__proto/posts/new` — the v3 post editor reproduced from the owner's reference images (mock only). */
export function PostEditorScreen() {
  const state = useProtoSearch().state ?? 'media';
  const narrow = useNarrow();
  return <PostEditor key={`${state}-${narrow}`} initial={state} narrow={narrow} />;
}

function PostEditor({ initial, narrow }: { initial: string; narrow: boolean }) {
  const toast = useToast();
  const go = useProtoNavigate();
  const empty = initial === 'empty';
  const [title, setTitle] = useState(empty ? '' : initial === 'invalid' ? LONG_TITLE : TITLE);
  const [body, setBody] = useState(empty ? '' : BODY);
  const [items, setItems] = useState<PostMedia[]>(() => initialMedia(initial));
  const [view, setView] = useState<View>(
    initial.startsWith('publication') ? 'publication' : initial === 'preview' && narrow ? 'preview' : 'editor'
  );
  const [mode, setMode] = useState<'normal' | 'reorder' | 'select'>(
    initial === 'reorder' ? 'reorder' : initial === 'selection' ? 'select' : 'normal'
  );
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    initial === 'selection' ? new Set(FIVE_MEDIA.map((m) => m.id)) : new Set()
  );
  const [status, setStatus] = useState<SaveStatus>(
    initial === 'loading' ? 'none' : initial === 'uploading' ? 'saving' : initial === 'save-failed' ? 'failed' : 'saved'
  );
  const [previewOpen, setPreviewOpen] = useState(true);
  const [previewTab, setPreviewTab] = useState<'post' | 'album'>(initial === 'album' ? 'album' : 'post');
  const [previewIndex, setPreviewIndex] = useState(initial === 'preview' ? 1 : 0);
  const [live, setLive] = useState('');
  const [overlay, setOverlay] = useState<Overlay>(() => {
    if (initial === 'add-media') return narrow ? { kind: 'sheet' } : { kind: 'add', tab: 'pc' };
    if (initial === 'add-media-library') return { kind: 'add', tab: 'library' };
    if (initial === 'source-sheet') return narrow ? { kind: 'sheet' } : { kind: 'add', tab: 'pc' };
    if (initial === 'crop' || initial === 'crop-error')
      return { kind: 'crop', id: narrow ? 'm5' : 'm1', fail: initial === 'crop-error', forced: true };
    return { kind: 'none' };
  });
  const [queue, setQueue] = useState<QueueItem[]>(initial === 'add-media' && !narrow ? PREFILLED_QUEUE : []);
  const counter = useRef(0);
  const urls = useRef(new Set<string>());
  const coverHinted = useRef(false);
  const newId = useCallback(() => `n${(counter.current += 1)}`, []);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    const live = urls.current;
    return () => live.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  // Mock autosave: any edit → «Изменено» → «Сохранение…» → «Черновик сохранён».
  const edited = useRef(false);
  useEffect(() => {
    if (!edited.current) return;
    setStatus('dirty');
    const a = setTimeout(() => setStatus('saving'), 700);
    const b = setTimeout(() => setStatus('saved'), 1500);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [title, body]);
  const onTitle = (value: string) => {
    edited.current = true;
    setTitle(value);
  };
  const onBody = (value: string) => {
    edited.current = true;
    setBody(value);
  };

  // Mock uploads that were started in this session (fixtures stay frozen).
  useEffect(() => {
    const timer = setInterval(() => {
      if (!itemsRef.current.some((m) => m.live && m.status === 'uploading')) return;
      setItems((list) =>
        list.map((m) => {
          if (!m.live || m.status !== 'uploading') return m;
          const progress = Math.min(100, m.progress + 20);
          return progress >= 100 ? { ...m, progress, status: 'ready', live: false } : { ...m, progress };
        })
      );
    }, 450);
    return () => clearInterval(timer);
  }, []);

  const room = POST_MEDIA_MAX_ITEMS - items.length;
  const titleOver = title.length > TITLE_MAX;
  const bodyOver = body.length > BODY_MAX;
  const hasContent = title.trim().length > 0 || body.trim().length > 0;
  const blockReason = !hasContent
    ? 'Добавьте заголовок или текст'
    : titleOver
      ? 'Заголовок длиннее 200 символов'
      : bodyOver
        ? 'Текст длиннее 4096 символов'
        : null;
  const failed = items.find((m) => m.status === 'failed');

  const addPicked = (files: File[]) => {
    const free = Math.max(room, 0);
    if (files.length > free) toast.show({ tone: 'error', title: 'В посте не больше 10 файлов' });
    const next: PostMedia[] = files.slice(0, free).map((file) => {
      const q = queueItemFor(file, newId());
      const isVideo = q.kind === 'video';
      const src = q.src ?? FIVE_MEDIA[3]!.src;
      if (q.src) urls.current.add(q.src);
      return {
        id: q.id,
        name: q.name,
        kind: q.kind,
        src,
        original: src,
        meta: q.meta,
        status: q.state === 'failed' ? 'failed' : 'uploading',
        progress: q.progress,
        live: q.state !== 'failed',
        ...(q.state === 'failed' ? { failReason: `Не удалось загрузить ${q.name}: ${q.label}` } : {}),
        ...(isVideo ? { duration: '00:36' } : {})
      };
    });
    if (next.length > 0) setItems((list) => [...list, ...next]);
  };

  const removeItems = (ids: string[]) => {
    const before = itemsRef.current;
    const removed = before.map((m, index) => ({ m, index })).filter(({ m }) => ids.includes(m.id));
    setItems((list) => list.filter((m) => !ids.includes(m.id)));
    toast.show({
      tone: 'info',
      title: 'Убрано из поста',
      description:
        removed.length === 1 ? removed[0]!.m.name : `Файлов: ${removed.length}. Файлы остались в библиотеке.`,
      action: {
        label: 'Отменить',
        onPress: () =>
          setItems((list) => {
            const next = [...list];
            removed.forEach(({ m, index }) => next.splice(Math.min(index, next.length), 0, m));
            return next;
          })
      },
      timeout: 8000
    });
  };

  const move = (from: number, to: number) => {
    setItems((list) => {
      const next = [...list];
      const [item] = next.splice(from, 1);
      if (item) next.splice(to, 0, item);
      return next;
    });
    setLive(`Файл ${from + 1} перемещён на позицию ${to + 1}`);
  };

  const retry = (id: string) =>
    setItems((list) => list.map((m) => (m.id === id ? { ...m, status: 'uploading', progress: 0, live: true } : m)));

  function onCropSaved(id: string, result: CropResult, cover: boolean) {
    const before = itemsRef.current;
    const index = before.findIndex((m) => m.id === id);
    const previous = before[index];
    if (!previous) return;
    urls.current.add(result.url);
    const derived: PostMedia = {
      ...previous,
      src: result.url,
      derived: true,
      meta: `${(result.bytes / 1_000_000).toFixed(1).replace('.', ',')} МБ • ${result.width} × ${result.height}`
    };
    setItems((list) => {
      const next = list.map((m) => (m.id === id ? derived : m));
      if (cover && index > 0) {
        const [moved] = next.splice(index, 1);
        if (moved) next.unshift(moved);
      }
      return next;
    });
    setPreviewIndex(0);
    setOverlay({ kind: 'none' });
    toast.show({
      tone: 'success',
      title: 'Кадрирование сохранено',
      description: cover && index > 0 ? 'Фото стало первым в посте.' : previous.name,
      action: {
        label: 'Отменить',
        onPress: () =>
          setItems((list) => {
            const next = list.map((m) => (m.id === id ? previous : m));
            const at = next.findIndex((m) => m.id === id);
            if (cover && index > 0 && at === 0) {
              const [moved] = next.splice(0, 1);
              if (moved) next.splice(index, 0, moved);
            }
            return next;
          })
      },
      timeout: 8000
    });
  }

  const coverHint = () => {
    if (coverHinted.current) return;
    coverHinted.current = true;
    toast.show({
      tone: 'info',
      title: 'Фото станет первым в посте',
      description: 'Telegram не задаёт отдельную обложку.'
    });
  };

  const openTile = (id: string) => setOverlay({ kind: 'tile', id });
  const closeMenu = () => {
    const id = overlay.kind === 'tile' ? overlay.id : null;
    setOverlay({ kind: 'none' });
    focusTile(id);
  };
  const closeCrop = (id: string) => {
    setOverlay({ kind: 'none' });
    focusTile(id);
  };
  const tileItem = overlay.kind === 'tile' ? items.find((m) => m.id === overlay.id) : undefined;

  const menuActions = (() => {
    if (!tileItem) return [];
    const idx = items.findIndex((m) => m.id === tileItem.id);
    const list: { id: string; icon: IconName; title: string; hint: string; run: () => void }[] = [];
    if (tileItem.kind === 'image' && tileItem.status === 'ready') {
      list.push({
        id: 'crop',
        icon: 'crop',
        title: 'Кадрировать',
        hint: 'Обрезать и повернуть фото',
        run: () => setOverlay({ kind: 'crop', id: tileItem.id, fail: false })
      });
      if (idx > 0) {
        list.push({
          id: 'cover',
          icon: 'image',
          title: 'Использовать как обложку',
          hint: 'Фото станет первым в посте',
          run: () => {
            move(idx, 0);
            closeMenu();
            coverHint();
          }
        });
      }
      if (tileItem.derived) {
        list.push({
          id: 'restore',
          icon: 'undo',
          title: 'Вернуть исходное',
          hint: 'Отменить кадрирование',
          run: () => {
            setItems((l) => l.map((m) => (m.id === tileItem.id ? { ...m, src: m.original, derived: false } : m)));
            closeMenu();
            toast.show({ tone: 'success', title: 'Возвращено исходное фото' });
          }
        });
      }
    }
    if (tileItem.status === 'failed') {
      list.push({
        id: 'retry',
        icon: 'retry',
        title: 'Повторить',
        hint: 'Загрузить файл ещё раз',
        run: () => {
          retry(tileItem.id);
          closeMenu();
        }
      });
    }
    list.push({
      id: 'remove',
      icon: 'trash',
      title: tileItem.status === 'uploading' ? 'Отменить загрузку' : 'Убрать из поста',
      hint: 'Файл останется в медиабиблиотеке',
      run: () => {
        const id = tileItem.id;
        setOverlay({ kind: 'none' });
        removeItems([id]);
      }
    });
    return list;
  })();
  const tileMenu = (
    <div className={styles.menuList}>
      {menuActions.map((action) => (
        <Button
          key={action.id}
          variant="ghost"
          icon={action.icon}
          fullWidth
          className={styles.menuItem}
          onPress={action.run}
        >
          {action.title}
        </Button>
      ))}
    </div>
  );

  /* ---------- pieces ---------- */
  const statusNode = <SaveState status={status} {...(narrow ? {} : { ago: '2 минуты назад' })} />;
  const heading = (
    <div className={styles.titleRow}>
      <PageHeader
        title="Новый пост"
        marker={statusNode}
        actions={
          !previewOpen ? (
            <Button variant="secondary" icon="eye" onPress={() => setPreviewOpen(true)}>
              Предпросмотр
            </Button>
          ) : undefined
        }
      />
    </div>
  );

  const mediaHeader = (
    <div className={styles.sectionHead}>
      <h2 className={styles.sectionTitle}>
        <Icon name="image" size={20} />
        <span>Фото и видео</span>
        {items.length > 0 && !narrow ? <span className={styles.muted}>({items.length} файлов)</span> : null}
      </h2>
      <div className={styles.sectionActions}>
        {mode === 'reorder' ? (
          <Button variant="link" size="sm" onPress={() => setMode('normal')}>
            {narrow ? `Готово (${items.length})` : 'Готово'}
          </Button>
        ) : items.length > 0 && !narrow && mode === 'normal' ? (
          <>
            <Button variant="soft" size="sm" icon="list" onPress={() => setMode('reorder')}>
              Упорядочить
            </Button>
            <Button
              variant="link"
              size="sm"
              onPress={() => {
                setMode('select');
                setSelected(new Set(items.map((m) => m.id)));
              }}
            >
              Выбрать всё
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );

  const mediaBlock = (
    <>
      <MediaBlock
        items={items}
        narrow={narrow}
        mode={mode}
        selected={selected}
        onSelect={(id, on) =>
          setSelected((prev) => {
            const next = new Set(prev);
            if (on) next.add(id);
            else next.delete(id);
            return next;
          })
        }
        onOpen={openTile}
        onRemove={(id) => removeItems([id])}
        onRetry={retry}
        onAdd={() => setOverlay(narrow ? { kind: 'sheet' } : { kind: 'add', tab: 'pc' })}
        onMove={move}
        onFiles={addPicked}
        live={live}
        menu={!narrow && tileItem ? { id: tileItem.id, content: tileMenu, onClose: closeMenu } : null}
      />
      {failed?.failReason ? (
        <p className={styles.failLine} role="alert">
          <Icon name="alert" size={16} />
          {failed.failReason}
        </p>
      ) : null}
    </>
  );

  const titleNode = <TitleField value={title} onChange={onTitle} focus={overlay.kind === 'none'} />;
  const textNode = (
    <RichText
      value={body}
      narrow={narrow}
      onChange={onBody}
      onToast={(text) => toast.show({ tone: 'info', title: text })}
    />
  );

  const banners = (
    <>
      {status === 'failed' ? (
        <Banner
          tone="error"
          title="Не удалось сохранить черновик"
          action={
            <Button
              size="sm"
              variant="secondary"
              onPress={() => {
                setStatus('saving');
                setTimeout(() => setStatus('saved'), 900);
              }}
            >
              Повторить
            </Button>
          }
        >
          Введённый текст сохранён в редакторе.
        </Banner>
      ) : null}
    </>
  );

  const exit = () => {
    toast.show({ tone: 'info', title: 'Черновик сохранён', description: 'Возврат к списку постов.' });
    go('posts');
  };
  const toPublication = () => setView('publication');

  const primaryTrail = (
    <>
      К публикации
      <Icon name="arrow-right" size={18} />
    </>
  );

  const overlays = (
    <>
      {overlay.kind === 'add' ? (
        <AddMediaDialog
          initialTab={overlay.tab}
          queue={queue}
          setQueue={setQueue}
          room={room}
          newId={newId}
          onClose={() => {
            setOverlay({ kind: 'none' });
            focusTile(null, true);
          }}
          onAdd={(added) => {
            const take = added.slice(0, Math.max(room, 0));
            setItems((list) => [...list, ...take]);
            setOverlay({ kind: 'none' });
            toast.show({
              tone: 'success',
              title: `Добавлено файлов: ${take.length}`,
              action: {
                label: 'Отменить',
                onPress: () => setItems((list) => list.filter((m) => !take.some((t) => t.id === m.id)))
              },
              timeout: 8000
            });
          }}
        />
      ) : null}
      <SourceSheet
        isOpen={overlay.kind === 'sheet'}
        onOpenChange={(open) => {
          if (!open) {
            setOverlay({ kind: 'none' });
            focusTile(null, true);
          }
        }}
        onFiles={addPicked}
        onLibrary={() => setOverlay({ kind: 'add', tab: 'library' })}
      />
      <BottomSheet
        isOpen={narrow && overlay.kind === 'tile'}
        onOpenChange={(open) => !open && closeMenu()}
        title={tileItem?.name ?? 'Файл'}
        footer={
          <Button variant="secondary" fullWidth size="lg" onPress={closeMenu}>
            Отмена
          </Button>
        }
      >
        {menuActions.map((action) => (
          <ActionRow key={action.id} icon={action.icon} title={action.title} hint={action.hint} onPress={action.run} />
        ))}
      </BottomSheet>
      {overlay.kind === 'crop'
        ? (() => {
            const target = items.find((m) => m.id === overlay.id);
            if (!target) return null;
            const common = {
              item: target,
              coverDefault: overlay.forced === true || items[0]?.id === target.id,
              failFirstSave: overlay.fail,
              onCancel: () => closeCrop(target.id),
              onSaved: (result: CropResult, cover: boolean) => {
                onCropSaved(target.id, result, cover);
                focusTile(target.id);
              },
              onCoverHint: coverHint
            };
            return narrow ? <CropScreen {...common} /> : <CropDialog {...common} />;
          })()
        : null}
    </>
  );

  const selectionBar =
    mode === 'select' ? (
      <SelectionBar label="Выбранные файлы" summary={`Выбрано ${selected.size}`}>
        <Button
          variant="danger"
          icon="trash"
          isDisabled={selected.size === 0}
          onPress={() => {
            removeItems([...selected]);
            setSelected(new Set());
            setMode('normal');
          }}
        >
          Убрать из поста
        </Button>
        <Button
          variant="secondary"
          onPress={() => {
            setMode('normal');
            setSelected(new Set());
          }}
        >
          Отмена
        </Button>
      </SelectionBar>
    ) : null;

  /* ---------- views ---------- */
  if (view === 'publication') {
    return (
      <PostEditorPublication
        narrow={narrow}
        title={title}
        body={body}
        media={items}
        initialPlan={initial === 'publication-schedule' ? 'later' : 'now'}
        initialApproved={initial === 'publication-approved'}
        onBack={() => setView('editor')}
      />
    );
  }

  if (initial === 'loading') {
    return (
      <div className={narrow ? styles.phone : styles.desk} aria-busy="true">
        <div role="status" className={styles.srOnly}>
          Загрузка редактора
        </div>
        <Skeleton height={40} width="40%" radius="var(--radius-2)" />
        <div className={narrow ? styles.phoneStack : styles.cols}>
          <Card>
            <div className={styles.skeletonStack}>
              <Skeleton height={44} radius="var(--radius-2)" />
              <Skeleton height={44} radius="var(--radius-2)" />
              <Skeleton height={160} radius="var(--radius-2)" />
              <div className={narrow ? styles.grid : styles.strip}>
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} height="var(--size-media-tile)" radius="var(--radius-4)" />
                ))}
              </div>
            </div>
          </Card>
          {narrow ? null : (
            <Card>
              <Skeleton height={340} radius="var(--radius-3)" />
            </Card>
          )}
        </div>
      </div>
    );
  }

  if (narrow) {
    const previewView = view === 'preview';
    return (
      <div className={styles.phone} data-post-editor>
        <header className={styles.phoneHeader}>
          <IconButton
            label={previewView ? 'Назад к редактору' : 'Назад к постам'}
            icon="arrow-left"
            onPress={() => (previewView ? setView('editor') : exit())}
          />
          <h1 className={styles.phoneTitle}>Новый пост</h1>
          {statusNode}
          <span className={styles.phoneMore}>
            <Menu
              label="Ещё"
              items={[
                { id: 'preview', label: 'Предпросмотр', icon: 'eye' },
                { id: 'reorder', label: 'Упорядочить файлы', icon: 'list', isDisabled: items.length < 2 }
              ]}
              onAction={(id) => {
                if (id === 'preview') setView('preview');
                else setMode('reorder');
              }}
            />
          </span>
        </header>
        {banners}
        {previewView ? (
          <PreviewContent
            title={title}
            body={body}
            items={items}
            tab={previewTab}
            onTab={setPreviewTab}
            index={previewIndex}
            onIndex={setPreviewIndex}
            lines={3}
            phone
          />
        ) : mode === 'reorder' ? (
          <div className={styles.phoneCard}>
            {mediaHeader}
            {mediaBlock}
          </div>
        ) : (
          <div className={styles.phoneStack}>
            {titleNode}
            {textNode}
            <div className={styles.phoneCard}>
              {mediaHeader}
              {mediaBlock}
            </div>
          </div>
        )}
        {selectionBar}
        <div className={styles.pinned}>
          <Button variant="secondary" size="xl" icon="log-out" className={styles.exitPhone} onPress={exit}>
            Выйти
          </Button>
          <div className={styles.pinnedGrow}>
            <Button fullWidth size="xl" isDisabled={Boolean(blockReason)} onPress={toPublication}>
              {primaryTrail}
            </Button>
          </div>
        </div>
        {overlays}
      </div>
    );
  }

  return (
    <div className={styles.desk} data-post-editor>
      {heading}
      {banners}
      <div className={previewOpen ? styles.cols : styles.colsSingle}>
        <div className={styles.left}>
          <div className={styles.writeCard}>
            <Card>
              <div className={styles.writeStack}>
                {titleNode}
                {textNode}
              </div>
            </Card>
          </div>
          <section className={styles.mediaSection}>
            {mediaHeader}
            {mediaBlock}
          </section>
        </div>
        {previewOpen ? (
          <div className={styles.previewWrap}>
            <Panel
              title="Предпросмотр"
              headingLevel={2}
              icon={<Icon name="eye" size={18} />}
              action={
                <IconButton label="Закрыть предпросмотр" icon="x" size="sm" onPress={() => setPreviewOpen(false)} />
              }
            >
              <PreviewContent
                title={title}
                body={body}
                items={items}
                tab={previewTab}
                onTab={setPreviewTab}
                index={previewIndex}
                onIndex={setPreviewIndex}
              />
            </Panel>
          </div>
        ) : null}
      </div>
      {selectionBar}
      <footer className={styles.footer}>
        <Button variant="secondary" size="xl" icon="log-out" className={styles.exit} onPress={exit}>
          Выйти
        </Button>
        <p className={styles.footNote}>
          <Icon name="info" size={18} />
          {blockReason ?? 'Черновик сохраняется автоматически'}
        </p>
        <Button size="xl" className={styles.next} isDisabled={Boolean(blockReason)} onPress={toPublication}>
          {primaryTrail}
        </Button>
      </footer>
      {overlays}
    </div>
  );
}
