import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { clampSingleMediaRatio, layoutMediaGroup } from '../lib/media-group-layout';
import { ru } from '../lib/ru';
import { Icon } from './Icon';
import styles from './TelegramPreview.module.css';

export type PreviewMediaItem = {
  id: string;
  src: string;
  alt?: string;
  /** Pixel size when known; otherwise it is read from the loaded picture. */
  width?: number | null;
  height?: number | null;
  /** `video` and `animation` sources are video files: the first frame is the poster. */
  kind?: 'photo' | 'video' | 'animation';
  durationMs?: number | null;
};

// Album geometry is computed in a nominal 1000-unit box and drawn in percent, so it scales with the bubble.
const GROUP_WIDTH = 1000;
const GROUP_MIN_WIDTH = 200;
const GROUP_SPACING = 6;

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const seconds = String(total % 60).padStart(2, '0');
  return `${Math.floor(total / 60)}:${seconds}`;
}

export type PreviewMediaLabels = {
  /** Names of the chevron buttons («Предыдущее фото», «Следующее фото»). */
  previous: string;
  next: string;
  /** Placeholder text when a picture fails to load, and its retry button («Не удалось загрузить», «Повторить»). */
  loadFailed: string;
  retry: string;
  /** Name of the media region («Медиа поста»). */
  region: string;
};

type Props = {
  title?: string;
  /** Plain text or rendered entities: line breaks are kept, nothing is parsed as HTML. */
  body: ReactNode;
  /** Time and views line, e.g. «12:30». */
  meta?: string;
  /** Views counter next to the eye icon at the start of the footer line («0»); `meta` stays at the end. */
  views?: string;
  /** `chat` is the bubble on the chat background; `panel` is the bare text under the media, for a preview panel that is already a card. */
  variant?: 'chat' | 'panel';
  /** Pictures above the text. One picture or `single` mode: a carousel; `album`: a Telegram-style grid. */
  media?: readonly PreviewMediaItem[];
  mediaMode?: 'single' | 'album';
  /** Carousel position (controlled); defaults to the first picture. */
  mediaIndex?: number;
  onMediaIndexChange?: (index: number) => void;
  /** Draws the «1 / 5» pill at the bottom centre of the carousel. */
  showCounter?: boolean;
  mediaLabels?: PreviewMediaLabels;
};

/** Approximation of the message bubble in a Telegram channel; the real render comes from the server preview. */
export function TelegramPreview({
  title,
  body,
  meta,
  views,
  variant = 'chat',
  media,
  mediaMode = 'single',
  mediaIndex,
  onMediaIndexChange,
  showCounter = false,
  mediaLabels
}: Props) {
  const [innerIndex, setInnerIndex] = useState(0);
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const count = media?.length ?? 0;
  const index = Math.min(Math.max(mediaIndex ?? innerIndex, 0), Math.max(count - 1, 0));
  const go = (next: number) => {
    const clamped = Math.min(Math.max(next, 0), count - 1);
    if (clamped === index) return;
    if (mediaIndex === undefined) setInnerIndex(clamped);
    onMediaIndexChange?.(clamped);
  };
  // Arrow keys on a focused chevron page the carousel too.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') go(index - 1);
    else if (event.key === 'ArrowRight') go(index + 1);
  };
  const [measured, setMeasured] = useState<ReadonlyMap<string, { width: number; height: number }>>(new Map());
  const measure = (id: string, width: number, height: number) => {
    if (width <= 0 || height <= 0) return;
    setMeasured((prev) => (prev.has(id) ? prev : new Map(prev).set(id, { width, height })));
  };
  const sizeOf = (item: PreviewMediaItem) => {
    if (item.width && item.height) return { width: item.width, height: item.height };
    return measured.get(item.id) ?? { width: 1, height: 1 };
  };
  const markFailed = (id: string) => setFailed((prev) => new Set(prev).add(id));
  const retry = (id: string) =>
    setFailed((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  function picture(item: PreviewMediaItem) {
    if (failed.has(item.id) && mediaLabels) {
      return (
        <span className={styles.broken}>
          <Icon name="image" size={24} />
          <span>{mediaLabels.loadFailed}</span>
          <AriaButton className={styles.retry} onPress={() => retry(item.id)}>
            {mediaLabels.retry}
          </AriaButton>
        </span>
      );
    }
    const isVideo = item.kind === 'video' || item.kind === 'animation';
    return (
      <>
        {isVideo ? (
          <video
            src={item.src}
            aria-label={item.alt}
            muted
            playsInline
            preload="metadata"
            onLoadedMetadata={(event) =>
              measure(item.id, event.currentTarget.videoWidth, event.currentTarget.videoHeight)
            }
            onError={() => markFailed(item.id)}
          />
        ) : (
          <img
            src={item.src}
            alt={item.alt ?? ''}
            decoding="async"
            onLoad={(event) => measure(item.id, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
            onError={() => markFailed(item.id)}
          />
        )}
        {item.kind === 'animation' ? <span className={styles.badge}>GIF</span> : null}
        {item.kind === 'video' ? (
          <>
            <span className={styles.play} aria-hidden="true">
              <Icon name="play" size={20} />
            </span>
            {item.durationMs ? <span className={styles.badge}>{formatDuration(item.durationMs)}</span> : null}
          </>
        ) : null}
      </>
    );
  }

  const shown = media?.slice(0, 10) ?? [];
  const rects =
    mediaMode === 'album' ? layoutMediaGroup(shown.map(sizeOf), GROUP_WIDTH, GROUP_MIN_WIDTH, GROUP_SPACING) : [];
  const groupHeight = rects.reduce((max, r) => Math.max(max, r.y + r.height), 0);
  // Telegram may lay an album out narrower than the bubble's max width (tall photos); the block shrinks to it.
  const groupWidth = rects.reduce((max, r) => Math.max(max, r.x + r.width), 0) || GROUP_WIDTH;
  const current = media?.[index] ?? media?.[0];
  const currentSize = current ? sizeOf(current) : { width: 1, height: 1 };
  const singleRatio = clampSingleMediaRatio(currentSize.width, currentSize.height);

  return (
    <figure className={styles.chat} data-variant={variant} aria-label={ru.ui.previewLabel}>
      <div className={styles.bubble}>
        {media && media.length > 0 ? (
          <section
            aria-label={mediaLabels?.region}
            aria-roledescription="carousel"
            className={styles.media}
            data-mode={mediaMode}
            style={
              mediaMode === 'album'
                ? { aspectRatio: `${groupWidth} / ${groupHeight}`, width: `${(groupWidth / GROUP_WIDTH) * 100}%` }
                : { aspectRatio: singleRatio }
            }
          >
            {mediaMode === 'album' ? (
              shown.map((item, i) => {
                const r = rects[i];
                if (!r) return null;
                return (
                  <span
                    key={item.id}
                    className={styles.cell}
                    style={{
                      left: `${(r.x / groupWidth) * 100}%`,
                      top: `${(r.y / groupHeight) * 100}%`,
                      width: `${(r.width / groupWidth) * 100}%`,
                      height: `${(r.height / groupHeight) * 100}%`
                    }}
                  >
                    {picture(item)}
                  </span>
                );
              })
            ) : (
              <>
                <span className={styles.slide}>{picture(current ?? media[0]!)}</span>
                {mediaLabels && index > 0 ? (
                  <AriaButton
                    aria-label={mediaLabels.previous}
                    onPress={() => go(index - 1)}
                    onKeyDown={onKeyDown}
                    className={styles.chevron}
                    data-side="start"
                  >
                    <Icon name="chevron-left" size={20} />
                  </AriaButton>
                ) : null}
                {mediaLabels && index < count - 1 ? (
                  <AriaButton
                    aria-label={mediaLabels.next}
                    onPress={() => go(index + 1)}
                    onKeyDown={onKeyDown}
                    className={styles.chevron}
                    data-side="end"
                  >
                    <Icon name="chevron-right" size={20} />
                  </AriaButton>
                ) : null}
                {showCounter && count > 1 ? (
                  <span className={styles.counter} aria-live="polite">
                    {index + 1} / {count}
                  </span>
                ) : null}
              </>
            )}
          </section>
        ) : null}
        {title ? <strong className={styles.title}>{title}</strong> : null}
        <div className={styles.body}>{body}</div>
        {views !== undefined ? (
          <div className={styles.footer}>
            <span className={styles.views}>
              <Icon name="eye" size={16} />
              {views}
            </span>
            {meta ? <span className={styles.meta}>{meta}</span> : null}
          </div>
        ) : meta ? (
          <span className={styles.meta}>{meta}</span>
        ) : null}
      </div>
    </figure>
  );
}
