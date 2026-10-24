import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Dialog as AriaDialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { clampPan, FIT, MAX_SCALE, zoomAt, type ViewTransform } from '../../../shared/lib/zoom';
import { useMediaOriginal } from '../../../shared/lib/use-media-thumbnail';
import { Button, IconButton } from '../../../shared/ui';
import { getMediaContent } from '../api/media-api';
import styles from './PhotoViewer.module.css';

type Props = {
  /** Photos of the current page; arrows move inside this list. */
  photos: { id: string; fileName: string }[];
  /** Id of the photo shown; `null` keeps the viewer closed. */
  openId: string | null;
  onChange: (id: string) => void;
  onClose: () => void;
};

const ZOOM_STEP = 1.5;
const sizeOf = (element: HTMLElement) => ({ width: element.offsetWidth, height: element.offsetHeight });

/** Fullscreen photo viewer: fit, wheel / pinch / double-click zoom, drag to pan, ←/→ between photos, Esc closes. */
export function PhotoViewer({ photos, openId, onChange, onClose }: Props) {
  const index = photos.findIndex((photo) => photo.id === openId);
  const current = index >= 0 ? photos[index] : undefined;
  return (
    <ModalOverlay
      isOpen={current !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      isDismissable={false}
      className={styles.overlay}
    >
      <Modal className={styles.modal}>
        {current ? (
          <ViewerBody
            key={current.id}
            photo={current}
            position={index + 1}
            total={photos.length}
            onPrevious={index > 0 ? () => onChange(photos[index - 1]?.id ?? current.id) : undefined}
            onNext={index < photos.length - 1 ? () => onChange(photos[index + 1]?.id ?? current.id) : undefined}
          />
        ) : null}
      </Modal>
    </ModalOverlay>
  );
}

function ViewerBody({
  photo,
  position,
  total,
  onPrevious,
  onNext
}: {
  photo: { id: string; fileName: string };
  position: number;
  total: number;
  onPrevious?: (() => void) | undefined;
  onNext?: (() => void) | undefined;
}) {
  const original = useMediaOriginal(photo.id, (signal) => getMediaContent(photo.id, signal), true);
  const stage = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const [view, setView] = useState<ViewTransform>(FIT);
  const [broken, setBroken] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);

  const measure = useCallback(() => {
    const stageElement = stage.current;
    const imageElement = image.current;
    if (!stageElement || !imageElement) return null;
    return { content: sizeOf(imageElement), viewport: sizeOf(stageElement), box: stageElement.getBoundingClientRect() };
  }, []);

  const zoomTo = useCallback(
    (factor: number | 'fit', client?: { x: number; y: number }) => {
      const measured = measure();
      if (!measured) return;
      const { content, viewport, box } = measured;
      const focus = client
        ? { x: client.x - box.left - box.width / 2, y: client.y - box.top - box.height / 2 }
        : { x: 0, y: 0 };
      setView((previous) =>
        factor === 'fit' ? FIT : zoomAt(previous, previous.scale * factor, focus, content, viewport)
      );
    },
    [measure]
  );

  // Wheel must be a non-passive native listener to keep the page from scrolling under the viewer.
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomTo(Math.exp(-event.deltaY * 0.002), { x: event.clientX, y: event.clientY });
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [zoomTo]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null;
    }
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const next = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, next);
    const measured = measure();
    if (!measured) return;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b || pinch.current === null || pinch.current === 0) return;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      zoomTo(distance / pinch.current, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      pinch.current = distance;
      return;
    }
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    setView((value) => clampPan({ ...value, x: value.x + dx, y: value.y + dy }, measured.content, measured.viewport));
  };
  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    pinch.current = null;
  };

  // Focus can rest on the dialog itself, so keys are read at the document while the viewer is mounted.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowLeft' && onPrevious) onPrevious();
      else if (event.key === 'ArrowRight' && onNext) onNext();
      else if (event.key === '+' || event.key === '=') zoomTo(ZOOM_STEP);
      else if (event.key === '-') zoomTo(1 / ZOOM_STEP);
      else if (event.key === '0') zoomTo('fit');
      else return;
      event.preventDefault();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onNext, onPrevious, zoomTo]);

  return (
    <AriaDialog className={styles.dialog} aria-label={`Просмотр фото ${photo.fileName}`}>
      {({ close }) => (
        <div className={styles.frame}>
          <header className={styles.bar}>
            <Heading slot="title" className={styles.title}>
              {photo.fileName}
            </Heading>
            <span className={styles.counter} aria-live="polite">
              {position} из {total}
            </span>
            <div className={styles.tools}>
              <IconButton
                label="Уменьшить"
                icon="minus"
                isDisabled={view.scale <= 1}
                onPress={() => zoomTo(1 / ZOOM_STEP)}
              />
              <IconButton
                label="Увеличить"
                icon="plus"
                isDisabled={view.scale >= MAX_SCALE}
                onPress={() => zoomTo(ZOOM_STEP)}
              />
              <IconButton
                label="Вписать в экран"
                icon="maximize"
                isDisabled={view.scale === 1}
                onPress={() => zoomTo('fit')}
              />
              <IconButton label="Закрыть" icon="x" onPress={close} />
            </div>
          </header>
          <div
            ref={stage}
            className={styles.stage}
            data-zoomed={view.scale > 1 ? '' : undefined}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onDoubleClick={(event) =>
              view.scale > 1 ? zoomTo('fit') : zoomTo(3, { x: event.clientX, y: event.clientY })
            }
          >
            {original.src && !broken ? (
              <img
                ref={image}
                className={styles.image}
                src={original.src}
                alt={photo.fileName}
                draggable={false}
                style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
                onError={() => setBroken(true)}
              />
            ) : original.isError || broken ? (
              <div className={styles.status} role="alert">
                Не удалось загрузить фото.
                <Button
                  variant="secondary"
                  onPress={() => {
                    setBroken(false);
                    original.retry();
                  }}
                >
                  Повторить
                </Button>
              </div>
            ) : (
              <output className={styles.status}>Загружаем фото…</output>
            )}
          </div>
          <IconButton
            className={`${styles.nav} ${styles.prev}`}
            label="Предыдущее фото"
            icon="chevron-left"
            variant="secondary"
            size="target"
            isDisabled={!onPrevious}
            onPress={onPrevious}
          />
          <IconButton
            className={`${styles.nav} ${styles.next}`}
            label="Следующее фото"
            icon="chevron-right"
            variant="secondary"
            size="target"
            isDisabled={!onNext}
            onPress={onNext}
          />
        </div>
      )}
    </AriaDialog>
  );
}
