import { useQueryClient } from '@tanstack/react-query';
import type { PostEntity, PostMediaDto, PostPoll } from '@alexeev/contracts';
import { useEffect, useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { Icon, IconButton, Panel, TelegramPoll, TelegramPreview } from '../../../shared/ui';
import { getPostMediaContent } from '../api/post-media-api';
import { previewMessage } from '../model/preview-message';
import { postsCopy } from './copy';
import { EntityText } from './EntityText';
import { RichText } from './RichText';
import styles from './PostEditor.module.css';

type Props = {
  title: string;
  body: string;
  entities: readonly PostEntity[];
  /** Retained in the public preview slice for existing callers; counts render in the editor fields. */
  length: number;
  limit?: number;
  media?: PostMediaDto[];
  /** A poll post: the preview is the empty poll as a channel shows it, never votes or percentages. */
  poll?: PostPoll | null | undefined;
  /** A rich post: what the channel gets instead of the title and body (owner, 23.10.2026). */
  richHtml?: string | null | undefined;
  desktopHeader?: boolean;
  onCollapse?: (() => void) | undefined;
};

const copy = postsCopy.editor;
const pollCopy = postsCopy.poll;
const emptyMedia: PostMediaDto[] = [];
const previewLabels = {
  previous: 'Предыдущее фото',
  next: 'Следующее фото',
  loadFailed: 'Не удалось загрузить фото',
  retry: 'Повторить',
  region: 'Медиа поста'
};

/** The dispatcher sends the bold title, a blank line and the body as plain text plus entities, link previews off. */
export function PostPreview({
  title,
  body,
  entities,
  media = emptyMedia,
  poll = null,
  richHtml = null,
  desktopHeader = false,
  onCollapse
}: Props) {
  const isEmpty = title.trim() === '' && body === '';
  const message = previewMessage(title, body, entities);
  const [mediaUrls, setMediaUrls] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [mediaError, setMediaError] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (media.length === 0) return;
    const controller = new AbortController();
    const createdUrls: string[] = [];
    void Promise.all(
      media.map(async (item) => {
        // Same cache as the media views: an id's bytes never change, so a re-render reuses them.
        const blob = await queryClient.fetchQuery({
          queryKey: ['media-original', item.id],
          queryFn: ({ signal }) => getPostMediaContent(item.id, signal),
          staleTime: Infinity,
          gcTime: 60_000
        });
        if (controller.signal.aborted) return [item.id, ''] as const;
        const url = URL.createObjectURL(blob);
        createdUrls.push(url);
        return [item.id, url] as const;
      })
    )
      .then((items) => {
        if (controller.signal.aborted) return;
        setMediaUrls(new Map(items.filter((item) => item[1])));
        setMediaError('');
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        createdUrls.forEach((url) => URL.revokeObjectURL(url));
        createdUrls.length = 0;
        const requestId = cause instanceof ApiError ? cause.requestId : undefined;
        setMediaError(
          requestId
            ? `Предпросмотр медиа недоступен. Запрос: ${requestId}`
            : 'Предпросмотр медиа недоступен. Вложения сохранены.'
        );
      });
    return () => {
      controller.abort();
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [media, queryClient]);

  // Every attachment gets its slot at once (known width/height from the DTO), so the bubble keeps its height while bytes arrive.
  const previewMedia =
    media.length > 0
      ? media.map((item) => {
          const src = mediaUrls.get(item.id);
          return {
            id: item.id,
            src: src ?? '',
            pending: src === undefined,
            alt: item.fileName,
            width: item.width,
            height: item.height,
            kind: item.kind,
            durationMs: item.durationMs
          };
        })
      : undefined;

  return (
    <Panel
      scrollableBody
      title={desktopHeader ? 'Предпросмотр' : undefined}
      icon={desktopHeader ? <Icon name="eye" size={18} /> : undefined}
      action={
        onCollapse ? <IconButton label="Свернуть предпросмотр" icon="x" size="sm" onPress={onCollapse} /> : undefined
      }
    >
      <div className={styles.previewBody}>
        <TelegramPreview
          body={
            poll ? (
              <TelegramPoll
                question={poll.question.trim() || pollCopy.preview.empty}
                options={poll.options}
                multiple={poll.allowsMultipleAnswers}
                kindLabel={poll.quiz ? pollCopy.preview.quiz : pollCopy.preview.anonymous}
                emptyOption={pollCopy.optionLabel}
              />
            ) : richHtml !== null ? (
              <RichText html={richHtml} />
            ) : isEmpty ? (
              copy.previewEmpty
            ) : (
              <EntityText text={message.text} entities={message.entities} />
            )
          }
          media={previewMedia}
          mediaMode={media.length > 1 ? 'album' : 'single'}
          showCounter
          mediaLabels={previewLabels}
        />
        {mediaError ? <output className={styles.note}>{mediaError}</output> : null}
      </div>
    </Panel>
  );
}
