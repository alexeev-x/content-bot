import { MEDIA_PUBLICATION_IN_FLIGHT_REASON, type MediaUsageDto } from '@alexeev/contracts';
import { useQueries } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { Button, Dialog, useToast } from '../../../shared/ui';
import { mediaUsageQueryOptions, useDeleteMedia } from '../api/media-queries';
import {
  blockSentence,
  countScheduled,
  deleteBlock,
  derivativesSentence,
  postTitle,
  scheduledLine
} from '../model/media-usage';
import styles from './DeleteMediaDialog.module.css';

export type DeleteTarget = { id: string; fileName: string };

type Props = {
  /** The files to delete; `null` closes the dialog. */
  targets: readonly DeleteTarget[] | null;
  /** Owner timezone for the scheduled times. */
  timezone: string;
  onClose: () => void;
  /** Ids the server confirmed gone. */
  onDeleted: (ids: string[]) => void;
  onOpenPost: (postId: string) => void;
};

const quote = (name: string) => `«${name}»`;

function PostLinks({ posts, onOpen }: { posts: MediaUsageDto['drafts']; onOpen: (postId: string) => void }) {
  return (
    <ul>
      {posts.map((post) => (
        <li key={post.postId}>
          <Button variant="link" onPress={() => onOpen(post.postId)}>
            {postTitle(post.title)}
          </Button>
        </li>
      ))}
    </ul>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.group}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/** What deleting one file does, grouped by where it is used. The server cuts the file out of all of them. */
function UsageDetails({
  usage,
  timezone,
  onOpen
}: {
  usage: MediaUsageDto;
  timezone: string;
  onOpen: (postId: string) => void;
}) {
  const { drafts, scheduled, approved, sent } = usage;
  return (
    <>
      {drafts.length ? (
        <Group title="Уберётся из черновиков:">
          <PostLinks posts={drafts} onOpen={onOpen} />
        </Group>
      ) : null}
      {scheduled.length ? (
        <Group title="Уберётся из запланированных публикаций:">
          <ul>
            {scheduled.map((post) => (
              <li key={post.publicationId}>
                <Button variant="link" onPress={() => onOpen(post.postId)}>
                  {scheduledLine(post, timezone)}
                </Button>
                {post.wouldBeEmpty ? (
                  <p className={styles.note}>Публикация будет отменена — в ней ничего не останется.</p>
                ) : null}
              </li>
            ))}
          </ul>
        </Group>
      ) : null}
      {approved.length ? (
        <Group title="Уберётся из утверждённых постов:">
          <PostLinks posts={approved} onOpen={onOpen} />
        </Group>
      ) : null}
      {sent.length ? (
        <Group title="Опубликованные посты:">
          <PostLinks posts={sent} onOpen={onOpen} />
          <p className={styles.note}>В канале останется, в истории файла не будет.</p>
        </Group>
      ) : null}
      {usage.derivatives > 0 ? (
        <Group title="Обрезанные копии:">
          <p className={styles.note}>{derivativesSentence(usage.derivatives)}</p>
        </Group>
      ) : null}
    </>
  );
}

const isUsed = (usage: MediaUsageDto) =>
  usage.drafts.length + usage.scheduled.length + usage.approved.length + usage.sent.length + usage.derivatives > 0;

/**
 * Delete confirmation that reads the usage first and says exactly what will happen. Deleting is always possible
 * except while a publication is being sent, a crop still points at the file, or more than 20 drafts hold it.
 */
export function DeleteMediaDialog({ targets, timezone, onClose, onDeleted, onOpenPost }: Props) {
  const list = targets ?? [];
  const usages = useQueries({ queries: list.map((target) => mediaUsageQueryOptions(target.id)) });
  const deleteMedia = useDeleteMedia();
  const toast = useToast();
  const [inFlight, setInFlight] = useState(false);
  const pending = deleteMedia.isPending;
  const loading = usages.some((usage) => usage.isPending);
  const failed = usages.some((usage) => usage.isError);
  const single = list.length === 1 ? list[0] : undefined;
  const singleUsage = single ? usages[0]?.data : undefined;

  const rows = list.flatMap((target, index) => {
    const usage = usages[index]?.data;
    return usage ? [{ target, usage, block: deleteBlock(usage) }] : [];
  });
  const removable = rows.filter(({ block }) => block.kind === 'none');
  const blocked = rows.filter(({ block }) => block.kind !== 'none');
  const scheduledCount = countScheduled(removable.map(({ usage }) => usage));
  const draftFiles = removable.filter(({ usage }) => usage.drafts.length > 0).length;

  const close = () => {
    if (pending) return;
    setInFlight(false);
    onClose();
  };
  const open = (postId: string) => {
    setInFlight(false);
    onClose();
    onOpenPost(postId);
  };
  const fail = (error: unknown, title: string) =>
    toast.show({
      title,
      description: error instanceof ApiError && error.requestId ? `Запрос ${error.requestId}` : undefined,
      tone: 'error'
    });
  const recheck = () => void Promise.all(usages.map((usage) => usage.refetch()));

  const remove = () => {
    setInFlight(false);
    deleteMedia.mutate(
      { ids: removable.map(({ target }) => target.id) },
      {
        onSuccess: ({ deleted, inUse }) => {
          const skipped = blocked.length + inUse.length;
          toast.show({
            title: `Удалено файлов: ${deleted.length}`,
            description: skipped ? `Не удалено: ${skipped} (отправляется публикация или есть копии).` : undefined,
            tone: deleted.length ? 'success' : 'error'
          });
          onDeleted(deleted);
          onClose();
        },
        onError: (error) => {
          if (error instanceof ApiError && error.reason === MEDIA_PUBLICATION_IN_FLIGHT_REASON) {
            // Nothing changed; stay open so the owner can retry in a minute.
            setInFlight(true);
            recheck();
            return;
          }
          fail(error, 'Не удалось удалить файлы');
          recheck();
        }
      }
    );
  };
  let title: string;
  let body: React.ReactNode = null;
  let confirm: { label: string; run: () => void; tone: 'danger' | 'primary' } | null = {
    label: 'Да, удалить',
    run: remove,
    tone: 'danger'
  };

  if (loading) {
    title = single ? `Проверяем, где используется ${quote(single.fileName)}…` : 'Проверяем, где используются файлы…';
    body = <p className={styles.note}>Сначала нужно узнать, что затронет удаление.</p>;
    confirm = { label: 'Да, удалить', run: remove, tone: 'danger' };
  } else if (failed) {
    title = 'Не удалось проверить, где используется файл';
    body = <p className={styles.alert}>Ничего не удалено. Повторите попытку.</p>;
    confirm = { label: 'Повторить', run: recheck, tone: 'primary' };
  } else if (single && singleUsage) {
    const block = deleteBlock(singleUsage);
    if (block.kind !== 'none') {
      title = `Удалить ${quote(single.fileName)} пока нельзя`;
      body = <p className={styles.alert}>{blockSentence(block)}</p>;
      confirm = block.kind === 'sending' ? { label: 'Повторить', run: recheck, tone: 'primary' } : null;
    } else {
      title = `Удалить ${quote(single.fileName)}?`;
      body = (
        <>
          {isUsed(singleUsage) ? (
            <p className={styles.warning}>
              Внимание: если удалите, файл уберётся и из публикаций, постов и черновиков, где он используется.
            </p>
          ) : (
            <p className={styles.note}>Файл не используется ни в одном посте. Он будет удалён безвозвратно.</p>
          )}
          <UsageDetails usage={singleUsage} timezone={timezone} onOpen={open} />
        </>
      );
    }
  } else {
    title = `Удалить файлы: ${removable.length}?`;
    body = (
      <>
        <p className={scheduledCount ? styles.warning : styles.note}>
          {scheduledCount
            ? `Внимание: файлы уберутся и из запланированных публикаций (${scheduledCount}).`
            : 'Файлы будут удалены безвозвратно.'}
        </p>
        {draftFiles ? <p className={styles.note}>Из черновиков и постов файлы уберутся: {draftFiles}.</p> : null}
        {blocked.length ? (
          <Group title="Не будут удалены:">
            <ul>
              {blocked.slice(0, 5).map(({ target, block }) => (
                <li key={target.id}>
                  {quote(target.fileName)} — {blockSentence(block)}
                </li>
              ))}
            </ul>
            {blocked.length > 5 ? <p className={styles.note}>и ещё {blocked.length - 5}</p> : null}
          </Group>
        ) : null}
      </>
    );
    if (removable.length === 0) confirm = null;
  }

  const busy = pending;

  return (
    <Dialog
      isOpen={targets !== null}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      role="alertdialog"
      title={title}
      footer={
        <>
          {/* Intentional: the safe answer takes initial focus in a destructive confirmation (skill ui-patterns). */}
          {/* oxlint-disable-next-line jsx-a11y/no-autofocus */}
          <Button variant="secondary" autoFocus isDisabled={busy} onPress={close}>
            Нет
          </Button>
          {confirm ? (
            <Button variant={confirm.tone} isLoading={busy || loading} isDisabled={loading} onPress={confirm.run}>
              {confirm.label}
            </Button>
          ) : null}
        </>
      }
    >
      <div className={styles.body}>
        {body}
        {inFlight && singleUsage?.sending.length !== undefined && singleUsage.sending.length === 0 ? (
          <p className={styles.alert} role="alert">
            {'Публикация с этим файлом сейчас отправляется. Попробуйте через минуту.'}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
