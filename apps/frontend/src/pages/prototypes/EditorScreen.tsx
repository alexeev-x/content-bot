/* oxlint-disable react/set-state-in-effect, jsx-a11y/prefer-tag-over-role -- dev-only prototype: resets local mock state on open/visit and uses simple ARIA roles */
import { useEffect, useRef, useState } from 'react';
import {
  Banner,
  Button,
  ConfirmDialog,
  Dialog,
  Icon,
  IconButton,
  Menu,
  SegmentedControl,
  StatusBadge,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TelegramPreview,
  useToast
} from '../../shared/ui';
import { formatDateTime } from './data';
import { PublishDialog } from './PublishDialog';
import { channelName, shortChannel } from './parts';
import { useNarrow, useProtoNavigate, useProtoPath, useProtoSearch, useProtoSearchUpdate } from './proto-kit';
import { useProtoStore } from './proto-store';
import styles from './Editor.module.css';

const LIMIT = 4096;
type Save = 'idle' | 'dirty' | 'saving' | 'saved' | 'failed';
type Mobile = 'text' | 'preview' | 'pubs';

const clock = () => {
  const date = new Date();
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

function SaveIndicator({
  save,
  savedAt,
  offline,
  onRetry
}: {
  save: Save;
  savedAt: string;
  offline: boolean;
  onRetry: () => void;
}) {
  return (
    <span className={styles.save} data-state={offline ? 'failed' : save} role="status">
      {offline ? (
        <>
          <Icon name="alert" size={14} /> Нет соединения
        </>
      ) : save === 'saving' ? (
        'Сохраняем…'
      ) : save === 'dirty' ? (
        'Не сохранено'
      ) : save === 'saved' ? (
        <>
          <Icon name="check" size={14} /> Сохранено, {savedAt}
        </>
      ) : save === 'failed' ? (
        <>
          <Icon name="alert" size={14} /> Не удалось сохранить
          <button type="button" className={styles.retry} onClick={onRetry}>
            Повторить
          </button>
        </>
      ) : (
        <span className={styles.slot} />
      )}
    </span>
  );
}

export function EditorScreen() {
  const narrow = useNarrow();
  const path = useProtoPath();
  const search = useProtoSearch();
  const update = useProtoSearchUpdate();
  const go = useProtoNavigate();
  const toast = useToast();
  const { posts, publications, channels, createPost, updatePost, approvePost, returnToDraft, offline } =
    useProtoStore();
  const routeId = path.split('/')[1] ?? 'new';
  const [createdId, setCreatedId] = useState<string | null>(null);
  const id = routeId === 'new' ? createdId : routeId;
  const post = posts.find((p) => p.id === id);
  const [title, setTitle] = useState(post?.title ?? '');
  const [body, setBody] = useState(post?.body ?? '');
  const [save, setSave] = useState<Save>('idle');
  const [savedAt, setSavedAt] = useState(clock());
  const [mobileTab, setMobileTab] = useState<Mobile>('text');
  const [approveOpen, setApproveOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [dirtyTick, setDirtyTick] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const mini = search.mini === '1';
  const keyboard = search.state === 'keyboard' && narrow;
  const forcedFail = search.state === 'failed';
  const readOnly = Boolean(post && post.state !== 'draft');

  // Autosave: the draft is created silently on the first non-empty text, then every pause saves it.
  useEffect(() => {
    if (dirtyTick === 0 || readOnly) return;
    setSave('dirty');
    const first = setTimeout(() => {
      setSave('saving');
    }, 600);
    const second = setTimeout(() => {
      if (forcedFail || offline) {
        setSave('failed');
        return;
      }
      if (!id && (title.trim() || body.trim())) {
        const created = createPost(title, body);
        setCreatedId(created);
        go(`posts/${created}`, {}, true);
      } else if (id) {
        updatePost(id, { title, body });
      }
      setSavedAt(clock());
      setSave(id || title.trim() || body.trim() ? 'saved' : 'idle');
    }, 1300);
    return () => {
      clearTimeout(first);
      clearTimeout(second);
    };
  }, [dirtyTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = (next: { title?: string; body?: string }) => {
    if (next.title !== undefined) setTitle(next.title);
    if (next.body !== undefined) setBody(next.body);
    setDirtyTick((value) => value + 1);
  };
  const wrap = (mark: string) => {
    const el = area.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    edit({ body: `${body.slice(0, a)}${mark}${body.slice(a, b)}${mark}${body.slice(b)}` });
  };

  const length = body.length;
  const ratio = length / LIMIT;
  const counter = length > LIMIT ? `Превышен лимит на ${length - LIMIT}` : ratio >= 0.9 ? 'Почти лимит' : '';
  const saved = Boolean(post) && save !== 'dirty' && save !== 'saving' && save !== 'failed';
  const hasText = Boolean(title.trim() || body.trim());
  const myPubs = publications.filter((p) => p.postId === id);

  const back = () => (save === 'failed' ? setLeaveOpen(true) : go('posts'));
  const approve = async () => {
    if (!id) return;
    setApproving(true);
    await approvePost(id);
    setApproving(false);
    setApproveOpen(false);
    toast.show({ tone: 'success', title: 'Пост одобрен' });
  };

  const state = post?.state ?? 'draft';
  const primary =
    state === 'draft' ? (
      <Button isDisabled={!saved || !hasText || offline || length > LIMIT} onPress={() => setApproveOpen(true)}>
        Одобрить
      </Button>
    ) : state === 'approved' || state === 'sent' ? (
      <Button icon="send" isDisabled={offline} onPress={() => setPublishOpen(true)}>
        Опубликовать…
      </Button>
    ) : null;
  const primaryLabel = state === 'draft' ? 'Одобрить' : 'Опубликовать…';

  const menu = (
    <Menu
      label="Действия с постом"
      items={[
        { id: 'history', label: 'История правок', icon: 'clock', isDisabled: true },
        ...(state === 'approved' ? [{ id: 'draft', label: 'Вернуть в черновик', icon: 'retry' as const }] : []),
        { id: 'delete', label: 'Удалить', icon: 'trash', tone: 'danger' as const, isDisabled: !id }
      ]}
      onAction={(action) => {
        if (action === 'draft' && id) returnToDraft(id);
        if (action === 'delete') go('posts');
      }}
    />
  );

  const preview = hasText ? (
    <TelegramPreview title={title || undefined} body={body} meta="12:30" />
  ) : (
    <p className={styles.sideEmpty}>Предпросмотр появится, когда вы начнёте писать.</p>
  );
  const pubsList =
    myPubs.length === 0 ? (
      <p className={styles.sideEmpty}>У поста пока нет публикаций. Одобрите его, чтобы опубликовать.</p>
    ) : (
      <ul className={styles.pubs}>
        {myPubs.map((item) => (
          <li key={item.id}>
            <div className={styles.pubMain}>
              <strong>{shortChannel(channelName(channels, item.channelId))}</strong>
              <span className={styles.pubTime}>{formatDateTime(item.at)}</span>
            </div>
            <StatusBadge status={item.status} />
            <Menu
              label="Действия с публикацией"
              items={[{ id: 'open', label: 'Открыть', icon: 'send' }]}
              onAction={() => go('publications', { id: item.id })}
            />
          </li>
        ))}
      </ul>
    );

  const writing = (
    <div className={styles.field} data-readonly={readOnly || undefined}>
      <div className={styles.format} role="toolbar" aria-label="Форматирование">
        {(
          [
            ['b', 'Жирный', '**'],
            ['i', 'Курсив', '_'],
            ['u', 'Подчёркнутый', '__'],
            ['s', 'Зачёркнутый', '~~']
          ] as const
        ).map(([glyph, label, mark]) => (
          <button
            key={glyph}
            type="button"
            className={styles.mark}
            aria-label={label}
            disabled={readOnly}
            onClick={() => wrap(mark)}
          >
            <span data-glyph={glyph}>{glyph.toUpperCase()}</span>
          </button>
        ))}
        <IconButton label="Ссылка" icon="link" size="sm" isDisabled={readOnly} showTooltip={false} />
        <Menu
          label="Ещё форматирование"
          items={[
            { id: 'code', label: 'Код' },
            { id: 'quote', label: 'Цитата' },
            { id: 'list', label: 'Список' }
          ]}
          onAction={(action) => wrap(action === 'code' ? '`' : action === 'quote' ? '> ' : '- ')}
        />
      </div>
      <textarea
        ref={area}
        className={styles.area}
        aria-label="Текст поста"
        placeholder="Напишите текст поста…"
        value={body}
        readOnly={readOnly}
        onChange={(event) => edit({ body: event.target.value })}
      />
      <div className={styles.counter} data-level={length > LIMIT ? 'over' : ratio >= 0.9 ? 'warn' : undefined}>
        {counter ? <span>{counter} · </span> : null}
        <span className={styles.mono}>
          {length} / {LIMIT}
        </span>
      </div>
    </div>
  );

  return (
    <div className={styles.editor} data-mini={mini || undefined} data-keyboard={keyboard || undefined}>
      <h1 className={styles.srOnly}>Редактор поста</h1>
      <header className={styles.header}>
        <Button variant="ghost" icon="chevron-left" onPress={back}>
          Посты
        </Button>
        <input
          className={styles.title}
          aria-label="Заголовок"
          placeholder="Заголовок (необязательно)"
          value={title}
          readOnly={readOnly}
          onChange={(event) => edit({ title: event.target.value })}
        />
        <div className={styles.status}>
          {narrow ? null : (
            <SaveIndicator
              save={readOnly ? 'idle' : save}
              savedAt={savedAt}
              offline={offline}
              onRetry={() => {
                update({ state: undefined });
                setDirtyTick((v) => v + 1);
              }}
            />
          )}
          {post ? <StatusBadge status={post.state} /> : null}
          {menu}
        </div>
        {!narrow && primary ? <div className={styles.primary}>{primary}</div> : null}
      </header>

      {search.state === 'conflict' ? (
        <Banner
          tone="conflict"
          title="Изменено на другом устройстве"
          action={
            <Button variant="secondary" size="sm" onPress={() => update({ state: undefined })}>
              Обновить
            </Button>
          }
        >
          Ваши правки не потеряются, пока вы не обновите страницу.
        </Banner>
      ) : null}
      {readOnly ? (
        <Banner
          tone="info"
          title={state === 'approved' ? 'Пост одобрен и защищён от правок' : 'Редактирование недоступно'}
          action={
            state === 'approved' ? (
              <Button variant="secondary" size="sm" onPress={() => id && returnToDraft(id)}>
                Вернуть в черновик
              </Button>
            ) : undefined
          }
        >
          {state === 'approved' ? 'Опубликуйте его или верните в черновик.' : 'Пост уже ушёл в публикацию.'}
        </Banner>
      ) : null}

      {narrow ? (
        <div className={styles.mobile}>
          <SegmentedControl
            label="Раздел поста"
            fullWidth
            value={mobileTab}
            onChange={(value) => setMobileTab(value as Mobile)}
            options={[
              { id: 'text', label: 'Текст' },
              { id: 'preview', label: 'Превью' },
              { id: 'pubs', label: 'Публикации' }
            ]}
          />
          {mobileTab === 'text' ? (
            writing
          ) : mobileTab === 'preview' ? (
            <div className={styles.sideBox}>{preview}</div>
          ) : (
            <div className={styles.sideBox}>{pubsList}</div>
          )}
        </div>
      ) : (
        <div className={styles.columns}>
          <div className={styles.write}>{writing}</div>
          <aside className={styles.side}>
            <Tabs>
              <TabList aria-label="Боковая панель">
                <Tab id="preview">Превью</Tab>
                <Tab id="pubs">
                  Публикации поста <span className="tab-count">{myPubs.length}</span>
                </Tab>
              </TabList>
              <TabPanel id="preview">
                <div className={styles.sideBox}>{preview}</div>
              </TabPanel>
              <TabPanel id="pubs">
                <div className={styles.sideBox}>{pubsList}</div>
              </TabPanel>
            </Tabs>
          </aside>
        </div>
      )}

      {narrow && primary && !mini ? (
        <div className={styles.actionBar}>
          <span className={styles.barNote}>
            <SaveIndicator
              save={readOnly ? 'idle' : save}
              savedAt={savedAt}
              offline={offline}
              onRetry={() => setDirtyTick((v) => v + 1)}
            />
          </span>
          {primary}
        </div>
      ) : null}
      {mini && primary ? (
        <div className={styles.mainButton} role="presentation">
          {primaryLabel}
          <span className={styles.mainHint}>MainButton Telegram</span>
        </div>
      ) : null}
      {keyboard ? (
        <div className={styles.keyboard} aria-hidden="true">
          клавиатура телефона
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={approveOpen}
        onOpenChange={(open) => !open && !approving && setApproveOpen(false)}
        title="Одобрить пост?"
        description="Править его можно будет после возврата в черновик."
        confirmLabel="Одобрить"
        cancelLabel="Не одобрять"
        tone="default"
        isPending={approving}
        onConfirm={() => void approve()}
      />
      <PublishDialog isOpen={publishOpen} onOpenChange={setPublishOpen} {...(id ? { postId: id } : {})} />
      <Dialog
        isOpen={leaveOpen}
        onOpenChange={setLeaveOpen}
        role="alertdialog"
        title="Выйти без сохранения?"
        description="Последние правки не сохранились. Если выйти сейчас, они пропадут."
        footer={
          <>
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <Button variant="secondary" autoFocus onPress={() => setLeaveOpen(false)}>
              Остаться и повторить
            </Button>
            <Button variant="danger" onPress={() => go('posts')}>
              Выйти без сохранения
            </Button>
          </>
        }
      />
    </div>
  );
}
