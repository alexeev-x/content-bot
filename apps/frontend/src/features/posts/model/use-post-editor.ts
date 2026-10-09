import type { PostDto } from '@alexeev/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type RefObject } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { classifyApiError } from '../../../shared/api/error-kind';
import { postQueryOptions, useApprovePost, useCreatePost, useUpdatePost } from '../api/posts-queries';
import { postsCopy } from '../ui/copy';
import { messageLength, messageOverflow } from './message-length';
import { toEditorNotice, type EditorNotice } from './post-errors';
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
  /** Server post for an existing record; undefined for a new draft. */
  post?: PostDto | undefined;
  onCreated?: ((post: PostDto) => void) | undefined;
};

const EMPTY: PostFormValues = { title: '', body: '', entities: [] };
const makeDefaultTitle = () => `Публикация от ${new Intl.DateTimeFormat('ru-RU').format(new Date())}`;
const valuesOf = (post: PostDto | null): PostFormValues =>
  post ? { title: post.title, body: post.body, entities: post.entities } : EMPTY;
// Entities are always in the contract's normal form on both sides, so a plain JSON comparison is exact.
const sameEntities = (a: PostFormValues['entities'], b: PostFormValues['entities']) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Editor state machine. The baseline is the last server-confirmed post; it only moves on a server success or an
 * explicit «take the server version», never from a background refetch, so local text is never replaced silently.
 */
export function usePostEditor({ post, onCreated, rootRef, dirtyRef }: Options) {
  const queryClient = useQueryClient();
  const create = useCreatePost();
  const update = useUpdatePost();
  const approve = useApprovePost();

  const [baseline, setBaseline] = useState<PostDto | null>(post ?? null);
  const [conflict, setConflict] = useState<EditorConflict | null>(null);
  const [notice, setNotice] = useState<EditorNotice | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [justApproved, setJustApproved] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const [mediaPending, setMediaPending] = useState(false);

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

  useEffect(() => {
    if (baseline === null && body.trim().length > 0 && title.trim().length === 0) {
      form.setValue('title', makeDefaultTitle(), { shouldDirty: true, shouldValidate: true });
    }
  }, [baseline, body, form, title]);

  const base = valuesOf(baseline);
  const dirty = title !== base.title || body !== base.body || !sameEntities(entities, base.entities);
  const changeKey = JSON.stringify([title, body, entities]);
  const failed = failedKey === changeKey;
  const readOnly = baseline?.status === 'approved' || conflict?.kind === 'locked';
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
  function adopt(saved: PostDto, submitted: PostFormValues | null) {
    setBaseline(saved);
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
    if (isBusy || readOnly || (baseline !== null && !dirty)) return null;
    if (!(await validate())) return null;
    const submitted = form.getValues();
    try {
      if (baseline === null) {
        const created = await create.mutateAsync({
          title: submitted.title,
          body: submitted.body,
          entities: submitted.entities
        });
        // The navigation that follows must not trip the leave guard for the draft we just stored.
        dirtyRef.current = false;
        adopt(created, submitted);
        onCreated?.(created);
        return created;
      }
      const textChanged = submitted.body !== base.body || !sameEntities(submitted.entities, base.entities);
      const saved = await update.mutateAsync({
        id: baseline.id,
        input: {
          revision: baseline.revision,
          ...(submitted.title !== base.title ? { title: submitted.title } : {}),
          // The server refuses a body without its entities, and offsets only mean something next to their text.
          ...(textChanged ? { body: submitted.body, entities: submitted.entities } : {})
        }
      });
      adopt(saved, submitted);
      return saved;
    } catch (error) {
      handleError(error, baseline?.id ?? null, postsCopy.editor.errors.saveTitle);
      return null;
    }
  }

  /** Creates a visible, editable-title draft when the first media is chosen; never sends it to Telegram. */
  async function ensureDraftForMedia(): Promise<PostDto | null> {
    if (baseline) return baseline;
    if (isBusy || readOnly || conflict !== null) return null;
    const submitted = form.getValues();
    const title = submitted.title.trim() || makeDefaultTitle();
    if (title !== submitted.title) form.setValue('title', title, { shouldDirty: true, shouldValidate: true });
    const valid = await form.trigger();
    if (!valid) {
      setFocusTick((tick) => tick + 1);
      return null;
    }
    const values = form.getValues();
    try {
      const created = await create.mutateAsync({ title: values.title, body: values.body, entities: values.entities });
      adopt(created, values);
      return created;
    } catch (error) {
      handleError(error, null, postsCopy.editor.errors.saveTitle);
      return null;
    }
  }

  /** Explicit «overwrite with mine»: refetch the revision, then save on top of it. Never automatic. */
  async function overwrite(): Promise<void> {
    if (baseline === null || isBusy || !(await validate())) return;
    const submitted = form.getValues();
    try {
      const fresh = await queryClient.fetchQuery({ ...postQueryOptions(baseline.id), staleTime: 0 });
      if (fresh.status === 'approved') {
        setConflict({ kind: 'locked', server: fresh, status: 'ready' });
        return;
      }
      const saved = await update.mutateAsync({
        id: baseline.id,
        input: {
          revision: fresh.revision,
          title: submitted.title,
          body: submitted.body,
          entities: submitted.entities
        }
      });
      setConflict(null);
      adopt(saved, submitted);
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
    if (baseline === null) return;
    const next = { ...baseline, revision, media };
    setBaseline(next);
    queryClient.setQueryData(postQueryOptions(next.id).queryKey, next);
  }

  function retryServerVersion(): void {
    if (conflict && baseline) loadServerVersion(baseline.id, conflict.kind);
  }

  /** Approves the saved text; unsaved edits are saved first so the approved revision is the one on screen. */
  async function approvePost(): Promise<PostDto | null> {
    if (isBusy || readOnly || mediaPending) return null;
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

  return {
    form,
    title,
    body,
    entities,
    baseline,
    isNew: baseline === null,
    dirty,
    readOnly,
    changeKey,
    canAutosave:
      (baseline !== null || title.trim().length > 0) &&
      dirty &&
      !readOnly &&
      conflict === null &&
      !isBusy &&
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
    length: messageLength(title, body),
    messageLimit: baseline?.media.length ? 1024 : 4096,
    overflow: messageOverflow(title, body, baseline?.media.length ? 1024 : 4096),
    save,
    ensureDraftForMedia,
    approvePost,
    overwrite,
    acceptServer,
    retryServerVersion
  };
}
