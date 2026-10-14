import { useEffect, useRef } from 'react';
import styles from './MediaCropDialog.module.css';

type Props = {
  blob: Blob;
  start: number;
  end: number;
  /** The stage keeps the height of the crop canvas it replaces, so the dialog does not jump. */
  height: string;
  onTime: (seconds: number) => void;
  onEnd: () => void;
};

/** Plays only [start, end] of the source video: seeks to the start, follows the clock and stops at the end. */
export function TrimPreviewPlayer({ blob, start, end, height, onTime, onEnd }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const callbacks = useRef({ onTime, onEnd });
  useEffect(() => {
    callbacks.current = { onTime, onEnd };
  });

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const url = URL.createObjectURL(blob);
    let frame = 0;
    const tick = () => {
      callbacks.current.onTime(element.currentTime);
      if (element.currentTime >= end) {
        element.pause();
        callbacks.current.onEnd();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    const begin = () => {
      element.currentTime = start;
      void element.play().then(
        () => {
          frame = requestAnimationFrame(tick);
        },
        () => callbacks.current.onEnd()
      );
    };
    element.src = url;
    element.addEventListener('loadedmetadata', begin, { once: true });
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener('loadedmetadata', begin);
      element.pause();
      element.removeAttribute('src');
      element.load();
      URL.revokeObjectURL(url);
    };
  }, [blob, start, end]);

  return (
    <div className={styles.player} style={{ height }}>
      <video ref={video} muted playsInline aria-label="Предпросмотр выбранного отрезка" />
    </div>
  );
}
