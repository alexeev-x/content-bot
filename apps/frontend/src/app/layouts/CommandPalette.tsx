import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Autocomplete, Collection, ListBox, ListBoxItem, ListBoxSection, Header } from 'react-aria-components';
import { postsInfiniteQueryOptions } from '../../features/posts';
import { publicationsPageQueryOptions } from '../../features/publications';
import { ru } from '../../shared/lib/ru';
import { Dialog, SearchField } from '../../shared/ui';
import styles from './CommandPalette.module.css';

type Props = { isOpen: boolean; onOpenChange: (open: boolean) => void };

type Entry = { id: string; label: string; hint?: string; go: () => void };

const DEBOUNCE_MS = 250;
const MAX_PER_GROUP = 5;

const formatWhen = (iso: string) =>
  new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso)
  );

/** The query is only sent for a settled, non-empty text; an unmounted palette sends nothing. */
function useSettled(value: string): string {
  const [settled, setSettled] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);
  return settled;
}

function PaletteBody({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const q = useSettled(text);
  const searching = q !== '';
  // Previous results stay on screen while the next text is fetched, so the list never blinks empty.
  const posts = useInfiniteQuery({
    ...postsInfiniteQueryOptions({ q }),
    enabled: searching,
    placeholderData: keepPreviousData
  });
  const publications = useQuery({
    ...publicationsPageQueryOptions({ q }),
    enabled: searching,
    placeholderData: keepPreviousData
  });

  const run = (go: () => void) => () => {
    onDone();
    go();
  };
  const needle = text.trim().toLowerCase();
  const actions: Entry[] = [
    { id: 'new-post', label: ru.nav.newPost, go: () => void navigate({ to: '/posts/new' }) },
    { id: 'publications', label: ru.nav.publications, go: () => void navigate({ to: '/publications' }) },
    { id: 'media', label: ru.nav.media, go: () => void navigate({ to: '/media' }) },
    { id: 'settings', label: ru.nav.settings, go: () => void navigate({ to: '/settings' }) }
  ].filter((entry) => entry.label.toLowerCase().includes(needle));

  const postEntries: Entry[] = (posts.data?.pages[0]?.items ?? []).slice(0, MAX_PER_GROUP).map((post) => ({
    id: `post-${post.id}`,
    label: post.title || ru.shell.palette.untitled,
    go: () => void navigate({ to: '/posts/$id', params: { id: post.id } })
  }));
  const publicationEntries: Entry[] = (publications.data?.items ?? []).slice(0, MAX_PER_GROUP).map((item) => ({
    id: `publication-${item.id}`,
    label: `${ru.shell.palette.publication} · ${ru.status[item.status]}`,
    hint: formatWhen(item.scheduledAt),
    go: () => void navigate({ to: '/publications', search: { id: item.id } })
  }));

  const pending = searching && (posts.isPending || publications.isPending);
  const failed = searching && (posts.isError || publications.isError);
  const groups = [
    { id: 'actions', title: ru.shell.palette.actions, items: actions },
    { id: 'posts', title: ru.shell.palette.posts, items: postEntries },
    { id: 'publications', title: ru.shell.palette.publications, items: publicationEntries }
  ].filter((group) => group.items.length > 0);
  const byId = new Map(groups.flatMap((group) => group.items).map((entry) => [entry.id, entry]));

  return (
    <Autocomplete filter={() => true} inputValue={text} onInputChange={setText}>
      {/* Intentional: the palette has one task, and its field is where it starts. */}
      {/* oxlint-disable-next-line jsx-a11y/no-autofocus */}
      <SearchField label={ru.shell.palette.label} placeholder={ru.shell.palette.placeholder} autoFocus />
      <output className={styles.status}>
        {pending ? ru.shell.palette.loading : failed ? ru.shell.palette.error : ''}
      </output>
      <ListBox
        aria-label={ru.shell.palette.title}
        className={styles.list}
        onAction={(key) => {
          const entry = byId.get(String(key));
          if (entry) run(entry.go)();
        }}
        renderEmptyState={() => <p className={styles.empty}>{pending ? '' : ru.shell.palette.empty}</p>}
      >
        {groups.map((group) => (
          <ListBoxSection key={group.id} className={styles.section}>
            <Header className={styles.header}>{group.title}</Header>
            <Collection items={group.items}>
              {(entry) => (
                <ListBoxItem id={entry.id} textValue={entry.label} className={styles.item}>
                  <span className={styles.label}>{entry.label}</span>
                  {entry.hint ? <span className={styles.hint}>{entry.hint}</span> : null}
                </ListBoxItem>
              )}
            </Collection>
          </ListBoxSection>
        ))}
      </ListBox>
    </Autocomplete>
  );
}

export function CommandPalette({ isOpen, onOpenChange }: Props) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} title={ru.shell.palette.title}>
      <PaletteBody onDone={() => onOpenChange(false)} />
    </Dialog>
  );
}
