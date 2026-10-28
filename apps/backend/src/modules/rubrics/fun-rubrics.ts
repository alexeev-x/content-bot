import { type HeroInfo, noData, pick, poll, type RubricContext, type RubricSample, shuffled, withJoke } from './types';

// The channel's creative rubrics (owner, 27.10.2026: «пока просто общее сделай, потом каждый по одному»): a hero, an
// ability or an item from live data plus a line from a small bank, and the AI writer makes the joke. The facts go to
// `reference`, not the draft: the writer must keep every number of a draft, and a joke post needs none of them.

// «Что если…»: a hero in an ordinary job; the line completes «Что если бы <hero> …».
const WHAT_IF_SCENES = [
  'работал мясником на рынке',
  'показывал фокусы в электричке',
  'был сапёром в ЖЭКе',
  'продавал мороженое на пляже',
  'таксовал по ночам',
  'работал охранником в Пятёрочке',
  'вёл физру в школе',
  'развозил еду курьером',
  'был вахтёром в общаге'
] as const;

export async function whatIf(context: RubricContext): Promise<RubricSample> {
  const hero = pick(await context.sources.heroes(), context.random);
  return {
    picture: null,
    text: `Что если бы ${hero.localizedName} ${pick(WHAT_IF_SCENES, context.random)}?`,
    poll: null
  };
}

// «Признавайтесь»: a setup and two answers as reactions; final as written, the joke is the second answer.
const CONFESSIONS: readonly { setup: string; first: string; second: string }[] = [
  { setup: 'Олды тут?', first: 'Я олд — ❤️', second: 'Я куколд — 😂' },
  {
    setup: 'Кто хоть раз ливал из рейтинга?',
    first: 'Ливал, каюсь — ❤️',
    second: 'Я не ливаю, у меня свет отключили — 😂'
  },
  { setup: 'Кто покупал варды на керри?', first: 'Покупал — ❤️', second: 'Варды — для бомжей — 😂' },
  { setup: 'Кто писал «гг» на десятой минуте?', first: 'Писал — ❤️', second: 'Я писал «гг изи» и проигрывал — 😂' },
  { setup: 'Кто играл на чужом аккаунте?', first: 'Было дело — ❤️', second: 'Я и сейчас на нём — 😂' },
  { setup: 'Кто брал Пуджа и не попал ни одного хука?', first: 'Это я — ❤️', second: 'Я попал. В своего — 😂' },
  { setup: 'Кто репортил своего саппорта?', first: 'Репортил — ❤️', second: 'Я и есть этот саппорт — 😂' },
  { setup: 'Кто бросал доту навсегда?', first: 'Бросал, вернулся — ❤️', second: 'Бросаю каждый вечер — 😂' },
  { setup: 'Кто мьютит всю команду с первой минуты?', first: 'Мьючу всех — ❤️', second: 'Меня мьютят первым — 😂' }
];

export function confess(context: RubricContext): Promise<RubricSample> {
  const chosen = pick(CONFESSIONS, context.random);
  return Promise.resolve({
    picture: null,
    text: [chosen.setup, '', chosen.first, chosen.second].join('\n'),
    ownText: true,
    poll: null
  });
}

// «Объясни как дебилу»: one real ability explained through something from home life; its numbers are background.
export async function explainDumb(context: RubricContext): Promise<RubricSample> {
  const hero = pick(await context.sources.heroes(), context.random);
  const detail = await context.sources.heroDetail(hero.id);
  const ability = pick(
    detail.abilities.filter((each) => each.cooldowns.some((value) => value > 0)),
    context.random
  );
  const values = ability.values
    .filter((value) => value.heading !== '' && value.values.some((each) => each !== 0))
    .slice(0, 4)
    .map((value) => `${value.heading} ${value.values.join(' / ')}`);
  return {
    picture: null,
    text: `${hero.localizedName}: ${ability.name}${ability.isUltimate ? ' (ульта)' : ''}.`,
    reference: [
      `Перезарядка: ${ability.cooldowns.join(' / ')} с`,
      ...(ability.manaCosts.some((value) => value > 0) ? [`Мана: ${ability.manaCosts.join(' / ')}`] : []),
      ...values
    ].join('\n'),
    poll: null
  };
}

// «Переводчик с токсичного»: what players really mean by a chat classic.
const TOXIC_PHRASES = [
  'мид где',
  'гг изи',
  'репорт',
  'ты где был',
  'я фармлю',
  'на меня 5 человек',
  'го фф',
  'не фидь',
  'саппорт, где варды',
  'я не лагаю',
  'лес мой',
  'у меня ульта на кд'
] as const;

export function toxicTranslator(context: RubricContext): Promise<RubricSample> {
  return Promise.resolve({
    picture: null,
    text: `«${pick(TOXIC_PHRASES, context.random)}»`,
    poll: null
  });
}

// «Способность в жизнь»: a hero's abilities as a choice for everyday life; the poll asks, the post retells them.
const LIFE_ABILITIES_MAX = 4;

export async function abilityInLife(context: RubricContext): Promise<RubricSample> {
  const hero = pick(await context.sources.heroes(), context.random);
  const detail = await context.sources.heroDetail(hero.id);
  const names = [
    ...new Set(
      detail.abilities
        .filter((each) => each.name.trim() !== '' && each.cooldowns.some((value) => value > 0))
        .map((each) => each.name.trim())
    )
  ].slice(0, LIFE_ABILITIES_MAX);
  if (names.length < 2) throw noData('abilities');
  return {
    picture: null,
    text: [`Способности ${hero.localizedName} — в обычную жизнь:`, ...names].join('\n'),
    poll: poll(`Какую способность ${hero.localizedName} взял бы в жизнь?`, withJoke(names, context.random))
  };
}

// «Анкета»: a hero's real facts in a document of a random genre.
const PROFILE_GENRES = ['Медкарта', 'Резюме', 'Анкета знакомств', 'Анонимные руинеры: карточка участника'] as const;
const ATTACK_TYPES: Record<HeroInfo['attackType'], string> = { Melee: 'ближний бой', Ranged: 'дальний бой' };

export async function heroProfile(context: RubricContext): Promise<RubricSample> {
  const hero = pick(await context.sources.heroes(), context.random);
  const detail = await context.sources.heroDetail(hero.id);
  const genre = pick(PROFILE_GENRES, context.random);
  return {
    picture: null,
    text: `${genre}: ${hero.localizedName}.`,
    reference: [
      `Роли: ${hero.roles.join(', ')}`,
      `Атака: ${ATTACK_TYPES[hero.attackType]}, дальность ${hero.attackRange}`,
      `Скорость: ${hero.moveSpeed}`,
      `Способности: ${detail.abilities
        .map((each) => each.name.trim())
        .filter((name) => name !== '')
        .join(', ')}`
    ].join('\n'),
    poll: null
  };
}

// «Инструкция по применению»: a big item written up as a medicine leaflet.
export async function itemLeaflet(context: RubricContext): Promise<RubricSample> {
  const items = await context.sources.items();
  const byKey = new Map(items.map((item) => [item.key, item]));
  const item = pick(
    items.filter((each) => each.cost >= 2000),
    context.random
  );
  const parts = item.components.map((key) => byKey.get(key)?.name).filter((name) => name !== undefined);
  return {
    picture: null,
    text: `${item.name}: инструкция по применению.`,
    reference: [
      `Стоимость: ${item.cost} золота`,
      ...(parts.length === 0 ? [] : [`Собирается из: ${parts.join(', ')}`])
    ].join('\n'),
    poll: null
  };
}

// «Что выберешь?»: two Dota punishments, the answer as a reaction; final as written.
const PUNISHMENTS: readonly [string, string][] = [
  ['Всю жизнь играть с пингом 150', 'Всю жизнь играть без звука'],
  ['Каждую катку саппорт без вардов', 'Каждую катку мидер на Пудже'],
  ['Пять Техисов в своей команде', 'Пять Техисов у врага'],
  ['Никогда больше не получить мид', 'Никогда больше не получить керри'],
  ['Тиммейт, который пишет в чат каждую секунду', 'Тиммейт, который молча фидит'],
  ['Проиграть десять игр подряд', 'Выиграть одну, но с репортами от всей тимы'],
  ['Мейнить только Пуджа', 'Мейнить только Мипо'],
  ['Играть без миникарты', 'Покупать всё только через курьера'],
  ['Каждая катка — 90 минут', 'В каждой катке — ливер']
];

export function wouldYouRather(context: RubricContext): Promise<RubricSample> {
  const [first, second] = pick(PUNISHMENTS, context.random);
  return Promise.resolve({
    picture: null,
    text: [first, 'или', second, '', '❤️ — первое, 😂 — второе'].join('\n'),
    ownText: true,
    poll: null
  });
}

// «Ты на линии»: a carry against an offlaner; the writer sets the lane and stops at one decision.
export async function onLane(context: RubricContext): Promise<RubricSample> {
  const heroes = await context.sources.heroes();
  const carry = pick(
    heroes.filter((hero) => hero.roles.includes('Carry')),
    context.random
  );
  const offlaner = shuffled(
    heroes.filter((hero) => hero.id !== carry.id && hero.roles.includes('Durable') && hero.roles.includes('Initiator')),
    context.random
  )[0];
  if (offlaner === undefined) throw noData('offlaners');
  return {
    picture: null,
    text: `Ты — ${carry.localizedName} на лёгкой линии. Против тебя — ${offlaner.localizedName}.`,
    poll: null
  };
}

// «Токсик-бинго»: the writer fills a 3×3 card of chat lines and match moments (text for now).
export function toxicBingo(): Promise<RubricSample> {
  return Promise.resolve({ picture: null, text: 'Токсик-бинго на сегодняшнюю катку.', poll: null });
}

// «Тир-лист хуйни»: a theme ranked S to D by the writer.
const TRASH_THEMES = [
  'причины слива',
  'оправдания после проигрыша',
  'кого винят в проигрыше',
  'что пишут в чат после первой смерти',
  'зачем покупают курьера на десятой минуте',
  'почему не ставят варды',
  'куда уходят керри вместо файта',
  'что делают мидеры после проигранной линии'
] as const;

export function trashTier(context: RubricContext): Promise<RubricSample> {
  return Promise.resolve({
    picture: null,
    text: `Тема: ${pick(TRASH_THEMES, context.random)}.`,
    poll: null
  });
}
