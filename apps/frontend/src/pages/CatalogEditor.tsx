import { CalendarDate, Time } from '@internationalized/date';
import { useState } from 'react';
import lake from './catalog-assets/crop-lake-demo.png';
import {
  ActionRow,
  BottomSheet,
  Button,
  Card,
  CropCanvas,
  DateField,
  Dialog,
  Dropzone,
  FormatToolbar,
  TextArea,
  TextField,
  IconButton,
  MediaAddTile,
  MediaGridTile,
  MediaListRow,
  Panel,
  ProgressBar,
  Radio,
  RadioGroup,
  RatioTileGroup,
  Slider,
  Switch,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TelegramPreview,
  TimeField,
  UploadRow,
  fitFrame,
  type CropFrame,
  type FormatToolbarItem
} from '../shared/ui';
import styles from './CatalogPage.module.css';

const RATIOS = [
  { id: 'original', label: 'Оригинал', shortLabel: 'Ориг.', shape: 3 / 4 },
  { id: '1:1', label: '1:1', shape: 1 },
  { id: '4:5', label: '4:5', shape: 4 / 5 },
  { id: '16:9', label: '16:9', shape: 16 / 9 }
] as const;
const RATIO_VALUE: Record<string, number | undefined> = { original: undefined, '1:1': 1, '4:5': 4 / 5, '16:9': 16 / 9 };
// The demo photo is 1122 x 1402.
const PHOTO_ASPECT = 1122 / 1402;
const CORNER_LABELS = {
  'top-left': 'Левый верхний угол',
  'top-right': 'Правый верхний угол',
  'bottom-left': 'Левый нижний угол',
  'bottom-right': 'Правый нижний угол'
} as const;
const PREVIEW_LABELS = {
  previous: 'Предыдущее фото',
  next: 'Следующее фото',
  loadFailed: 'Не удалось загрузить',
  retry: 'Повторить',
  region: 'Медиа поста'
};
const TOOLBAR: readonly FormatToolbarItem[] = [
  { id: 'bold', icon: 'bold', label: 'Жирный', kind: 'toggle', isSelected: true },
  { id: 'italic', icon: 'italic', label: 'Курсив', kind: 'toggle' },
  { id: 'underline', icon: 'underline', label: 'Подчёркнутый', kind: 'toggle' },
  { id: 'strike', icon: 'strike', label: 'Зачёркнутый', kind: 'toggle' },
  { id: 'link', icon: 'link', label: 'Ссылка', kind: 'toggle', separatorBefore: true },
  { id: 'list', icon: 'list', label: 'Маркированный список', kind: 'action', separatorBefore: true },
  { id: 'ordered', icon: 'list-ordered', label: 'Нумерованный список', kind: 'action' },
  { id: 'code', icon: 'code', label: 'Код', kind: 'toggle' },
  { id: 'quote', icon: 'quote', label: 'Цитата', kind: 'toggle' },
  { id: 'emoji', icon: 'smile', label: 'Эмодзи', kind: 'action', end: true },
  { id: 'undo', icon: 'undo', label: 'Отменить', kind: 'action', end: true, separatorBefore: true },
  { id: 'redo', icon: 'redo', label: 'Повторить', kind: 'action', end: true, isDisabled: true }
];
const ALBUM = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, src: lake }));

/** The post-editor primitives (REQ-0…14) in their reference shapes; photos are the real demo image. */
export function CatalogEditor() {
  const [source, setSource] = useState('pc');
  const [ratio, setRatio] = useState('original');
  const [zoom, setZoom] = useState(1.5);
  const [frame, setFrame] = useState<CropFrame>({ x: 0.08, y: 0.1, w: 0.84, h: 0.8 });
  const [rotation, setRotation] = useState(0);
  const [selected, setSelected] = useState(true);
  const [plan, setPlan] = useState('later');
  const [date, setDate] = useState<CalendarDate | null>(new CalendarDate(2026, 10, 8));
  const [time, setTime] = useState<Time | null>(new Time(12, 0));
  const [comments, setComments] = useState(true);
  const [cover, setCover] = useState(true);
  const [pin, setPin] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [index, setIndex] = useState(0);
  const [dragging, setDragging] = useState('none');

  function pickRatio(id: string) {
    setRatio(id);
    const value = RATIO_VALUE[id];
    if (value !== undefined) setFrame(fitFrame(value, { width: PHOTO_ASPECT, height: 1 }));
    else setFrame({ x: 0, y: 0, w: 1, h: 1 });
  }

  return (
    <div className={styles.editorGroup} data-catalog="editor">
      <h3 className={styles.group}>Editor: media tiles, rows, upload</h3>
      <h3 className={styles.group}>Panel: surface and plain variants</h3>
      <div className={styles.row}>
        <Panel>Базовая поверхность</Panel>
        <Panel variant="plain">Группа полей без карточки</Panel>
      </div>
      <div className={styles.row}>
        <MediaAddTile label="Добавить файлы" onPress={() => undefined} />
        <MediaGridTile
          label="altai_lake.jpg"
          src={lake}
          onPress={() => undefined}
          onRemove={() => undefined}
          removeLabel="Убрать из поста"
        />
        <MediaGridTile
          label="sunrise_trekking.mp4"
          src={lake}
          kind="video"
          duration="01:24"
          onPress={() => undefined}
          onRemove={() => undefined}
          removeLabel="Убрать из поста"
        />
        <MediaGridTile
          label="mountains.jpg"
          src={lake}
          selectable
          isSelected={selected}
          onSelectedChange={setSelected}
        />
        <MediaGridTile
          label="lake.jpg"
          src={lake}
          handle={<span aria-hidden="true">⠿</span>}
          onPress={() => undefined}
        />
      </div>
      <div className={styles.row}>
        <MediaGridTile label="a.jpg" src={lake} state="done" stateLabel="100%" onPress={() => undefined} />
        <MediaGridTile
          label="b.mp4"
          src={lake}
          kind="video"
          duration="00:46"
          state="uploading"
          progress={65}
          stateLabel="Загрузка 65%"
        />
        <MediaGridTile
          label="c.mp4"
          src={lake}
          kind="video"
          state="failed"
          stateLabel="Ошибка"
          onRetry={() => undefined}
          retryLabel="Повторить"
          onRemove={() => undefined}
          removeLabel="Убрать"
        />
        <MediaGridTile label="d.jpg" src={lake} state="queued" stateLabel="В очереди" />
        <MediaGridTile label="e.jpg" />
      </div>
      <div className={styles.stack}>
        <MediaGridTile label="editor_media.jpg" src={lake} fluid aspectRatio="4:3" onPress={() => undefined} />
        <div className={styles.stack}>
          <strong>editor_media.jpg</strong>
          <span>Фото · 4,2 МБ</span>
          <Button size="sm" variant="secondary" onPress={() => undefined}>
            Кадрировать
          </Button>
        </div>
      </div>
      <div className={styles.stack}>
        <MediaListRow
          name="landscape.jpg"
          meta="4.2 МБ"
          thumb="landscape"
          src={lake}
          onRemove={() => undefined}
          removeLabel="Убрать"
        />
        <UploadRow
          name="landscape.jpg"
          meta="4.2 МБ • 4032 × 3024"
          thumb="landscape"
          src={lake}
          state="ready"
          statusLabel="Готов к добавлению"
          onRemove={() => undefined}
          removeLabel="Убрать"
        />
        <MediaListRow name="mountains.jpg" meta="4.2 МБ" src={lake} onRemove={() => undefined} removeLabel="Убрать" />
        <MediaListRow
          name="sunrise_trekking.mp4"
          meta="01:24"
          kind="video"
          duration="01:24"
          src={lake}
          onRemove={() => undefined}
          removeLabel="Убрать"
        />
        <MediaListRow
          name="Невероятные_пейзажи_Алтая_3_дня_в_горах_и_озёрах_финальная_версия.jpg"
          meta="3.1 МБ"
          src={lake}
        />
        <UploadRow
          name="altai_lake.jpg"
          meta="4.2 МБ • 4032 × 3024"
          src={lake}
          state="ready"
          statusLabel="Готов к добавлению"
          onRemove={() => undefined}
          removeLabel="Убрать"
        />
        <UploadRow
          name="sunrise_trekking.mp4"
          meta="128.7 МБ • 1920 × 1080 • 01:24"
          kind="video"
          src={lake}
          state="uploading"
          progress={62}
          statusLabel="Загрузка…"
          onRemove={() => undefined}
          removeLabel="Убрать"
        />
        <UploadRow
          name="scan.pdf"
          meta="12 МБ"
          state="failed"
          statusLabel=".pdf — формат не поддерживается"
          onRemove={() => undefined}
          removeLabel="Убрать"
        />
        <ProgressBar label="Загрузка" value={62} />
      </div>

      <h3 className={styles.group}>Editor: add media dialog, drop zone, source tabs</h3>
      <div className={styles.row}>
        <Button variant="secondary" onPress={() => setDialog(true)}>
          Media dialog (wide)
        </Button>
        <Button variant="secondary" onPress={() => setSheet(true)}>
          Bottom sheet
        </Button>
      </div>
      <Tabs variant="card" selectedKey={source} onSelectionChange={(key) => setSource(String(key))}>
        <TabList aria-label="Источник файлов">
          <Tab id="pc" icon="laptop" hint="Загрузите файлы с устройства">
            С компьютера
          </Tab>
          <Tab id="lib" icon="image" hint="Ваши сохранённые файлы">
            Медиабиблиотека
          </Tab>
          <Tab id="recent" icon="clock" hint="Ранее загруженные файлы">
            Недавние
          </Tab>
        </TabList>
        <TabPanel id="pc">
          <Dropzone
            title="Перетащите фото и видео сюда"
            subtitle="или выберите файлы на устройстве"
            dropLabel="Отпустите файлы"
            actionLabel="Выбрать файлы"
            actionIcon="image-plus"
            onFiles={(files) => setDragging(files.map((f) => f.name).join(', '))}
          >
            Фото — JPG, PNG, WebP до 10 МБ; GIF и видео MP4 — до 50 МБ. В посте до 10 файлов.
          </Dropzone>
          <p className={styles.note}>Last files: {dragging}</p>
        </TabPanel>
        <TabPanel id="lib">Library grid</TabPanel>
        <TabPanel id="recent">Recent</TabPanel>
      </Tabs>
      <Dropzone
        size="xl"
        title="Перетащите фото и видео сюда"
        dropLabel="Отпустите файлы"
        actionLabel="Выбрать файлы"
        actionSize="lg"
        actionIcon="image-plus"
        onFiles={() => undefined}
      />
      <Dropzone
        size="md"
        iconFrame="square"
        title="Добавьте фото или видео"
        subtitle="Поделитесь яркими моментами вашего путешествия"
        dropLabel="Отпустите файлы"
        actionLabel="Добавить медиа"
        actionSize="sm"
        onFiles={() => undefined}
      />
      <Dialog
        isOpen={dialog}
        onOpenChange={setDialog}
        size="media"
        title="Добавление медиа"
        footer={
          <>
            <Button variant="secondary" onPress={() => setDialog(false)}>
              Отмена
            </Button>
            <Button icon="plus">Добавить в пост</Button>
          </>
        }
      >
        <Tabs variant="card">
          <TabList aria-label="Источник">
            <Tab id="pc" icon="laptop" hint="Загрузите файлы с устройства">
              С компьютера
            </Tab>
            <Tab id="lib" icon="image" hint="Ваши сохранённые файлы">
              Медиабиблиотека
            </Tab>
            <Tab id="recent" icon="clock" hint="Ранее загруженные файлы">
              Недавние
            </Tab>
          </TabList>
          <TabPanel id="pc">
            <Dropzone
              title="Перетащите фото и видео сюда"
              subtitle="или выберите файлы на устройстве"
              dropLabel="Отпустите файлы"
              actionLabel="Выбрать файлы"
              actionIcon="image-plus"
              onFiles={() => undefined}
            >
              Фото — JPG, PNG, WebP до 10 МБ; GIF и видео MP4 — до 50 МБ. В посте до 10 файлов.
            </Dropzone>
          </TabPanel>
          <TabPanel id="lib">Library</TabPanel>
          <TabPanel id="recent">Recent</TabPanel>
        </Tabs>
        <UploadRow
          name="altai_lake.jpg"
          meta="4.2 МБ • 4032 × 3024"
          src={lake}
          state="ready"
          statusLabel="Готов к добавлению"
          onRemove={() => undefined}
          removeLabel="Убрать"
        />
        <UploadRow
          name="sunrise_trekking.mp4"
          meta="128.7 МБ • 1920 × 1080 • 01:24"
          kind="video"
          src={lake}
          state="uploading"
          progress={62}
          statusLabel="Загрузка…"
          onRemove={() => undefined}
          removeLabel="Убрать"
        />
      </Dialog>
      <BottomSheet
        isOpen={sheet}
        onOpenChange={setSheet}
        title="Добавить фото и видео"
        footer={
          <Button variant="secondary" fullWidth onPress={() => setSheet(false)}>
            Отмена
          </Button>
        }
      >
        <ActionRow icon="camera" title="Снять фото" hint="Открыть камеру устройства" onPress={() => setSheet(false)} />
        <ActionRow
          icon="image"
          title="Выбрать из галереи"
          hint="Фото и видео с устройства"
          onPress={() => setSheet(false)}
        />
        <ActionRow
          icon="folder"
          title="Открыть медиабиблиотеку"
          hint="Ваши сохранённые файлы"
          onPress={() => setSheet(false)}
        />
      </BottomSheet>

      <h3 className={styles.group}>Editor: crop</h3>
      <CropCanvas
        src={lake}
        imageAspect={rotation % 180 === 0 ? PHOTO_ASPECT : 1 / PHOTO_ASPECT}
        frame={frame}
        onFrameChange={setFrame}
        lockedRatio={RATIO_VALUE[ratio]}
        zoom={1}
        rotation={rotation}
        labels={{ region: 'Область кадрирования', corners: CORNER_LABELS }}
      />
      <CropCanvas
        src={lake}
        imageAspect={PHOTO_ASPECT}
        frame={{ x: 0.06, y: 0.1, w: 0.88, h: 0.8 }}
        onFrameChange={() => undefined}
        handle="bracket"
        grid="solid"
        height="240px"
        labels={{ region: 'Область кадрирования', corners: CORNER_LABELS }}
      />
      <RatioTileGroup label="Соотношение сторон" options={RATIOS} value={ratio} onChange={pickRatio} />
      <div className={styles.row}>
        <Slider
          label="Масштаб"
          value={zoom}
          onChange={setZoom}
          min={1}
          max={4}
          step={0.05}
          stepperStep={0.25}
          decrementLabel="Уменьшить масштаб"
          incrementLabel="Увеличить масштаб"
          valueFormat={{ style: 'percent' }}
        />
      </div>
      <Slider
        label="Масштаб"
        hideLabel
        pill
        stepperStyle="plain"
        value={zoom}
        onChange={setZoom}
        min={1}
        max={4}
        step={0.05}
        stepperStep={0.25}
        decrementLabel="Уменьшить масштаб"
        incrementLabel="Увеличить масштаб"
        valueFormat={{ style: 'percent' }}
      />
      <div className={styles.row}>
        <IconButton
          variant="secondary"
          icon="rotate-left"
          label="Повернуть влево"
          onPress={() => setRotation((r) => (r + 270) % 360)}
        />
        <span className={styles.note}>{rotation}°</span>
        <IconButton
          variant="secondary"
          icon="rotate-right"
          label="Повернуть вправо"
          onPress={() => setRotation((r) => (r + 90) % 360)}
        />
      </div>
      <Card>
        <Switch
          variant="row"
          leading={<img src={lake} alt="" className={styles.coverThumb} />}
          description="Эта фотография будет показываться в превью публикации."
          isSelected={cover}
          onChange={setCover}
        >
          Использовать как обложку
        </Switch>
      </Card>

      <h3 className={styles.group}>Editor: publication settings, schedule</h3>
      <RadioGroup label="Время публикации" variant="rows" value={plan} onChange={setPlan}>
        <Radio value="now">Опубликовать сейчас</Radio>
        <Radio value="later">Запланировать</Radio>
      </RadioGroup>
      <div className={styles.row}>
        <DateField label="Дата" hideLabel value={date} onChange={setDate} />
        <TimeField
          label="Время"
          hideLabel
          icon="clock"
          value={time}
          onChange={setTime}
          stepper={{ incrementLabel: 'Время: на 5 минут позже', decrementLabel: 'Время: на 5 минут раньше' }}
        />
      </div>
      <div className={styles.stack}>
        <Switch variant="row" icon="message" isSelected={comments} onChange={setComments}>
          Разрешить комментарии
        </Switch>
        <Switch variant="row" icon="bell" defaultSelected>
          Уведомлять подписчиков
        </Switch>
        <Switch variant="row" icon="pin" isSelected={pin} onChange={setPin}>
          Закрепить пост
        </Switch>
      </div>

      <h3 className={styles.group}>Editor: preview with media, text toolbar</h3>
      <FormatToolbar label="Форматирование" overflowLabel="Ещё" items={TOOLBAR} onAction={() => undefined} />
      <div className={styles.narrow}>
        <FormatToolbar label="Форматирование (узкий)" overflowLabel="Ещё" items={TOOLBAR} onAction={() => undefined} />
      </div>
      <div className={styles.narrow}>
        <FormatToolbar
          label="Форматирование (компактный)"
          overflowLabel="Ещё"
          items={TOOLBAR}
          density="compact"
          onAction={() => undefined}
        />
      </div>
      <h3 className={styles.group}>Editor: counter on the label row, text area with toolbar, lg button</h3>
      <div className={styles.stack}>
        <TextField label="Заголовок" limit={200} defaultValue="Невероятные пейзажи Алтая" />
        <TextArea
          label="Текст"
          limitPlacement="label"
          limit={4096}
          minRows={2}
          textSize="lg"
          defaultValue="Поделюсь атмосферой нашего путешествия по Алтаю!"
          toolbar={
            <FormatToolbar
              label="Форматирование поста"
              overflowLabel="Ещё"
              items={TOOLBAR}
              density="compact"
              onAction={() => undefined}
            />
          }
        />
        <Button size="lg">К публикации →</Button>
      </div>
      <TelegramPreview
        variant="panel"
        title="Невероятные пейзажи Алтая: 3 дня в горах и озёрах"
        body="Поделюсь атмосферой нашего путешествия по Алтаю! Три дня, десятки километров, горные перевалы."
        views="0"
        meta="сейчас"
        media={ALBUM}
        mediaIndex={index}
        onMediaIndexChange={setIndex}
        mediaLabels={PREVIEW_LABELS}
        showCounter
      />
      <TelegramPreview
        title="Альбом"
        body="Подпись под первым фото."
        meta="12:30"
        media={ALBUM.slice(0, 3)}
        mediaMode="album"
        mediaLabels={PREVIEW_LABELS}
      />
      <TelegramPreview
        title="Пять файлов"
        body="Два над тремя."
        meta="12:31"
        media={ALBUM}
        mediaMode="album"
        mediaLabels={PREVIEW_LABELS}
      />
    </div>
  );
}
