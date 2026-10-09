/* oxlint-disable react/refs, react/set-state-in-effect, react/exhaustive-effect-dependencies, react/capitalized-calls, jsx-a11y/prefer-tag-over-role, jsx-a11y/no-autofocus, jsx-a11y/no-noninteractive-element-interactions, unicorn/prefer-add-event-listener, eslint/no-shadow -- dev-only prototype: mock timers, live regions and a full-screen crop layer */
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  Button,
  Dropzone,
  FormatToolbar,
  Icon,
  MediaAddTile,
  MediaGridTile,
  MediaListRow,
  Popover,
  SegmentedControl,
  TelegramPreview,
  TextArea,
  TextField,
  type FormatToolbarItem
} from '../../shared/ui';
import { BODY_MAX, POST_MEDIA_MAX_ITEMS, TITLE_MAX, type PostMedia } from './post-editor-data';
import { usePointerReorder } from './post-editor-reorder';
import styles from './PostEditor.module.css';

export type SaveStatus = 'none' | 'dirty' | 'saving' | 'saved' | 'failed';

const STATUS_TEXT: Record<SaveStatus, string> = {
  none: '',
  dirty: 'Изменено',
  saving: 'Сохранение…',
  saved: 'Черновик сохранён',
  failed: 'Не сохранено'
};

/** Dot (or an alert icon for a failure) plus text: the state is never colour alone. */
export function SaveState({ status, ago }: { status: SaveStatus; ago?: string }) {
  if (status === 'none') return <span role="status" className={styles.srOnly} />;
  return (
    <span className={styles.status} data-status={status} role="status">
      {status === 'failed' ? <Icon name="alert" size={14} /> : <span className={styles.dot} aria-hidden="true" />}
      <span>
        {STATUS_TEXT[status]}
        {status === 'saved' && ago ? ` ${ago}` : ''}
      </span>
    </span>
  );
}

type TitleProps = { value: string; onChange: (value: string) => void; focus: boolean };

export function TitleField({ value, onChange, focus }: TitleProps) {
  return (
    <div className={styles.titleField}>
      <TextField
        label="Заголовок"
        placeholder="Введите заголовок"
        value={value}
        onChange={onChange}
        autoFocus={focus}
        limit={TITLE_MAX}
      />
    </div>
  );
}

const TOOLBAR: readonly FormatToolbarItem[] = [
  { id: 'bold', icon: 'bold', label: 'Жирный', kind: 'toggle' },
  { id: 'italic', icon: 'italic', label: 'Курсив', kind: 'toggle' },
  { id: 'underline', icon: 'underline', label: 'Подчёркнутый', kind: 'toggle' },
  { id: 'strike', icon: 'strike', label: 'Зачёркнутый', kind: 'toggle' },
  { id: 'link', icon: 'link', label: 'Ссылка', kind: 'action', separatorBefore: true },
  { id: 'list', icon: 'list', label: 'Маркированный список', kind: 'action', separatorBefore: true },
  { id: 'ordered', icon: 'list-ordered', label: 'Нумерованный список', kind: 'action' },
  { id: 'code', icon: 'code', label: 'Код', kind: 'action' },
  { id: 'quote', icon: 'quote', label: 'Цитата', kind: 'action' },
  { id: 'emoji', icon: 'smile', label: 'Эмодзи', kind: 'action', end: true },
  { id: 'undo', icon: 'undo', label: 'Отменить', kind: 'action', end: true, separatorBefore: true },
  { id: 'redo', icon: 'redo', label: 'Повторить', kind: 'action', end: true }
];

type RichProps = { value: string; onChange: (value: string) => void; onToast: (text: string) => void; narrow: boolean };

/** Text field with the Telegram format toolbar. Lists, quote, code, link and emoji insert plain text; B/I/U/S toggle. */
export function RichText({ value, onChange, onToast, narrow }: RichProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState<ReadonlySet<string>>(new Set());
  const history = useRef<{ stack: string[]; at: number }>({ stack: [value], at: 0 });
  const [, bump] = useState(0);

  function commit(next: string) {
    const h = history.current;
    if (next === h.stack[h.at]) return;
    h.stack = [...h.stack.slice(0, h.at + 1), next].slice(-50);
    h.at = h.stack.length - 1;
    onChange(next);
    bump((v) => v + 1);
  }

  function insert(text: string, linePrefix = false) {
    const area = wrap.current?.querySelector('textarea');
    const start = area?.selectionStart ?? value.length;
    const end = area?.selectionEnd ?? value.length;
    const lineStart = linePrefix ? value.lastIndexOf('\n', start - 1) + 1 : start;
    const next = linePrefix
      ? value.slice(0, lineStart) + text + value.slice(lineStart)
      : value.slice(0, start) + text + value.slice(end);
    commit(next);
    requestAnimationFrame(() => {
      area?.focus();
      const caret = (linePrefix ? lineStart : start) + text.length;
      area?.setSelectionRange(caret, caret);
    });
  }

  const items = TOOLBAR.map((item) => ({
    ...item,
    ...(item.kind === 'toggle' ? { isSelected: on.has(item.id) } : {}),
    ...(item.id === 'undo' ? { isDisabled: history.current.at === 0 } : {}),
    ...(item.id === 'redo' ? { isDisabled: history.current.at >= history.current.stack.length - 1 } : {})
  }));

  function onAction(id: string) {
    if (id === 'bold' || id === 'italic' || id === 'underline' || id === 'strike') {
      setOn((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      onToast('Демо: формат применяется к выделенному тексту при отправке.');
    } else if (id === 'link') insert('https://example.com');
    else if (id === 'list') insert('• ', true);
    else if (id === 'ordered') insert('1. ', true);
    else if (id === 'code') insert('`код`');
    else if (id === 'quote') insert('> ', true);
    else if (id === 'emoji') insert('😊');
    else if (id === 'undo' || id === 'redo') {
      const h = history.current;
      h.at = Math.min(Math.max(h.at + (id === 'undo' ? -1 : 1), 0), h.stack.length - 1);
      onChange(h.stack[h.at] ?? '');
      bump((v) => v + 1);
    }
  }

  return (
    <div ref={wrap} className={styles.rich}>
      <TextArea
        label="Текст"
        textSize={narrow ? 'md' : 'lg'}
        placeholder="Напишите текст публикации"
        rows={narrow ? 2 : 5}
        minRows={narrow ? 2 : 5}
        limit={BODY_MAX}
        limitPlacement="label"
        value={value}
        onChange={commit}
        toolbar={
          <FormatToolbar
            label="Форматирование"
            overflowLabel="Ещё"
            items={items}
            density={narrow ? 'compact' : 'comfortable'}
            onAction={onAction}
          />
        }
      />
    </div>
  );
}

/** Keyboard drag handle: Space lifts, arrows move, Space drops, Esc cancels and restores. Pointer drag is on the whole tile. */
function Handle({
  name,
  index,
  count,
  onMove,
  onNote
}: {
  name: string;
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onNote: (text: string) => void;
}) {
  const [lifted, setLifted] = useState(false);
  const origin = useRef(index);
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (lifted) {
        setLifted(false);
        onNote(`Файл ${index + 1} опущен на позицию ${index + 1}`);
      } else {
        origin.current = index;
        setLifted(true);
        onNote(`Файл ${index + 1} поднят из ${count}. Стрелки меняют позицию, пробел опускает, Escape отменяет`);
      }
    } else if (event.key === 'Escape' && lifted) {
      event.preventDefault();
      event.stopPropagation();
      setLifted(false);
      if (origin.current !== index) onMove(index, origin.current);
      onNote(`Перемещение отменено, файл ${origin.current + 1} на прежней позиции`);
    } else if (lifted && (event.key === 'ArrowLeft' || event.key === 'ArrowUp') && index > 0) {
      event.preventDefault();
      onMove(index, index - 1);
    } else if (lifted && (event.key === 'ArrowRight' || event.key === 'ArrowDown') && index < count - 1) {
      event.preventDefault();
      onMove(index, index + 1);
    }
  }
  return (
    <button
      type="button"
      className={styles.handle}
      aria-label={`Переместить ${name}: перетащите или нажмите пробел и стрелки`}
      aria-pressed={lifted}
      data-lifted={lifted || undefined}
      onBlur={() => setLifted(false)}
      onKeyDown={onKeyDown}
    >
      <Icon name="grip" size={18} strokeWidth={2.5} />
    </button>
  );
}

const statusLabel = (item: PostMedia): string | undefined => {
  if (item.status === 'done') return '100%';
  if (item.status === 'uploading') return `Загрузка ${item.progress}%`;
  if (item.status === 'failed') return item.progress > 0 ? `Ошибка ${item.progress}%` : 'Ошибка';
  if (item.status === 'queued') return 'В очереди';
  return undefined;
};

type MediaProps = {
  items: PostMedia[];
  narrow: boolean;
  mode: 'normal' | 'reorder' | 'select';
  selected: ReadonlySet<string>;
  onSelect: (id: string, on: boolean) => void;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onAdd: () => void;
  onMove: (from: number, to: number) => void;
  onFiles: (files: File[]) => void;
  live: string;
  /** Desktop tile menu: a popover anchored to the tile with this id. */
  menu?: { id: string; content: ReactNode; onClose: () => void } | null;
};

/** Desktop strip / phone grid / reorder list of the post's media, all from the same fixtures. */
export function MediaBlock({
  items,
  narrow,
  mode,
  selected,
  onSelect,
  onOpen,
  onRemove,
  onRetry,
  onAdd,
  onMove,
  onFiles,
  live,
  menu
}: MediaProps) {
  const limit = items.length >= POST_MEDIA_MAX_ITEMS;
  const [note, setNote] = useState('');
  const move = (from: number, to: number) => {
    setNote('');
    onMove(from, to);
  };
  const liveText = note || live;
  const box = useRef<HTMLDivElement>(null);
  const { view, start } = usePointerReorder(box, move, setNote);
  const order = (item: PostMedia, index: number) => (
    <Handle name={item.name} index={index} count={items.length} onMove={move} onNote={setNote} />
  );
  /** Props that make a tile or row a drag source and drop target; the add tile never gets them. */
  const dnd = (index: number, id: string) => {
    const dragging = view?.from === index;
    const over = view && view.over === index && view.from !== index;
    return {
      'data-reorder-item': true,
      'data-item-id': id,
      'data-dragging': dragging || undefined,
      'data-drop': over ? (view.over > view.from ? 'after' : 'before') : undefined,
      style: dragging ? ({ '--dx': `${view.dx}px`, '--dy': `${view.dy}px` } as React.CSSProperties) : undefined,
      /* The browser's native image drag would cancel the pointer stream. */
      onDragStart: (event: React.DragEvent) => event.preventDefault(),
      onPointerDownCapture: (event: React.PointerEvent) => start(index, event),
      onKeyDown: (event: KeyboardEvent) => {
        if (!event.altKey) return;
        const to = { ArrowLeft: index - 1, ArrowUp: index - 1, ArrowRight: index + 1, ArrowDown: index + 1 }[
          event.key as 'ArrowLeft'
        ];
        if (to === undefined || to < 0 || to >= items.length) return;
        event.preventDefault();
        move(index, to);
        setNote(`Файл ${index + 1} перемещён на позицию ${to + 1}`);
        requestAnimationFrame(() => box.current?.querySelector<HTMLElement>(`[data-item-id="${id}"] button`)?.focus());
      }
    };
  };
  if (items.length === 0) {
    return (
      <Dropzone
        size="md"
        iconFrame="square"
        title="Добавьте фото или видео"
        subtitle="Поделитесь яркими моментами вашего путешествия"
        dropLabel="Отпустите файлы"
        accept={['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4']}
        onFiles={onFiles}
      >
        <Button size="sm" icon="image" onPress={onAdd}>
          Добавить медиа
        </Button>
      </Dropzone>
    );
  }
  if (narrow && mode === 'reorder') {
    return (
      <>
        <div ref={box} className={styles.list}>
          {items.map((item, index) => (
            <div key={item.id} className={styles.listRow} {...dnd(index, item.id)}>
              <MediaListRow
                thumb="landscape"
                name={item.name}
                {...(item.kind === 'video' && item.duration ? { meta: item.duration } : {})}
                src={item.src}
                kind={item.kind}
                handle={order(item, index)}
                removeLabel={`Убрать ${item.name} из поста`}
                onRemove={() => onRemove(item.id)}
              />
            </div>
          ))}
        </div>
        <p className={styles.srOnly} aria-live="polite">
          {liveText}
        </p>
      </>
    );
  }
  const tiles = items.map((item, index) => (
    <div key={item.id} data-tile={item.id} className={styles.cell} {...dnd(index, item.id)}>
      {menu?.id === item.id ? (
        <Popover
          label={`Действия: ${item.name}`}
          placement="bottom start"
          isOpen
          onOpenChange={(open) => !open && menu.onClose()}
          trigger={<Button variant="ghost" aria-label={item.name} className={styles.anchor} excludeFromTabOrder />}
        >
          {menu.content}
        </Popover>
      ) : null}
      <MediaGridTile
        fluid
        label={item.name}
        src={item.src}
        kind={item.kind}
        {...(item.duration ? { duration: item.duration } : {})}
        state={item.status}
        progress={item.progress}
        {...(statusLabel(item) ? { stateLabel: statusLabel(item) as string } : {})}
        {...(mode === 'select'
          ? {
              selectable: true,
              isSelected: selected.has(item.id),
              onSelectedChange: (on: boolean) => onSelect(item.id, on)
            }
          : { onPress: () => onOpen(item.id) })}
        {...(mode === 'normal'
          ? { onRemove: () => onRemove(item.id), removeLabel: `Убрать ${item.name} из поста` }
          : {})}
        {...(item.status === 'failed'
          ? { onRetry: () => onRetry(item.id), retryLabel: `Повторить загрузку ${item.name}` }
          : {})}
        {...(mode === 'reorder'
          ? {
              handle: order(item, index)
            }
          : {})}
      />
    </div>
  ));
  const addTile = (
    <div className={styles.cell} data-add-tile>
      <MediaAddTile fluid label="Добавить файлы" onPress={onAdd} isDisabled={limit} />
    </div>
  );
  return (
    <>
      <div ref={box} className={narrow ? styles.grid : styles.strip}>
        {mode === 'normal' && !narrow ? addTile : null}
        {tiles}
        {mode === 'normal' && narrow ? addTile : null}
      </div>
      {limit && mode === 'normal' ? <p className={styles.muted}>Достигнут лимит: 10 файлов</p> : null}
      <p className={styles.srOnly} aria-live="polite">
        {liveText}
      </p>
    </>
  );
}

/** The bubble body clipped to a few lines, as in the references; the full text stays in the field. */
export function clampBody(body: string, lines: number): ReactNode {
  return (
    <span className={styles.clamp} style={{ '--lines': lines } as React.CSSProperties}>
      {body}
    </span>
  );
}

type PreviewProps = {
  title: string;
  body: string;
  items: PostMedia[];
  tab: 'post' | 'album';
  onTab: (tab: 'post' | 'album') => void;
  index: number;
  onIndex: (index: number) => void;
  /** Phone M5 (no panel header): the segmented control and bubble only. */
  lines?: number;
  /** Phone M5: the preview runs 16 px from the screen edges instead of the panel padding. */
  phone?: boolean;
};

const PREVIEW_LABELS = {
  previous: 'Предыдущее фото',
  next: 'Следующее фото',
  loadFailed: 'Не удалось загрузить',
  retry: 'Повторить',
  region: 'Медиа поста'
};

export function PreviewContent({
  title,
  body,
  items,
  tab,
  onTab,
  index,
  onIndex,
  lines = 2,
  phone = false
}: PreviewProps) {
  const pics = items.filter((m) => m.status !== 'failed').map((m) => ({ id: m.id, src: m.src, alt: m.name }));
  const empty = !title && !body && pics.length === 0;
  return (
    <div className={phone ? styles.previewBodyPhone : styles.previewBody}>
      <SegmentedControl
        label="Вид предпросмотра"
        fullWidth
        value={tab}
        onChange={(v) => onTab(v as 'post' | 'album')}
        options={[
          { id: 'post', label: 'Пост' },
          { id: 'album', label: 'Альбом' }
        ]}
      />
      {empty ? (
        <p className={styles.muted}>Предпросмотр появится после ввода заголовка или текста.</p>
      ) : (
        <TelegramPreview
          variant="panel"
          {...(title ? { title } : {})}
          body={clampBody(body, lines)}
          views="0"
          meta="сейчас"
          media={pics}
          mediaMode={tab === 'album' ? 'album' : 'single'}
          mediaIndex={index}
          onMediaIndexChange={onIndex}
          mediaLabels={PREVIEW_LABELS}
        />
      )}
    </div>
  );
}
