import { useEffect, useRef, useState } from 'react';
import { Button, Icon } from '../../../shared/ui';
import { getMediaContent } from '../api/media-api';
import styles from './MediaLibrary.module.css';

type Props = {
  mediaId: string;
  kind: 'photo' | 'animation' | 'video';
  eager?: boolean;
  allowRetry?: boolean;
};

/** Only private authenticated bytes are shown; URLs are scoped to this mounted preview. */
export function PrivateMediaPreview({ mediaId, kind, eager = false, allowRetry = false }: Props) {
  const host = useRef<HTMLSpanElement>(null);
  const latestAttempt = useRef(0);
  const [source, setSource] = useState<string>();
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(() => eager || typeof IntersectionObserver === 'undefined');
  const [attempt, setAttempt] = useState(0);

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

  useEffect(() => {
    if (!visible) return;
    // Retry increments this key to restart the same safe, authenticated GET.
    latestAttempt.current = attempt;
    const requestAttempt = attempt;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    void getMediaContent(mediaId, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted || latestAttempt.current !== requestAttempt) return;
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
        setFailed(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attempt, mediaId, visible]);

  return (
    <span ref={host} className={styles.preview}>
      <span aria-hidden="true">
        {source && !failed ? (
          <img
            src={source}
            alt=""
            onError={() => {
              URL.revokeObjectURL(source);
              setSource(undefined);
              setFailed(true);
            }}
          />
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
                setFailed(false);
                setAttempt((value) => value + 1);
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
