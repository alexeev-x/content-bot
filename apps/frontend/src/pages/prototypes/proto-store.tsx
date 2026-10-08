import { useProtoSearch } from './proto-kit';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CHANNELS,
  INCIDENTS,
  NOW,
  POSTS,
  PUBLICATIONS,
  type Channel,
  type Incident,
  type Post,
  type Publication
} from './data';

export type ResolveChoice = 'sent' | 'resend' | 'drop';

type Store = {
  posts: Post[];
  publications: Publication[];
  incidents: Incident[];
  channels: Channel[];
  /** Global prototype switches (floating panel). */
  botProblem: boolean;
  setBotProblem: (value: boolean) => void;
  offline: boolean;
  setOffline: (value: boolean) => void;
  createPost: (title: string, body: string) => string;
  updatePost: (id: string, patch: Partial<Post>) => void;
  /** Server round trip is faked with a delay: nothing changes before it resolves. */
  approvePost: (id: string) => Promise<void>;
  returnToDraft: (id: string) => void;
  deletePosts: (ids: readonly string[]) => void;
  restorePost: (id: string) => void;
  publish: (input: { postId: string; channelId: string; at: number | null }) => Promise<Publication>;
  reschedule: (id: string, at: number) => Promise<void>;
  cancelPublication: (id: string) => Promise<void>;
  resolveUnknown: (id: string, choice: ResolveChoice, at?: number) => Promise<void>;
  closeIncident: (id: string) => void;
  addChannel: (channel: Channel) => void;
  updateChannel: (id: string, patch: Partial<Channel>) => void;
};

const StoreContext = createContext<Store | null>(null);

export function useProtoStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useProtoStore outside ProtoProvider');
  return store;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const LATENCY = 900;

export function ProtoProvider({ children }: { children: ReactNode }) {
  const [posts, setPosts] = useState<Post[]>(POSTS);
  const [publications, setPublications] = useState<Publication[]>(PUBLICATIONS);
  const [incidents, setIncidents] = useState<Incident[]>(INCIDENTS);
  const [channels, setChannels] = useState<Channel[]>(CHANNELS);
  const [botProblem, setBotProblem] = useState(false);
  const [offline, setOffline] = useState(false);
  const counter = useRef(100);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const live = timers.current;
    return () => live.forEach(clearTimeout);
  }, []);

  const later = useCallback((ms: number, run: () => void) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      run();
    }, ms);
    timers.current.add(timer);
  }, []);

  const patchPublication = useCallback(
    (id: string, patch: Partial<Publication>) =>
      setPublications((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row))),
    []
  );

  const value = useMemo<Store>(() => {
    const nextId = (prefix: string) => `${prefix}${++counter.current}`;
    return {
      posts,
      publications,
      incidents,
      channels,
      botProblem,
      setBotProblem,
      offline,
      setOffline,
      createPost: (title, body) => {
        const id = nextId('p');
        setPosts((rows) => [{ id, title, body, state: 'draft', edited: 'сейчас', editedAt: Date.now() }, ...rows]);
        return id;
      },
      updatePost: (id, patch) =>
        setPosts((rows) => rows.map((row) => (row.id === id ? { ...row, edited: 'сейчас', ...patch } : row))),
      approvePost: async (id) => {
        await wait(LATENCY);
        setPosts((rows) => rows.map((row) => (row.id === id ? { ...row, state: 'approved' } : row)));
      },
      returnToDraft: (id) => setPosts((rows) => rows.map((row) => (row.id === id ? { ...row, state: 'draft' } : row))),
      deletePosts: (ids) =>
        setPosts((rows) =>
          rows.flatMap((row) =>
            !ids.includes(row.id) ? [row] : row.archived ? [] : [{ ...row, archived: true, daysLeft: 30 }]
          )
        ),
      restorePost: (id) => setPosts((rows) => rows.map((row) => (row.id === id ? { ...row, archived: false } : row))),
      publish: async ({ postId, channelId, at }) => {
        await wait(LATENCY);
        const id = nextId('u');
        const created: Publication = {
          id,
          postId,
          channelId,
          status: at === null ? 'queued' : 'scheduled',
          at: at ?? NOW,
          attempts: 0
        };
        setPublications((rows) => [created, ...rows]);
        setPosts((rows) =>
          rows.map((row) => (row.id === postId ? { ...row, state: at === null ? 'preparing' : 'scheduled' } : row))
        );
        if (at === null) {
          // «Опубликовано» appears only after the (faked) server reports it: queued, then sending, then sent.
          later(1200, () => patchPublication(id, { status: 'sending' }));
          later(2800, () => {
            patchPublication(id, { status: 'sent', messageId: String(4900 + counter.current) });
            setPosts((rows) => rows.map((row) => (row.id === postId ? { ...row, state: 'sent' } : row)));
          });
        }
        return created;
      },
      reschedule: async (id, at) => {
        await wait(LATENCY);
        patchPublication(id, { at });
      },
      cancelPublication: async (id) => {
        await wait(LATENCY);
        patchPublication(id, { status: 'cancelled' });
      },
      resolveUnknown: async (id, choice, at) => {
        await wait(LATENCY);
        if (choice === 'sent') patchPublication(id, { status: 'sent', messageId: '4833' });
        else if (choice === 'resend') patchPublication(id, { status: 'scheduled', at: at ?? NOW + 3_600_000 });
        else patchPublication(id, { status: 'cancelled' });
        setIncidents((rows) => rows.map((row) => (row.publicationId === id ? { ...row, open: false } : row)));
      },
      closeIncident: (id) => setIncidents((rows) => rows.map((row) => (row.id === id ? { ...row, open: false } : row))),
      addChannel: (channel) => setChannels((rows) => [...rows, channel]),
      updateChannel: (id, patch) =>
        setChannels((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
    };
  }, [posts, publications, incidents, channels, botProblem, offline, later, patchPublication]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/** The bot problem comes from the floating switch or from `?state=problem` (screenshots). */
export function useBotProblem(): boolean {
  const { botProblem } = useProtoStore();
  const state = useProtoSearch().state;
  return botProblem || state === 'problem';
}
