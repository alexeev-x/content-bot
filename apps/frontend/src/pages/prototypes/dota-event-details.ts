export type DotaFactFixture = {
  id: string;
  entityKind: 'hero' | 'item';
  entityType: string;
  entityName: string;
  section: string;
  change: string;
  direction?: string;
  before?: string;
  after?: string;
};

export type DotaEventDetailFixture = {
  updateKey: string;
  eventId: string;
  parseStatus: 'complete' | 'incomplete' | 'no_recognized_facts' | 'unavailable';
  publishedAt: string;
  detectedAt: string;
  sourceUrl: string;
  linkedDraft?: string;
  facts: DotaFactFixture[];
};

const patch741Url = 'https://www.dota2.com/datafeed/patchnotes?patch=7.41';
const patch737bUrl = 'https://www.dota2.com/datafeed/patchnotes?patch=7.37b';
const patch737aUrl = 'https://www.dota2.com/datafeed/patchnotes?patch=7.37a';
const patch737cUrl = 'https://www.dota2.com/datafeed/patchnotes?patch=7.37c';

/** Synthetic examples for the clickable prototype. These values are not production parser output. */
export const DOTA_EVENT_DETAILS: DotaEventDetailFixture[] = [
  {
    updateKey: 'patch_notes:7.41',
    eventId: 'e13',
    parseStatus: 'complete',
    publishedAt: '12 окт. 2026, 08:45 UTC+03:00',
    detectedAt: '12 окт. 2026, 09:02 UTC+03:00',
    sourceUrl: patch741Url,
    linkedDraft: '/__proto/posts/p3',
    facts: [
      {
        id: 'lina-dragon-slave',
        entityKind: 'hero',
        entityType: 'Герой',
        entityName: 'Lina',
        section: 'Способности · Dragon Slave',
        change: 'Базовый урон уменьшен на 10',
        direction: 'Уменьшение',
        before: '85 / 165 / 245 / 325',
        after: '75 / 155 / 235 / 315'
      },
      {
        id: 'blink-dagger-cooldown',
        entityKind: 'item',
        entityType: 'Предмет',
        entityName: 'Blink Dagger',
        section: 'Предметы · активная способность',
        change: 'Время восстановления увеличено на 2 секунды',
        direction: 'Увеличение',
        before: '15 сек.',
        after: '17 сек.'
      }
    ]
  },
  {
    updateKey: 'patch_notes:7.37b',
    eventId: 'e5',
    parseStatus: 'incomplete',
    publishedAt: '04 окт. 2026, 18:10 UTC+03:00',
    detectedAt: '04 окт. 2026, 18:12 UTC+03:00',
    sourceUrl: patch737bUrl,
    facts: [
      {
        id: 'tidehunter-anchor-smash',
        entityKind: 'hero',
        entityType: 'Герой',
        entityName: 'Tidehunter',
        section: 'Способности · Anchor Smash',
        change: 'Бонусный урон изменён'
      }
    ]
  },
  {
    updateKey: 'patch_notes:7.37a',
    eventId: 'e10',
    parseStatus: 'no_recognized_facts',
    publishedAt: '18 сент. 2026, 11:25 UTC+03:00',
    detectedAt: '18 сент. 2026, 11:28 UTC+03:00',
    sourceUrl: patch737aUrl,
    facts: []
  },
  {
    updateKey: 'patch_notes:7.37c',
    eventId: 'e1',
    parseStatus: 'unavailable',
    publishedAt: '02 сент. 2026, 07:50 UTC+03:00',
    detectedAt: '02 сент. 2026, 07:52 UTC+03:00',
    sourceUrl: patch737cUrl,
    facts: []
  }
];

export const dotaDetailByKey = (key: string | undefined) =>
  DOTA_EVENT_DETAILS.find((detail) => detail.updateKey === key);
export const dotaDetailByEvent = (eventId: string) => DOTA_EVENT_DETAILS.find((detail) => detail.eventId === eventId);
