import type { PostMediaDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { Button, MediaGridTile } from '../../../shared/ui';
import { postMediaContentQueryOptions } from '../api/post-media-api';
import { formatMediaDuration } from '../model/media-entry';
import styles from './PostMediaEditor.module.css';

/* oxlint-disable jsx-a11y/media-has-caption -- Uploaded files may not contain captions; never fabricate a track. */
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Live status is kept on the existing generic containers for layout and semantics. */

export function ServerPreview({
  media,
  large = false,
  gridTile = false,
  fluid = false,
  onOpen,
  handle,
  onRemove,
  isDisabled
}: {
  media: PostMediaDto;
  large?: boolean;
  gridTile?: boolean;
  fluid?: boolean;
  onOpen?: () => void;
  handle?: ReactNode;
  onRemove?: () => void;
  isDisabled?: boolean;
}) {
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const [decodeFailed, setDecodeFailed] = useState(false);
  const query = useQuery(postMediaContentQueryOptions(media.id, media.sizeBytes));
  const error = query.error;
  const url = preview && preview.blob === query.data ? preview.url : null;
  useEffect(() => {
    if (!query.data) return;
    const blob = query.data;
    let active = true;
    let objectUrl: string | null = null;
    queueMicrotask(() => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setPreview({ blob, url: objectUrl });
      setDecodeFailed(false);
    });
    return () => {
      active = false;
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [query.data]);
  const errorText =
    error instanceof ApiError && error.requestId
      ? `Предпросмотр недоступен. Запрос: ${error.requestId}`
      : error
        ? 'Предпросмотр недоступен. Вложение сохранено.'
        : null;
  if (gridTile) {
    return (
      <>
        <MediaGridTile
          fluid={fluid}
          label={media.fileName}
          src={decodeFailed ? undefined : (url ?? undefined)}
          kind={media.kind === 'video' ? 'video' : 'image'}
          duration={media.kind === 'video' ? formatMediaDuration(media.durationMs) : undefined}
          onPress={onOpen}
          handle={handle}
          onRemove={onRemove}
          removeLabel={`Убрать из поста: ${media.fileName}`}
          isDisabled={isDisabled}
        />
        {url && media.kind !== 'video' && !decodeFailed ? (
          <img
            className={styles.imageMonitor}
            src={url}
            alt={media.fileName}
            aria-hidden="true"
            onError={() => setDecodeFailed(true)}
          />
        ) : null}
        {!url && !error ? (
          <span className={styles.srOnly} role="status">
            Загружаем предпросмотр
          </span>
        ) : null}
        {errorText || decodeFailed ? (
          <div className={styles.previewError} role="status">
            <span>{errorText ?? 'Не удалось показать изображение. Вложение сохранено в посте.'}</span>
            <Button size="sm" variant="secondary" onPress={() => void query.refetch()}>
              Повторить
            </Button>
          </div>
        ) : null}
      </>
    );
  }
  if (!url || decodeFailed)
    return (
      <div className={`${styles.previewPlaceholder} ${large ? styles.largePreview : ''}`}>
        {errorText || decodeFailed ? (
          <>
            <span>{errorText ?? 'Не удалось показать изображение. Вложение сохранено в посте.'}</span>
            <Button size="sm" variant="secondary" onPress={() => void query.refetch()}>
              Повторить
            </Button>
          </>
        ) : (
          'Загружаем предпросмотр'
        )}
      </div>
    );
  return media.kind === 'video' ? (
    <video className={`${styles.preview} ${large ? styles.largePreview : ''}`} src={url} controls preload="metadata" />
  ) : (
    <img
      className={`${styles.preview} ${large ? styles.largePreview : ''}`}
      src={url}
      alt={media.fileName}
      onError={() => setDecodeFailed(true)}
    />
  );
}
