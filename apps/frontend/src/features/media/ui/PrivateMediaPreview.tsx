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
  // Video originals cannot go into <img>: the detail view of a video also shows its first frame.
  const original = useMediaOriginal(mediaId, load, eager && kind !== 'video');
  const thumbnail = useMediaThumbnail(
    mediaId,
    kind === 'video' ? 'video' : 'image',
    load,
    visible && !(eager && kind !== 'video')
  );
  const shown = eager && kind !== 'video' ? original : thumbnail;
  const failed = shown.isError || broken;

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
      <span aria-hidden="true">
        {shown.src && !failed ? (
          <img src={shown.src} alt="" onError={() => setBroken(true)} />
        ) : (
          <Icon name={kind === 'video' ? 'video' : 'image'} size={28} />
        )}
        {kind === 'video' ? <span className={styles.videoMark}>Видео</span> : null}
      </span>
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
