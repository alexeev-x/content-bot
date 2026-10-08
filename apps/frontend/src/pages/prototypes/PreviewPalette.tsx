/* oxlint-disable jsx-a11y/no-autofocus -- command palette focuses its field */
/* oxlint-disable react/set-state-in-effect -- dev-only prototype: debounce and reset on open */
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Dialog, Drawer, Icon, SearchField, Skeleton, useToast, type IconName } from '../../shared/ui';
import { INCIDENTS } from './data';
import { SEARCH_POSTS, SEARCH_PUBLICATIONS } from './preview-data';
import { DemoChip, Tag } from './preview-kit';
import { PREVIEW_ITEMS } from './PreviewNav';
import { useNarrow, useProtoNavigate, type ProtoSearch } from './proto-kit';
import { useProtoStore } from './proto-store';
import styles from './Palette.module.css';

type Row = { id: string; group: string; icon: IconName; label: string; hint?: string; tag?: string; run: () => void };
export type PaletteVariant = 'typing' | 'none' | 'loading' | 'offline' | undefined;

const SECTIONS = [
  { path: '', label: 'Обзор', icon: 'home' as const },
  { path: 'posts', label: 'Посты', icon: 'file' as const },
  { path: 'publications', label: 'Публикации', icon: 'send' as const },
  { path: 'incidents', label: 'Инциденты', icon: 'alert' as const },
  { path: 'settings/channels', label: 'Настройки', icon: 'settings' as const }
];

type Props = { isOpen: boolean; onOpenChange: (open: boolean) => void; variant?: PaletteVariant };

export function PreviewPalette({ isOpen, onOpenChange, variant }: Props) {
  const narrow = useNarrow();
  const go = useProtoNavigate();
  const toast = useToast();
  const { offline } = useProtoStore();
  const initial = variant === 'typing' || variant === 'loading' ? 'патч' : variant === 'none' ? 'зюзя' : '';
  const [query, setQuery] = useState(initial);
  const [settled, setSettled] = useState(initial);
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (isOpen) {
      setQuery(initial);
      setSettled(initial);
      setActive(0);
    }
  }, [isOpen, initial]);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(query), 150);
    return () => clearTimeout(timer);
  }, [query]);

  const isOffline = offline || variant === 'offline';
  const loading = variant === 'loading' || query !== settled;
  const close = () => onOpenChange(false);
  const nav = (path: string, search?: ProtoSearch) => () => {
    close();
    go(path, search);
  };
  const demo = () => {
    close();
    toast.show({ title: 'Превью: такого объекта нет в демо-данных', tone: 'info' });
  };

  const rows = useMemo(() => {
    const needle = (variant === 'none' ? 'зюзя' : settled).trim().toLowerCase();
    const match = (text: string) => !needle || text.toLowerCase().includes(needle);
    const sections: Row[] = [
      ...SECTIONS.map((s) => ({ id: `s-${s.path}`, group: 'Разделы', icon: s.icon, label: s.label, run: nav(s.path) })),
      ...PREVIEW_ITEMS.map((s) => ({
        id: `s-${s.path}`,
        group: 'Разделы',
        icon: s.icon,
        label: s.label,
        tag: 'Превью',
        run: nav(s.path)
      }))
    ].filter((row) => match(row.label));
    const list: Row[] = [];
    if (!needle) {
      list.push(
        { id: 'r1', group: 'Недавнее', icon: 'send', label: 'Публикации', hint: 'Раздел', run: nav('publications') },
        {
          id: 'r2',
          group: 'Недавнее',
          icon: 'file',
          label: 'Патч 7.37: что изменилось у героев',
          hint: 'Пост',
          run: nav('posts/p4')
        }
      );
    }
    list.push(...sections.slice(0, 3));
    if (needle && !isOffline) {
      list.push(
        ...SEARCH_POSTS.filter((p) => match(p.title))
          .slice(0, 3)
          .map((p) => ({
            id: `p-${p.id}`,
            group: 'Посты',
            icon: 'file' as const,
            label: p.title,
            hint: p.hint,
            run: nav(`posts/${p.id}`)
          })),
        ...SEARCH_PUBLICATIONS.filter((p) => match(p.title))
          .slice(0, 3)
          .map((p) => ({
            id: `u-${p.id}`,
            group: 'Публикации',
            icon: 'send' as const,
            label: p.title,
            hint: p.hint,
            run: p.id === 'u1' || p.id === 'u4' ? nav('publications', { id: p.id }) : demo
          })),
        ...INCIDENTS.filter((i) => match(i.reason))
          .slice(0, 2)
          .map((i) => ({
            id: `i-${i.id}`,
            group: 'Инциденты',
            icon: 'alert' as const,
            label: i.reason,
            hint: i.kind === 'unknown' ? 'Требует проверки' : 'Ошибка',
            run: nav('incidents')
          }))
      );
    }
    if (match('новый пост'))
      list.push({ id: 'a1', group: 'Действия', icon: 'plus', label: 'Новый пост', run: nav('posts/new') });
    return list.slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, isOffline, variant]);

  const groups = [...new Set(rows.map((row) => row.group))];
  const showEntities = Boolean(settled.trim()) || loading;
  const none = rows.length === 0 && !loading;
  const flat = rows;
  const current = Math.min(active, Math.max(flat.length - 1, 0));
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current + 1) % Math.max(flat.length, 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current - 1 + flat.length) % Math.max(flat.length, 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      flat[current]?.run();
    }
  };

  const content = (
    <div className={styles.palette}>
      <SearchField
        label="Куда перейти"
        placeholder="Посты, публикации, настройки"
        value={query}
        onChange={(v) => {
          setQuery(v);
          setActive(0);
        }}
        onKeyDown={onKey}
        autoFocus
      />
      <div className={styles.results} aria-live="polite">
        {none ? (
          <p className={styles.none}>Ничего не найдено. Попробуйте название поста или канал.</p>
        ) : (
          groups.map((group) => (
            <section key={group} aria-label={group}>
              <h3 className={styles.group}>
                {group}
                {group === 'Посты' || group === 'Публикации' ? <DemoChip /> : null}
              </h3>
              <ul className={styles.list}>
                {rows
                  .filter((row) => row.group === group)
                  .map((row) => {
                    const isActive = flat[current]?.id === row.id;
                    return (
                      <li key={row.id}>
                        <button
                          type="button"
                          className={styles.row}
                          data-active={isActive || undefined}
                          onClick={row.run}
                          onPointerEnter={() => setActive(flat.indexOf(row))}
                        >
                          <Icon name={row.icon} size={18} />
                          <span className={styles.label}>{row.label}</span>
                          {row.tag ? <Tag>{row.tag}</Tag> : null}
                          {row.hint ? <span className={styles.hint}>{row.hint}</span> : null}
                          {isActive && !narrow ? <kbd className={styles.enter}>Enter</kbd> : null}
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))
        )}
        {showEntities && loading ? (
          <section aria-label="Поиск по постам" aria-busy="true">
            <h3 className={styles.group}>Посты и публикации</h3>
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className={styles.skeletonRow}>
                <Skeleton height={14} width={index % 2 ? '55%' : '75%'} />
              </div>
            ))}
          </section>
        ) : null}
        {showEntities && isOffline ? (
          <p className={styles.offline}>
            <Icon name="alert" size={16} /> Поиск по постам недоступен без сети. Разделы работают.
          </p>
        ) : null}
        {!showEntities && !isOffline ? null : null}
      </div>
      {narrow ? null : <p className={styles.footer}>↑↓ выбрать · Enter открыть · Esc закрыть</p>}
    </div>
  );
  return narrow ? (
    <Drawer variant="side" isOpen={isOpen} onOpenChange={onOpenChange} title="Быстрый переход">
      {content}
    </Drawer>
  ) : (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} title="Быстрый переход">
      {content}
    </Dialog>
  );
}
