import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ListBox, ListBoxItem } from 'react-aria-components';
import { ApiError } from '../../../shared/api/http-client';
import { Button, Dialog, EmptyState, ErrorState, SearchField, Skeleton, useToast } from '../../../shared/ui';
import { draftQueryOptions, draftsInfiniteQueryOptions, mediaKeys, useAttachMedia } from '../api/media-queries';
import { formatDate } from './media-format';
import styles from './MediaLibrary.module.css';

export function AttachDialog({
  open,
  onOpenChange,
  mediaIds,
  onAttached,
  onCreatePost,
  onLogin
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaIds: string[];
  onAttached: () => void;
  onCreatePost: () => void;
  onLogin: () => void;
}) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const drafts = useInfiniteQuery({
    ...draftsInfiniteQueryOptions(query),
    enabled: open,
    placeholderData: (previous) => previous
  });
  const [draftId, setDraftId] = useState<string>();
  const draft = useQuery({ ...draftQueryOptions(draftId ?? ''), enabled: open && Boolean(draftId) });
  const attach = useAttachMedia();
  const toast = useToast();
  const queryClient = useQueryClient();
  const draftItems = drafts.data?.pages.flatMap((page) => page.items) ?? [];
  const target = draft.data;
  const overLimit = Boolean(target && target.media.length + mediaIds.length > 10);
  const attachError = attach.error;
  const conflict = attachError instanceof ApiError && attachError.status === 409 ? attachError : undefined;

  const refreshDraft = async () => {
    if (!draftId) return;
    await queryClient.invalidateQueries({ queryKey: mediaKeys.draft(draftId) });
    await draft.refetch();
    attach.reset();
  };

  const submit = async () => {
    if (!target || overLimit) return;
    try {
      await attach.mutateAsync({ postId: target.id, revision: target.revision, mediaIds });
      toast.show({ title: `Добавлено файлов: ${mediaIds.length}`, tone: 'success' });
      onAttached();
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) return;
    }
  };

  return (
    <Dialog
      isOpen={open}
      onOpenChange={onOpenChange}
      title="Выберите черновик"
      description={`Будет добавлено файлов: ${mediaIds.length}. Публикация не запускается.`}
      footer={
        <>
          <Button variant="secondary" onPress={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onPress={() => void submit()} isDisabled={!target || overLimit || attach.isPending}>
            Добавить в черновик
          </Button>
        </>
      }
    >
      <output className={styles.status} aria-live="polite" aria-atomic="true">
        {attach.isPending ? 'Добавляем файлы в черновик…' : draft.isFetching ? 'Обновляем черновик…' : ''}
      </output>
      {drafts.isPending ? <Skeleton height={120} /> : null}
      {drafts.isError ? (
        <ErrorState
          message="Не удалось загрузить черновики. Выбор файлов сохранён."
          requestId={drafts.error instanceof ApiError ? drafts.error.requestId : undefined}
          onRetry={() => void drafts.refetch()}
        />
      ) : null}
      <SearchField label="Найти черновик" placeholder="Найти черновик" value={search} onChange={setSearch} />
      {drafts.isSuccess && draftItems.length === 0 ? (
        query ? (
          <p className={styles.status}>Ничего не найдено</p>
        ) : (
          <EmptyState
            title="Нет доступных черновиков"
            description="Создайте черновик, затем вернитесь в медиатеку."
            action={
              <Button variant="secondary" onPress={onCreatePost}>
                Создать пост
              </Button>
            }
          />
        )
      ) : null}
      {draftItems.length ? (
        <div className={styles.dialogDrafts}>
          <ListBox
            aria-label="Черновики"
            className={styles.draftList}
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={draftId ? [draftId] : []}
            onSelectionChange={(keys) => {
              const [first] = keys === 'all' ? [] : [...keys];
              if (typeof first === 'string') {
                setDraftId(first);
                attach.reset();
              }
            }}
          >
            {draftItems.map((post) => (
              <ListBoxItem
                key={post.id}
                id={post.id}
                textValue={post.title || 'Без названия'}
                className={styles.draftButton}
              >
                <span className={styles.draftTitle}>{post.title || 'Без названия'}</span>
                <span className={styles.draftMeta}>
                  Изменён {formatDate(post.updatedAt)} · {post.media.length}/10
                </span>
              </ListBoxItem>
            ))}
          </ListBox>
          {drafts.hasNextPage ? (
            <Button
              variant="secondary"
              onPress={() => void drafts.fetchNextPage()}
              isDisabled={drafts.isFetchingNextPage}
            >
              Ещё черновики
            </Button>
          ) : null}
        </div>
      ) : null}
      {draftId && draft.isPending ? <output>Проверяем выбранный черновик…</output> : null}
      {draft.isError ? (
        <ErrorState
          message="Не удалось проверить черновик. Выбор файлов сохранён."
          requestId={draft.error instanceof ApiError ? draft.error.requestId : undefined}
          onRetry={() => void draft.refetch()}
        />
      ) : null}
      {target?.status !== 'draft' && target ? (
        <p role="alert">Этот пост больше не является черновиком. Выберите другой.</p>
      ) : null}
      {overLimit ? <p role="alert">В черновике не хватит места: максимум 10 файлов. Снимите часть выделения.</p> : null}
      {conflict ? (
        <div className={styles.conflict} role="alert">
          <span>
            Черновик изменился. Выбор файлов сохранён, пост не обновлён
            {conflict.requestId ? ` · запрос ${conflict.requestId}` : ''}.
          </span>
          <Button variant="secondary" onPress={() => void refreshDraft()} isDisabled={draft.isFetching}>
            Обновить черновик
          </Button>
        </div>
      ) : null}
      {attachError && !conflict ? (
        attachError instanceof ApiError && attachError.status === 401 ? (
          <ErrorState
            message="Сеанс завершён. Файлы не добавлены, выбор сохранён."
            requestId={attachError.requestId}
            action={
              <Button variant="secondary" onPress={onLogin}>
                Войти снова
              </Button>
            }
          />
        ) : (
          <ErrorState
            message="Не удалось добавить файлы. Выбор сохранён."
            requestId={attachError instanceof ApiError ? attachError.requestId : undefined}
          />
        )
      ) : null}
    </Dialog>
  );
}
