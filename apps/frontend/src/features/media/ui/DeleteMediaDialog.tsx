import { useQueries } from '@tanstack/react-query';
import { ApiError } from '../../../shared/api/http-client';
import { ConfirmDialog, useToast } from '../../../shared/ui';
import { mediaUsageQueryOptions, useDeleteMedia, useHideMedia } from '../api/media-queries';
import { deleteVerdict, draftsSentence } from '../model/media-usage';

export type DeleteTarget = { id: string; fileName: string };

type Props = {
  /** The files to delete; `null` closes the dialog. */
  targets: readonly DeleteTarget[] | null;
  /** Already in «Скрытые»: hiding again is pointless, so a blocked file only gets an explanation. */
  inHiddenView: boolean;
  onClose: () => void;
  /** Ids the server confirmed gone. */
  onDeleted: (ids: string[]) => void;
};

const quote = (name: string) => `«${name}»`;

/**
 * Delete confirmation that reads the usage first and says exactly what will happen: which drafts lose the file,
 * which files are skipped and why. A file held by a published/approved post or a copy is never sent.
 */
export function DeleteMediaDialog({ targets, inHiddenView, onClose, onDeleted }: Props) {
  const list = targets ?? [];
  const usages = useQueries({ queries: list.map((target) => mediaUsageQueryOptions(target.id)) });
  const deleteMedia = useDeleteMedia();
  const hideMedia = useHideMedia();
  const toast = useToast();
  const pending = deleteMedia.isPending || hideMedia.isPending;
  const loading = usages.some((usage) => usage.isPending);
  const failed = usages.some((usage) => usage.isError);

  const verdicts = list.map((target, index) => {
    const data = usages[index]?.data;
    return { target, verdict: data ? deleteVerdict(data) : undefined };
  });
  const removable = verdicts.filter(({ verdict }) => verdict && verdict.kind !== 'blocked');
  const blocked = verdicts.flatMap(({ target, verdict }) =>
    verdict?.kind === 'blocked' ? [{ target, reasons: verdict.reasons }] : []
  );
  const withDrafts = verdicts.flatMap(({ target, verdict }) =>
    verdict?.kind === 'drafts' ? [{ target, drafts: verdict.drafts }] : []
  );
  const single = list.length === 1 ? list[0] : undefined;
  const blockedText = blocked
    .slice(0, 5)
    .map(({ target, reasons }) => `${quote(target.fileName)} — ${(reasons[0] ?? '').toLowerCase()}`)
    .join('; ');
  const blockedSentence = blocked.length
    ? `Не будут удалены: ${blockedText}${blocked.length > 5 ? ` и ещё ${blocked.length - 5}` : ''}.`
    : '';

  const close = () => {
    if (!pending) onClose();
  };
  const fail = (error: unknown, title: string) =>
    toast.show({
      title: error instanceof ApiError && error.status === 409 ? 'Файл нужен постам, поэтому он не удалён' : title,
      description: error instanceof ApiError && error.requestId ? `Запрос ${error.requestId}` : undefined,
      tone: 'error'
    });
  const remove = () => {
    deleteMedia.mutate(
      {
        ids: removable.map(({ target }) => target.id),
        detachDrafts: withDrafts.length > 0
      },
      {
        onSuccess: ({ deleted, inUse }) => {
          const skipped = blocked.length + inUse.length;
          toast.show({
            title: `Удалено файлов: ${deleted.length}`,
            description: skipped
              ? `Пропущено: ${skipped}. ${blockedSentence || 'Файл нужен постам или копии.'}`.trim()
              : undefined,
            tone: deleted.length ? 'success' : 'error'
          });
          onDeleted(deleted);
          onClose();
        },
        onError: (error) => {
          fail(error, 'Не удалось удалить файлы');
          onClose();
        }
      }
    );
  };
  const hide = () => {
    if (!single) return;
    hideMedia.mutate(
      { id: single.id, hidden: true },
      {
        onSuccess: () => {
          toast.show({ title: 'Скрыто из медиатеки', description: quote(single.fileName), tone: 'success' });
          onDeleted([single.id]);
          onClose();
        },
        onError: (error) => {
          fail(error, 'Не удалось скрыть файл');
          onClose();
        }
      }
    );
  };

  let title: string;
  let description: string;
  let confirmLabel = 'Да, удалить';
  let tone: 'danger' | 'default' = 'danger';
  let onConfirm = remove;
  let isPending = pending;
  const cancelLabel = 'Нет';

  if (loading) {
    title = single ? `Проверяем, где используется ${quote(single.fileName)}…` : 'Проверяем, где используются файлы…';
    description = 'Удалять пока нечего: сначала нужно узнать, какие посты держат файл.';
    isPending = true;
  } else if (failed) {
    title = 'Не удалось проверить, где используется файл';
    description = 'Ничего не удалено. Повторите попытку.';
    confirmLabel = 'Да, повторить';
    tone = 'default';
    onConfirm = () => void Promise.all(usages.map((usage) => (usage.isError ? usage.refetch() : undefined)));
  } else if (removable.length === 0) {
    const why = single ? `${(blocked[0]?.reasons ?? []).join('. ')}.` : blockedSentence;
    if (single && !inHiddenView) {
      title = `Скрыть ${quote(single.fileName)} из медиатеки?`;
      description = `Удалить нельзя. ${why} Скрытый файл остаётся в постах и виден в фильтре «Скрытые».`;
      confirmLabel = 'Да, скрыть';
      onConfirm = hide;
    } else {
      title = single ? `Удалить ${quote(single.fileName)} нельзя` : 'Выбранные файлы удалить нельзя';
      description = why;
      confirmLabel = 'Да, понятно';
      onConfirm = onClose;
    }
    tone = 'default';
  } else if (single) {
    title = `Удалить ${quote(single.fileName)}?`;
    const drafts = withDrafts[0]?.drafts;
    description = drafts
      ? `Файл будет убран из ${draftsSentence(drafts)}. После этого он будет удалён безвозвратно.`
      : 'Файл не используется ни в одном посте. Он будет удалён безвозвратно.';
  } else {
    title = `Удалить файлы: ${removable.length}?`;
    const parts = [
      withDrafts.length
        ? `Из черновиков будет убрано файлов: ${withDrafts.length}. Остальные не используются. Все они будут удалены безвозвратно.`
        : 'Файлы не используются ни в одном посте. Они будут удалены безвозвратно.',
      blockedSentence
    ];
    description = parts.filter(Boolean).join(' ');
  }

  return (
    <ConfirmDialog
      isOpen={targets !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      tone={tone}
      isPending={isPending}
      onConfirm={onConfirm}
    />
  );
}
