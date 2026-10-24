import {
  EMPTY_POLL,
  pollIssue,
  type PollIssue,
  type PostDto,
  type PostKind,
  type PostPoll,
  postRichHtml
} from '@alexeev/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { classifyApiError } from '../../../shared/api/error-kind';
import {
  postQueryOptions,
  useApprovePost,
  useCreatePost,
  useReturnPostToDraft,
  useUpdatePost
} from '../api/posts-queries';
import { postsCopy } from '../ui/copy';
import { messageLength, messageOverflow } from './message-length';
import { toEditorNotice, type EditorNotice } from './post-errors';
import { isPollBlank, samePoll } from './poll-model';
import { postFormSchema, type PostFormValues } from './post-form';

export type SaveState = 'new' | 'saved' | 'dirty' | 'saving' | 'failed';

/** `stale`: someone saved first (409 STALE_REVISION). `locked`: the post became approved (NOT_EDITABLE / ALREADY_APPROVED). */
export type EditorConflict = {
  kind: 'stale' | 'locked';
  server: PostDto | null;
  status: 'loading' | 'ready' | 'failed';
};

type Options = {
  /** Owned by the component: the root the first invalid field is looked up in, and the leave-guard flag. */
  rootRef: RefObject<HTMLElement | null>;
  dirtyRef: RefObject<boolean>;
  mediaWriteLock?: PostWriteLock;
  /** Server post for an existing record; undefined for a new draft. */
  post?: PostDto | undefined;
  onCreated?: ((post: PostDto) => void) | undefined;
  /** What a new post becomes on its first save: the tab the operator writes in. Fixed by the server afterwards. */
  createKind?: PostKind | undefined;
};

export type PostWriteLock = {
  isLocked: () => boolean;
  tryAcquire: () => boolean;
  release: () => void;
};

const EMPTY: PostFormValues = { title: '', body: '', entities: [] };
const valuesOf = (post: PostDto | null): PostFormValues =>
  post ? { title: post.title, body: post.body, entities: post.entities } : EMPTY;
// Entities are always in the contract's normal form on both sides, so a plain JSON comparison is exact.
const sameEntities = (a: PostFormValues['entities'], b: PostFormValues['entities']) =>
  JSON.stringify(a) === JSON.stringify(b);

/** What went to the server in one request, to tell later whether the operator kept editing meanwhile. */
type Sent = { poll: PostPoll };

/**
 * Editor state machine. The baseline is the last server-confirmed post; it only moves on a server success or an
 * explicit «take the server version», never from a background refetch, so local text is never replaced silently.
 */
export function usePostEditor({
  post,
  onCreated,
  rootRef,
  dirtyRef,
  mediaWriteLock: externalMediaWriteLock,
  createKind = 'text'
}: Options) {
  const mediaWriteLock = externalMediaWriteLock ?? {
    isLocked: () => false,
    tryAcquire: () => true,
    release: () => undefined
  };
  const queryClient = useQueryClient();
  const create = useCreatePost();
  const update = useUpdatePost();
  const approve = useApprovePost();
  const returnToDraftMutation = useReturnPostToDraft();

  const [baseline, setBaseline] = useState<PostDto | null>(post ?? null);
  const baselineRef = useRef<PostDto | null>(post ?? null);
  const [conflict, setConflict] = useState<EditorConflict | null>(null);
  const [notice, setNotice] = useState<EditorNotice | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [justApproved, setJustApproved] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const [mediaPending, setMediaPending] = useState(false);

  // A poll is a small object replaced as a whole; refs keep the live value readable after an await.
  const [poll, setPollState] = useState<PostPoll>(post?.poll ?? EMPTY_POLL);
  const pollRef = useRef(poll);
  const setPoll = (next: PostPoll) => {
    pollRef.current = next;
    setPollState(next);
  };

  const form = useForm<PostFormValues>({
    resolver: zodResolver(postFormSchema),
    defaultValues: valuesOf(post ?? null),
    mode: 'onSubmit',
    reValidateMode: 'onChange'
  });
  const [title = '', body = '', entities = []] = useWatch({
    control: form.control,
    name: ['title', 'body', 'entities']
  });

  // No title field (owner, 16.10.2026): a new post is created without one and sends only its text. Only an older
  // post that was given a title keeps it (and the field) — it still goes out as the bold first line.
  const kind: PostKind = baseline?.kind ?? createKind;
  const hasTitle = baseline?.kind !== 'poll' && baseline?.titleInMessage === true;
  const sentTitle = hasTitle ? title : '';

  const base = valuesOf(baseline);
  const basePoll = baseline?.poll ?? EMPTY_POLL;
  const textDirty = title !== base.title || body !== base.body || !sameEntities(entities, base.entities);
  const pollDirty = !samePoll(poll, basePoll);
  const dirty = textDirty || pollDirty;
  const changeKey = JSON.stringify([title, body, entities, poll]);
  // Before the first save one post cannot be both: typed text plus a typed poll waits for the operator to pick one.
  const mixed = baseline === null && body.trim() !== '' && !isPollBlank(poll);
  const issue: PollIssue | null = kind === 'poll' ? pollIssue(poll) : null;
  const failed = failedKey === changeKey;
  // A rich post is edited as its text and rebuilt as it is typed, as the server rebuilds it on save (owner, 24.10.2026:
  // «пару слов поправить»). A text that lost the structure is not saved: the old version stays until it is mended.
  const isRich = baseline?.richHtml != null;
  const liveRichHtml = isRich ? postRichHtml(body, entities) : null;
  const richLost = isRich && liveRichHtml === null;
  const readOnly = baseline?.status === 'approved' || conflict?.kind === 'locked';
  // A caption holds 1024 characters, a message 4096. A rich post goes as one message with its pictures inside, so it
  // has no caption (owner, 24.10.2026: a rich post with a picture was called over the limit and went out fine).
  const messageLimit = !isRich && baseline?.media.length ? 1024 : 4096;
  const isSaving = create.isPending || update.isPending;
  const isApproving = approve.isPending;
  const isBusy = isSaving || isApproving || mediaPending;

  useEffect(() => {
    dirtyRef.current = (dirty || mediaPending) && !readOnly;
  }, [dirty, mediaPending, readOnly, dirtyRef]);

  // Focus the first invalid field after the errors have rendered.
  useEffect(() => {
    if (focusTick > 0) rootRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusTick, rootRef]);

  const saveState: SaveState = isSaving
    ? 'saving'
    : dirty
      ? failed
        ? 'failed'
        : 'dirty'
      : baseline === null
        ? 'new'
        : 'saved';

  /** Adopts a server post as the new baseline. A field edited while the request was in flight keeps the newer text. */
  function adopt(saved: PostDto, submitted: PostFormValues | null, sent: Sent | null = null) {
    baselineRef.current = saved;
    setBaseline(saved);
    // Like the text: a poll changed while the request was in flight keeps the newer value.
    setPoll(sent === null || samePoll(pollRef.current, sent.poll) ? (saved.poll ?? EMPTY_POLL) : pollRef.current);
    const current = form.getValues();
    form.reset({
      title: submitted === null || current.title === submitted.title ? saved.title : current.title,
      body: submitted === null || current.body === submitted.body ? saved.body : current.body,
      entities:
        submitted === null || sameEntities(current.entities, submitted.entities) ? saved.entities : current.entities
    });
    setFailedKey(null);
    setNotice(null);
  }

  function loadServerVersion(id: string, kind: EditorConflict['kind']) {
    setConflict({ kind, server: null, status: 'loading' });
    // staleTime 0: the comparison must show what the server holds now, not a cached copy.
    queryClient
      .fetchQuery({ ...postQueryOptions(id), staleTime: 0 })
      .then((server) => setConflict({ kind, server, status: 'ready' }))
      .catch(() => setConflict({ kind, server: null, status: 'failed' }));
  }

  /** Returns true when the error was a conflict or a lock (shown as a banner, not a notice). */
  function handleError(error: unknown, id: string | null, noticeTitle: string): void {
    const kind = classifyApiError(error);
    if (id !== null && kind === 'stale_revision') return loadServerVersion(id, 'stale');
    if (id !== null && (kind === 'not_editable' || kind === 'already_approved')) return loadServerVersion(id, 'locked');
    setFailedKey(changeKey);
    setNotice(toEditorNotice(error, noticeTitle));
  }

  async function validate(): Promise<boolean> {
    const ok = await form.trigger();
    if (!ok) setFocusTick((tick) => tick + 1);
    return ok;
  }

  /** Saves the form; resolves with the confirmed post, or null when invalid, blocked or rejected. */
  async function save(): Promise<PostDto | null> {
    if (isBusy || readOnly || mixed || richLost || (baseline !== null && !dirty) || !mediaWriteLock.tryAcquire())
      return null;
    try {
      if (!(await validate())) return null;
      const submitted = form.getValues();
      // Nothing written yet: no empty draft (the required title used to stop this; media go through
      // ensureDraftForMedia).
      const sent: Sent = { poll: pollRef.current };
      if (baseline === null && (kind === 'poll' ? isPollBlank(sent.poll) : submitted.body.trim() === '')) return null;
      try {
        if (baseline === null) {
          const created = await create.mutateAsync(
            kind === 'poll' ? { kind: 'poll', poll: sent.poll } : { body: submitted.body, entities: submitted.entities }
          );
          // The navigation that follows must not trip the leave guard for the draft we just stored.
          dirtyRef.current = false;
          adopt(created, submitted, sent);
          onCreated?.(created);
          return created;
        }
        const textChanged = submitted.body !== base.body || !sameEntities(submitted.entities, base.entities);
        const saved = await update.mutateAsync({
          id: baseline.id,
          input: {
            revision: baseline.revision,
            ...(hasTitle && submitted.title !== base.title ? { title: submitted.title } : {}),
            // The server refuses a body without its entities, and offsets only mean something next to their text.
            ...(textChanged && baseline.kind === 'text' ? { body: submitted.body, entities: submitted.entities } : {}),
            ...(baseline.kind === 'poll' && !samePoll(sent.poll, basePoll) ? { poll: sent.poll } : {})
          }
        });
        adopt(saved, submitted, sent);
        return saved;
      } catch (error) {
        handleError(error, baseline?.id ?? null, postsCopy.editor.errors.saveTitle);
        return null;
      }
    } finally {
      mediaWriteLock.release();
    }
  }

  /** Creates a visible, editable-title draft when the first media is chosen; never sends it to Telegram. */
  async function ensureDraftForMedia(): Promise<PostDto | null> {
    if (baseline) return baseline;
    // A queued local file marks media pending before confirmation; that state must not block its own draft creation.
    if (isSaving || isApproving || readOnly || mixed || conflict !== null || !mediaWriteLock.tryAcquire()) return null;
    try {
      const valid = await form.trigger();
      if (!valid) {
        setFocusTick((tick) => tick + 1);
        return null;
      }
      const values = form.getValues();
      try {
        const sent: Sent = { poll: pollRef.current };
        const created = await create.mutateAsync({ body: values.body, entities: values.entities });
        adopt(created, values, sent);
        return created;
      } catch (error) {
        handleError(error, null, postsCopy.editor.errors.saveTitle);
        return null;
      }
    } finally {
      mediaWriteLock.release();
    }
  }

  /** Explicit «overwrite with mine»: refetch the revision, then save on top of it. Never automatic. */
  async function overwrite(): Promise<void> {
    if (baseline === null || isBusy || mediaWriteLock.isLocked() || !(await validate())) return;
    const submitted = form.getValues();
    try {
      const fresh = await queryClient.fetchQuery({ ...postQueryOptions(baseline.id), staleTime: 0 });
      if (fresh.status === 'approved') {
        setConflict({ kind: 'locked', server: fresh, status: 'ready' });
        return;
      }
      const sent: Sent = { poll: pollRef.current };
      const saved = await update.mutateAsync({
        id: baseline.id,
        input: {
          revision: fresh.revision,
          ...(baseline.kind === 'poll'
            ? { poll: sent.poll }
            : {
                ...(hasTitle ? { title: submitted.title } : {}),
                body: submitted.body,
                entities: submitted.entities
              })
        }
      });
      setConflict(null);
      adopt(saved, submitted, sent);
    } catch (error) {
      handleError(error, baseline.id, postsCopy.editor.errors.saveTitle);
    }
  }

  function acceptServer(): void {
    if (conflict?.server) {
      adopt(conflict.server, null);
      setConflict(null);
    }
  }

  function adoptMedia(revision: number, media: PostDto['media']): void {
    const current = baselineRef.current;
    if (current === null) return;
    const next = { ...current, revision, media };
    baselineRef.current = next;
    setBaseline(next);
    queryClient.setQueryData(postQueryOptions(next.id).queryKey, next);
  }

  /** Media-only changes are server-confirmed before their new-post redirect; retain any text typed meanwhile. */
  function syncLeaveGuardAfterMediaSave(): void {
    const current = form.getValues();
    const saved = valuesOf(baselineRef.current);
    dirtyRef.current =
      current.title !== saved.title ||
      current.body !== saved.body ||
      !sameEntities(current.entities, saved.entities) ||
      pollDirty;
  }

  function retryServerVersion(): void {
    if (conflict && baseline) loadServerVersion(baseline.id, conflict.kind);
  }

  /** Starts a server comparison after a media endpoint rejects a stale post revision. */
  function markMediaConflict(): void {
    if (baseline) loadServerVersion(baseline.id, 'stale');
  }

  /** Approves the saved text; unsaved edits are saved first so the approved revision is the one on screen. */
  async function approvePost(): Promise<PostDto | null> {
    if (isBusy || mediaWriteLock.isLocked() || readOnly || mediaPending) return null;
    let current = baseline;
    if (current === null || dirty) {
      const saved = await save();
      if (saved === null) return null;
      current = saved;
    }
    try {
      const approved = await approve.mutateAsync({ id: current.id, input: { revision: current.revision } });
      adopt(approved, null);
      setJustApproved(true);
      return approved;
    } catch (error) {
      if (classifyApiError(error) === 'empty_body') {
        form.setError('body', { type: 'server', message: postsCopy.editor.validation.emptyBody });
        setFocusTick((tick) => tick + 1);
      } else {
        handleError(error, current.id, postsCopy.editor.errors.approveTitle);
      }
      return null;
    }
  }

  /** Reopens an approved post for editing; the server refuses while a publication is active. */
  async function returnToDraft(): Promise<PostDto | null> {
    if (!baseline || returnToDraftMutation.isPending) return null;
    try {
      const draft = await returnToDraftMutation.mutateAsync({
        id: baseline.id,
        input: { revision: baseline.revision }
      });
      adopt(draft, null);
      setConflict(null);
      return draft;
    } catch (error) {
      setNotice(toEditorNotice(error, postsCopy.actions.returnToDraft));
      return null;
    }
  }

  return {
    returnToDraft,
    isReturning: returnToDraftMutation.isPending,
    form,
    title,
    body,
    entities,
    baseline,
    isNew: baseline === null,
    dirty,
    readOnly,
    changeKey,
    hasTitle,
    kind,
    poll,
    setPoll,
    pollIssue: issue,
    mixed,
    /** The rich post as the typed text rebuilds it (the stored one while the text has lost the structure). */
    richHtml: isRich ? (liveRichHtml ?? baseline?.richHtml ?? null) : null,
    richLost,
    canAutosave:
      (baseline !== null || (kind === 'poll' ? !isPollBlank(poll) : body.trim().length > 0)) &&
      !mixed &&
      !richLost &&
      dirty &&
      !readOnly &&
      conflict === null &&
      !isBusy &&
      !mediaWriteLock.isLocked() &&
      !failed &&
      postFormSchema.safeParse({ title, body, entities }).success,
    saveState,
    isSaving,
    isApproving,
    conflict,
    notice,
    dismissNotice: () => setNotice(null),
    justApproved,
    mediaPending,
    setMediaPending,
    adoptMedia,
    length: messageLength(sentTitle, body),
    messageLimit,
    overflow: messageOverflow(sentTitle, body, messageLimit),
    save,
    ensureDraftForMedia,
    approvePost,
    overwrite,
    acceptServer,
    retryServerVersion,
    markMediaConflict,
    syncLeaveGuardAfterMediaSave
  };
}
