// Mock fixtures of the post-editor prototype (v3): real photos, two videos with posters, long Russian names.
import altai from './assets/photo-altai.jpg';
import lake from './assets/photo-lake.jpg';
import mountains from './assets/photo-mountains.jpg';
import sunset from './assets/poster-sunset.jpg';
import waterfall from './assets/poster-waterfall.jpg';

export type MediaKind = 'image' | 'video';
export type MediaStatus = 'ready' | 'queued' | 'uploading' | 'done' | 'failed';

export type PostMedia = {
  id: string;
  name: string;
  kind: MediaKind;
  /** What the tile shows: the photo, the cropped derivative, or the video poster. */
  src: string;
  /** The uploaded original; a crop always starts from it. */
  original: string;
  duration?: string;
  meta: string;
  status: MediaStatus;
  progress: number;
  failReason?: string;
  derived?: boolean;
  /** Mock upload that really ticks forward; fixtures stay frozen so screenshots are deterministic. */
  live?: boolean;
};

export const POST_MEDIA_MAX_ITEMS = 10;
export const TITLE_MAX = 200;
export const BODY_MAX = 4096;
export const PHOTO_MAX_BYTES = 10_000_000;
export const VIDEO_MAX_BYTES = 50_000_000;

export const TITLE = 'Невероятные пейзажи Алтая: 3 дня в горах и озёрах';
export const BODY =
  'Поделюсь атмосферой нашего путешествия по Алтаю! 🏔️\n' +
  'Три дня, десятки километров, горные перевалы, бирюзовые озёра и незабываемые виды.\n' +
  'В этом посте собрал лучшие кадры и короткие истории из поездки.\n' +
  'Смотрите, вдохновляйтесь и добавляйте Алтай в свой список мест на будущее! ⛰️✨';
export const LONG_TITLE = `${TITLE} — ${'очень длинное продолжение заголовка '.repeat(5)}`.slice(0, 210);
export const LONG_NAME = 'Невероятные_пейзажи_Алтая_3_дня_в_горах_и_озёрах_финальная_версия_для_публикации.jpg';

export const media = (partial: Partial<PostMedia> & Pick<PostMedia, 'id' | 'name' | 'src'>): PostMedia => ({
  kind: 'image',
  original: partial.src,
  meta: '4.2 МБ • 4032 × 3024',
  status: 'ready',
  progress: 100,
  ...partial
});

export const FIVE_MEDIA: PostMedia[] = [
  media({ id: 'm1', name: 'altai_lake.jpg', src: altai }),
  media({
    id: 'm2',
    name: 'sunrise_trekking.mp4',
    src: sunset,
    kind: 'video',
    duration: '01:24',
    meta: '128.7 МБ • 1920 × 1080 • 01:24'
  }),
  media({ id: 'm3', name: 'mountains.jpg', src: mountains, meta: '3.8 МБ • 4000 × 2670' }),
  media({
    id: 'm4',
    name: 'waterfall.mp4',
    src: waterfall,
    kind: 'video',
    duration: '00:36',
    meta: '41.2 МБ • 1920 × 1080 • 00:36'
  }),
  media({ id: 'm5', name: 'lake.jpg', src: lake, meta: '3.1 МБ • 3840 × 2700' })
];

/** The media library shown in the «Медиабиблиотека» and «Недавние» tabs (newest first). */
export const LIBRARY: PostMedia[] = [
  media({ id: 'l1', name: LONG_NAME, src: altai, meta: '4.2 МБ • 4032 × 3024' }),
  media({ id: 'l2', name: 'mountains.jpg', src: mountains }),
  media({ id: 'l3', name: 'lake.jpg', src: lake }),
  media({
    id: 'l4',
    name: 'sunrise_trekking.mp4',
    src: sunset,
    kind: 'video',
    duration: '01:24',
    meta: '128.7 МБ • 01:24'
  }),
  media({ id: 'l5', name: 'waterfall.mp4', src: waterfall, kind: 'video', duration: '00:36', meta: '41.2 МБ • 00:36' }),
  media({ id: 'l6', name: 'altai_lake.jpg', src: altai })
];

export const CHANNELS = [
  { id: 'c1', name: 'Название канала', members: '3 420 подписчиков', initial: 'К' },
  { id: 'c2', name: 'Official RU', members: '12 804 подписчика', initial: 'O' }
];

export const initialMedia = (state: string): PostMedia[] => {
  if (state === 'empty' || state === 'loading' || state === 'invalid' || state === 'add-media-empty') return [];
  if (state === 'uploading') {
    return [
      { ...FIVE_MEDIA[0]!, status: 'done', progress: 100 },
      { ...FIVE_MEDIA[1]!, status: 'uploading', progress: 65 },
      {
        ...FIVE_MEDIA[3]!,
        status: 'failed',
        progress: 60,
        failReason: 'Не удалось загрузить waterfall.mp4: соединение прервано на 60 %'
      }
    ];
  }
  if (state === 'failed') {
    return FIVE_MEDIA.map((item, index) =>
      index === 3
        ? {
            ...item,
            status: 'failed',
            progress: 0,
            failReason: 'Не удалось загрузить waterfall.mp4: размер больше 50 МБ'
          }
        : item
    );
  }
  if (state === 'limit') {
    return Array.from({ length: POST_MEDIA_MAX_ITEMS }, (_, i) => ({
      ...FIVE_MEDIA[i % 5]!,
      id: `lim${i}`
    }));
  }
  return FIVE_MEDIA.map((item) => ({ ...item }));
};

/** Fetches and decodes the fixture photos at import time, so tiles and previews never render empty (mock-only). */
if (typeof Image !== 'undefined') {
  for (const src of [altai, lake, mountains, sunset, waterfall]) {
    const image = new Image();
    image.src = src;
    // jsdom (unit tests) has no HTMLImageElement.decode.
    if (typeof image.decode === 'function') void image.decode().catch(() => undefined);
  }
}
