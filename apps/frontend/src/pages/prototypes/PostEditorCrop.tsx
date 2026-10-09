/* oxlint-disable react/refs, react/set-state-in-effect, react/exhaustive-effect-dependencies, react/capitalized-calls, jsx-a11y/prefer-tag-over-role, jsx-a11y/no-autofocus, jsx-a11y/no-noninteractive-element-interactions, unicorn/prefer-add-event-listener, eslint/no-shadow -- dev-only prototype: mock timers, live regions and a full-screen crop layer */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Banner,
  Button,
  Card,
  Checkbox,
  CropCanvas,
  Dialog,
  Icon,
  IconButton,
  RatioTileGroup,
  Skeleton,
  Slider,
  Switch,
  type CropFrame
} from '../../shared/ui';
import {
  clampFrame,
  defaultModel,
  exportCrop,
  frameForRatio,
  isDefault,
  loadImage,
  maxZoom,
  MIN_SIDE_PX,
  outputShortSide,
  RATIO_VALUE,
  renderCrop,
  stageAspect,
  ZOOM_MAX,
  ZOOM_MIN,
  type CropModel,
  type CropResult,
  type RatioId,
  type Rotation
} from './post-editor-crop';
import type { PostMedia } from './post-editor-data';
import styles from './PostEditorCrop.module.css';

const CORNER_LABELS = {
  'top-left': 'Левый верхний угол',
  'top-right': 'Правый верхний угол',
  'bottom-left': 'Левый нижний угол',
  'bottom-right': 'Правый нижний угол'
} as const;
const LABELS = { region: 'Область кадрирования', corners: CORNER_LABELS };

type SaveError = 'too-large' | 'unavailable' | null;
const ERROR_TEXT: Record<Exclude<SaveError, null>, string> = {
  'too-large': 'Фото после кадрирования больше 10 МБ — уменьшите масштаб.',
  unavailable: 'Не удалось сохранить.'
};

type Natural = { w: number; h: number };

export function useCropState(item: PostMedia, coverDefault: boolean, failFirstSave: boolean) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [model, setModel] = useState<CropModel>(defaultModel);
  const [cover, setCover] = useState(coverDefault);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<SaveError>(null);
  const failures = useRef(failFirstSave ? 1 : 0);
  const [attempt, setAttempt] = useState(0);

  // A crop always starts from the uploaded original, never from an earlier derivative.
  useEffect(() => {
    let live = true;
    setImg(null);
    setLoadFailed(false);
    const timer = setTimeout(() => {
      loadImage(item.original).then(
        (loaded) => live && setImg(loaded),
        () => live && setLoadFailed(true)
      );
    }, 450);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [item.original, attempt]);

  const natural: Natural | null = useMemo(() => (img ? { w: img.naturalWidth, h: img.naturalHeight } : null), [img]);
  const aspect = natural ? stageAspect(natural, model.rotation) : 1;
  const zoomCap = natural ? maxZoom(natural, model) : 1;
  const tooSmall = natural ? outputShortSide(natural, model) < MIN_SIDE_PX : false;

  const pickRatio = useCallback(
    (ratio: RatioId) => setModel((m) => ({ ...m, ratio, frame: clampFrame(frameForRatio(ratio, aspect), m.zoom) })),
    [aspect]
  );
  const setZoom = useCallback(
    (value: number) =>
      setModel((m) => {
        const zoom = Math.min(Math.max(value, ZOOM_MIN), Math.max(zoomCap, 1));
        return { ...m, zoom, frame: clampFrame(m.frame, zoom) };
      }),
    [zoomCap]
  );
  const setFrame = useCallback((frame: CropFrame) => setModel((m) => ({ ...m, frame: clampFrame(frame, m.zoom) })), []);
  const rotate = useCallback(
    (delta: 90 | -90) => {
      if (!natural) return;
      setModel((m) => {
        const rotation = ((((m.rotation + delta) % 360) + 360) % 360) as Rotation;
        return {
          ...m,
          rotation,
          frame: clampFrame(frameForRatio(m.ratio, stageAspect(natural, rotation)), m.zoom)
        };
      });
    },
    [natural]
  );
  const reset = useCallback(() => {
    setModel(defaultModel());
    setError(null);
    // The button disables itself at the default state; keep focus inside the crop instead of dropping it to the page.
    document.querySelector<HTMLElement>('[role="application"]')?.focus();
  }, []);

  async function save(): Promise<CropResult | null> {
    if (!img || !natural || saving || tooSmall) return null;
    setSaving(true);
    setError(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 700));
      if (failures.current > 0) {
        failures.current -= 1;
        setError('too-large');
        return null;
      }
      return await exportCrop(img, natural, model);
    } catch {
      setError('unavailable');
      return null;
    } finally {
      setSaving(false);
    }
  }

  return {
    img,
    natural,
    loadFailed,
    retryLoad: () => setAttempt((v) => v + 1),
    model,
    aspect,
    zoomCap,
    tooSmall,
    cover,
    setCover,
    saving,
    error,
    pickRatio,
    setZoom,
    setFrame,
    rotate,
    reset,
    save
  };
}
export type CropState = ReturnType<typeof useCropState>;

/** Live preview: the same `renderCrop` the saved file uses, redrawn on the next frame after every change. */
function PreviewCanvas({
  state,
  maxSide,
  className
}: {
  state: CropState;
  maxSide: number;
  className: string | undefined;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { img, natural, model } = state;
  useEffect(() => {
    if (!img || !natural || !ref.current) return;
    const canvas = ref.current;
    const frame = requestAnimationFrame(() => renderCrop(img, natural, model, maxSide, canvas));
    return () => cancelAnimationFrame(frame);
  }, [img, natural, model, maxSide]);
  return <canvas ref={ref} className={className} role="img" aria-label="Предпросмотр кадра" />;
}

function ratioOptions(state: CropState) {
  const shape = state.natural ? state.natural.w / state.natural.h : 1;
  return [
    { id: 'original', label: 'Оригинал', shortLabel: 'Ориг.', shape },
    { id: '1:1', label: '1:1', shape: 1 },
    { id: '4:5', label: '4:5', shape: 4 / 5 },
    { id: '16:9', label: '16:9', shape: 16 / 9 }
  ] as const;
}

function Canvas({
  state,
  handle,
  grid,
  height
}: {
  state: CropState;
  handle: 'square' | 'bracket';
  grid: 'dashed' | 'solid';
  height: string;
}) {
  if (state.loadFailed) {
    return (
      <div className={styles.canvasState} style={{ height }}>
        <Banner
          tone="error"
          title="Не удалось загрузить фото"
          action={
            <Button size="sm" variant="secondary" onPress={state.retryLoad}>
              Повторить
            </Button>
          }
        />
      </div>
    );
  }
  if (!state.img) {
    return (
      <div className={styles.canvasState} style={{ height }} aria-busy="true" role="status" aria-label="Загрузка фото">
        <Skeleton height="100%" radius="var(--radius-3)" />
      </div>
    );
  }
  return (
    <CropCanvas
      src={state.img.src}
      imageAspect={state.aspect}
      frame={state.model.frame}
      onFrameChange={state.setFrame}
      lockedRatio={RATIO_VALUE[state.model.ratio]}
      zoom={state.model.zoom}
      rotation={state.model.rotation}
      handle={handle}
      grid={grid}
      height={height}
      labels={LABELS}
    />
  );
}

function ZoomSlider({ state, pill }: { state: CropState; pill?: boolean }) {
  return (
    <Slider
      label="Масштаб"
      hideLabel={pill ?? false}
      pill={pill ?? false}
      {...(pill ? { stepperStyle: 'plain' as const } : {})}
      value={state.model.zoom}
      onChange={state.setZoom}
      min={ZOOM_MIN}
      max={ZOOM_MAX}
      step={0.05}
      stepperStep={0.25}
      decrementLabel="Уменьшить масштаб"
      incrementLabel="Увеличить масштаб"
      valueFormat={{ style: 'percent' }}
      isDisabled={!state.img}
    />
  );
}

type Common = {
  item: PostMedia;
  coverDefault: boolean;
  failFirstSave: boolean;
  onCancel: () => void;
  onSaved: (result: CropResult, cover: boolean) => void;
  onCoverHint: () => void;
};

/** Desktop «Кадрирование фото» modal (posts-02, right half). */
export function CropDialog({ item, coverDefault, failFirstSave, onCancel, onSaved, onCoverHint }: Common) {
  const state = useCropState(item, coverDefault, failFirstSave);
  const options = ratioOptions(state);
  async function onSave() {
    const result = await state.save();
    if (result) onSaved(result, state.cover);
  }
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      size="media"
      title="Кадрирование фото"
      footer={
        <>
          <Button variant="secondary" size="lg" className={styles.half} onPress={onCancel}>
            Отмена
          </Button>
          <Button
            icon="download"
            size="lg"
            className={styles.half}
            isLoading={state.saving}
            isDisabled={!state.img || state.tooSmall}
            onPress={() => void onSave()}
          >
            {state.saving ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        </>
      }
    >
      <div className={styles.dialogGrid}>
        <div className={styles.areaCanvas}>
          <Canvas state={state} handle="square" grid="dashed" height="20rem" />
        </div>
        <div className={styles.areaPreview}>
          <Card title="Предпросмотр">
            <div className={styles.previewBox}>
              {state.img ? (
                <PreviewCanvas state={state} maxSide={480} className={styles.previewCanvas} />
              ) : (
                <Skeleton height="100%" radius="var(--radius-3)" />
              )}
            </div>
            <Checkbox
              isSelected={state.cover}
              onChange={(value) => {
                state.setCover(value);
                if (value) onCoverHint();
              }}
              description="Это фото будет отображаться в предпросмотре поста"
            >
              Использовать как обложку
            </Checkbox>
          </Card>
        </div>
        <div className={styles.areaRatios}>
          <RatioTileGroup
            label="Соотношение сторон"
            options={options}
            value={state.model.ratio}
            onChange={(id) => state.pickRatio(id as RatioId)}
            isDisabled={!state.img}
          />
        </div>
        <div className={styles.areaZoom}>
          <div className={styles.grow}>
            <ZoomSlider state={state} />
          </div>
        </div>
        <div className={styles.areaRotate}>
          <IconButton
            variant="secondary"
            icon="rotate-left"
            label="Повернуть влево"
            isDisabled={!state.img}
            onPress={() => state.rotate(-90)}
          />
          <output className={styles.angle} aria-label="Угол поворота">
            {state.model.rotation}°
          </output>
          <IconButton
            variant="secondary"
            icon="rotate-right"
            label="Повернуть вправо"
            isDisabled={!state.img}
            onPress={() => state.rotate(90)}
          />
          <Button variant="secondary" isDisabled={!state.img || isDefault(state.model)} onPress={state.reset}>
            Сбросить
          </Button>
        </div>
        <div className={styles.areaNotes}>
          {state.tooSmall ? (
            <p className={styles.warn} role="status">
              <Icon name="alert" size={16} /> Слишком мелко для публикации
            </p>
          ) : null}
          {state.error ? (
            <Banner
              tone="error"
              title={ERROR_TEXT[state.error]}
              action={
                <Button size="sm" variant="secondary" onPress={() => void onSave()}>
                  Повторить
                </Button>
              }
            />
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

/** Phone full-screen «Кадрирование» (posts-03, right phone). Esc and «Назад» discard; the photo stays untouched. */
export function CropScreen({ item, coverDefault, failFirstSave, onCancel, onSaved, onCoverHint }: Common) {
  const state = useCropState(item, coverDefault, failFirstSave);
  const options = ratioOptions(state);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    rootRef.current?.focus();
    return () => before?.focus();
  }, []);
  async function onSave() {
    const result = await state.save();
    if (result) onSaved(result, state.cover);
  }
  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Кадрирование"
      tabIndex={-1}
      className={styles.screen}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
    >
      <header className={styles.screenHeader}>
        <Button variant="ghost" icon="arrow-left" className={styles.accent} onPress={onCancel}>
          Назад
        </Button>
        <h2 className={styles.screenTitle}>Кадрирование</h2>
        <Button
          size="md"
          isLoading={state.saving}
          isDisabled={!state.img || state.tooSmall}
          onPress={() => void onSave()}
        >
          {state.saving ? 'Сохраняем…' : 'Готово'}
        </Button>
      </header>
      <div className={styles.screenBody}>
        <Canvas state={state} handle="bracket" grid="solid" height="25rem" />
        {state.tooSmall ? (
          <p className={styles.warn} role="status">
            <Icon name="alert" size={16} /> Слишком мелко для публикации
          </p>
        ) : null}
        {state.error ? (
          <Banner
            tone="error"
            title={ERROR_TEXT[state.error]}
            action={
              <Button size="sm" variant="secondary" onPress={() => void onSave()}>
                Повторить
              </Button>
            }
          />
        ) : null}
        <RatioTileGroup
          label="Соотношение сторон"
          options={options}
          value={state.model.ratio}
          onChange={(id) => state.pickRatio(id as RatioId)}
          isDisabled={!state.img}
        />
        <div className={styles.controls}>
          <div className={styles.controlsLabels}>
            <span className={styles.rowLabel}>Масштаб</span>
            <span className={styles.labelsRight}>
              <Button variant="ghost" size="sm" isDisabled={!state.img || isDefault(state.model)} onPress={state.reset}>
                Сбросить
              </Button>
              <span className={styles.rowLabel}>Повернуть</span>
            </span>
          </div>
          <div className={styles.controlsRow}>
            <div className={styles.grow}>
              <ZoomSlider state={state} pill />
            </div>
            <IconButton
              variant="secondary"
              size="target"
              icon="rotate-left"
              label="Повернуть влево"
              isDisabled={!state.img}
              onPress={() => state.rotate(-90)}
            />
            <IconButton
              variant="secondary"
              size="target"
              icon="rotate-right"
              label="Повернуть вправо"
              isDisabled={!state.img}
              onPress={() => state.rotate(90)}
            />
          </div>
        </div>
        <Card padding="sm">
          <Switch
            variant="row"
            isSelected={state.cover}
            onChange={(value) => {
              state.setCover(value);
              if (value) onCoverHint();
            }}
            leading={
              <span className={styles.coverThumb}>
                {state.img ? <PreviewCanvas state={state} maxSide={160} className={styles.coverCanvas} /> : null}
              </span>
            }
            description="Это фото будет в превью публикации."
          >
            Сделать обложкой
          </Switch>
        </Card>
      </div>
    </div>
  );
}
