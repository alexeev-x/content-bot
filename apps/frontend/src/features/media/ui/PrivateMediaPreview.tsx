/* oxlint-disable jsx-a11y/media-has-caption -- Uploaded files may not contain captions; never fabricate a track. */
import { useEffect, useRef, useState } from 'react';
import { useMediaOriginal, useMediaThumbnail } from '../../../shared/lib/use-media-thumbnail';
import { Button, Icon } from '../../../shared/ui';
import { getMediaContent } from '../api/media-api';
import styles from './MediaLibrary.module.css';

type Props = {
  mediaId: string;
  kind: 'photo' | 'animation' | 'video';
  /** Detail view: loads at once and shows the original; grid tiles wait until visible and show a cached thumbnail. */
  eager?: boolean;
  allowRetry?: boolean;
};

/** Only private authenticated bytes are shown; object URLs are scoped to this mounted preview. */
export function PrivateMediaPreview({ mediaId, kind, eager = false, allowRetry = false }: Props) {
  const host = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(() => eager || typeof IntersectionObserver === 'undefined');
  const [broken, setBroken] = useState(false);
  const load = (signal: AbortSignal) => getMediaContent(mediaId, signal);
  // The detail view plays the original (video, or an animation delivered as MP4); grid tiles show a cached thumbnail.
  const original = useMediaOriginal(mediaId, load, eager);
  const thumbnail = useMediaThumbnail(
    mediaId,
    kind === 'video' ? 'video' : 'image',
    load,
    visible && (!eager || kind === 'video')
  );
  const asVideo = eager && (kind === 'video' || original.mime.startsWith('video/'));
  const shown = eager && kind !== 'video' ? original : thumbnail;
  const failed = shown.isError || broken || (eager && original.isError);

  useEffect(() => {
    if (eager || visible || !host.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '160px' }
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [eager, visible]);

  return (
    <span ref={host} className={styles.preview}>
      {asVideo && original.src && !failed ? (
        <video
          src={original.src}
          poster={kind === 'video' ? thumbnail.src : undefined}
          controls={kind === 'video'}
          autoPlay={kind !== 'video'}
          loop={kind !== 'video'}
          muted={kind !== 'video'}
          playsInline
          preload="metadata"
          aria-label={kind === 'video' ? 'Видео' : 'Анимация'}
          onError={() => setBroken(true)}
        />
      ) : (
        <span aria-hidden="true">
          {shown.src && !failed ? (
            <img src={shown.src} alt="" onError={() => setBroken(true)} />
          ) : (
            <Icon name={kind === 'video' ? 'video' : 'image'} size={28} />
          )}
          {kind === 'video' && !eager ? <span className={styles.videoMark}>▶ Видео</span> : null}
        </span>
      )}
      {failed ? (
        <span className={styles.previewError}>
          Предпросмотр недоступен
          {allowRetry ? (
            <Button
              variant="secondary"
              size="sm"
              onPress={() => {
                setBroken(false);
                shown.retry();
              }}
            >
              Повторить
            </Button>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
