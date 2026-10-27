import { AppError } from '../../shared/app-error';
import { escapeHtml, heroImage, itemImage, PICTURE_SIZE, picturePage, rankMedalImage } from './picture';
import { type PatchOutcome, patchOutcomes } from './patch-rubrics';
import { NERF_LOOKS, nerfQuestionPicture, nerfResultPicture } from './nerf-pictures';
import { VERSUS_LOOKS, VERSUS_TITLES, versusPicture } from './versus-pictures';
import {
  type HeroInfo,
  type ItemInfo,
  needStats,
  noData,
  percent,
  pick,
  poll,
  quiz,
  type RubricContext,
  type RubricSample,
  shuffled,
  withJoke
} from './types';

// Rubrics over pick and win rates by rank (STRATZ, once its token is set). Without it each answers
// STATS_NOT_CONFIGURED, so the studio shows what is waiting for the token.

const RANKS: Record<number, { name: string; on: string }> = {
  1: { name: 'Рекрут', on: 'Рекрутах' },
  2: { name: 'Страж', on: 'Стражах' },
  3: { name: 'Рыцарь', on: 'Рыцарях' },
  4: { name: 'Герой', on: 'Героях' },
  5: { name: 'Легенда', on: 'Легендах' },
  6: { name: 'Властелин', on: 'Властелинах' },
  7: { name: 'Божество', on: 'Божествах' },
  8: { name: 'Титан', on: 'Титанах' }
};
const BRACKETS = [1, 2, 3, 4, 5, 6, 7, 8];
const rank = (bracket: number) => RANKS[bracket] ?? { name: 'ранг', on: 'ранге' };

interface Share {
  hero: HeroInfo;
  matches: number;
  pickRate: number;
  winRate: number;
}

async function shares(context: RubricContext, bracket: number): Promise<Share[]> {
  const [stats, heroes] = await Promise.all([needStats(context).heroBracketStats(bracket), context.sources.heroes()]);
  const byId = new Map(heroes.map((hero) => [hero.id, hero]));
  const total = stats.reduce((sum, each) => sum + each.matches, 0);
  if (total === 0) throw noData('bracket stats');
  return stats
    .map((each) => ({
      hero: byId.get(each.heroId),
      matches: each.matches,
      // Ten heroes a match: a hero's share of matches is ten times its share of picks.
      pickRate: (each.matches / total) * 10,
      winRate: each.matches === 0 ? 0 : each.wins / each.matches
    }))
    .filter((each): each is Share => each.hero !== undefined);
}

export async function rankMeta(context: RubricContext): Promise<RubricSample> {
  const bracket = pick(BRACKETS, context.random);
  const worst = context.random() < 0.5;
  const list = (await shares(context, bracket)).filter((each) => each.pickRate >= 0.02);
  const top = worst
    ? [...list].sort((a, b) => a.winRate - b.winRate).slice(0, 5)
    : [...list].sort((a, b) => b.pickRate - a.pickRate).slice(0, 5);
  const leader = top[0];
  if (leader === undefined) throw noData('heroes');
  const cards = top
    .map(
      (each, index) => `<div class="card${index === 0 ? ' first' : ''}"><div class="place">${index + 1}</div>
<img class="portrait" src="${heroImage(each.hero.name)}" alt=""><div class="name">${escapeHtml(each.hero.localizedName)}</div>
<div class="value">${worst ? `${percent(each.winRate)} побед` : `в ${percent(each.pickRate)} игр`}</div></div>`
    )
    .join('');
  const html = picturePage(
    `<div class="title">${worst ? 'Худшие' : 'Топ-5'} на <b>${rank(bracket).on}</b></div>
<div class="row"><img class="medal" src="${rankMedalImage(bracket)}" alt=""><div class="cards">${cards}</div></div>`,
    `.row{display:flex;align-items:center;gap:40px;margin-top:64px}
.medal{width:230px;height:230px;filter:drop-shadow(0 10px 24px rgba(0,0,0,.6))}
.cards{display:flex;gap:18px;align-items:flex-end}
.card{display:flex;flex-direction:column;align-items:center;gap:12px;width:228px}
.card .portrait{width:228px;height:128px}
.card.first .portrait{border-color:var(--red);width:244px;height:137px}
.place{font-weight:900;font-size:52px;color:var(--red)}
.name{font-weight:800;font-size:28px;text-align:center}
.value{font-weight:600;font-size:26px;color:${worst ? 'var(--red)' : 'var(--good)'}}`
  );
  const names = top.map((each) => each.hero.localizedName).join(', ');
  return {
    picture: { html, ...PICTURE_SIZE },
    text: worst
      ? `Худшие по винрейту на ${rank(bracket).on}: ${names}. ${leader.hero.localizedName} выигрывает только ${percent(leader.winRate)}.\nУзнал свою тиму? 🫡`
      : `Кого чаще всего пикают на ${rank(bracket).on}: ${names}. ${leader.hero.localizedName} — в каждой ${Math.max(1, Math.round(1 / leader.pickRate))}-й игре.\nУзнал себя? 🫡`,
    poll: null
  };
}

const WINRATE_BUCKETS = [
  { label: 'до 45%', max: 0.45 },
  { label: '45–48%', max: 0.48 },
  { label: '48–51%', max: 0.51 },
  { label: 'больше 51%', max: Number.POSITIVE_INFINITY }
];

export async function guessWinrate(context: RubricContext): Promise<RubricSample> {
  const bracket = pick(BRACKETS, context.random);
  const popular = (await shares(context, bracket))
    .filter((each) => each.matches >= 500)
    .sort((a, b) => b.pickRate - a.pickRate)
    .slice(0, 40);
  const chosen = pick(popular, context.random);
  const html = picturePage(
    `<div class="title">Угадай <b>винрейт</b></div>
<div class="row"><img class="portrait big" src="${heroImage(chosen.hero.name)}" alt=""><div class="on">на</div>
<img class="medal" src="${rankMedalImage(bracket)}" alt=""></div><div class="sub">${escapeHtml(chosen.hero.localizedName)} · ${rank(bracket).name}</div>`,
    `.row{display:flex;align-items:center;gap:40px;margin-top:48px}
.portrait.big{width:576px;height:324px}
.on{font-weight:900;font-size:56px;color:var(--red)}
.medal{width:240px;height:240px}
.sub{font-size:34px;font-weight:800;margin-top:22px}`
  );
  return {
    picture: { html, ...PICTURE_SIZE },
    text: `Сколько побеждает ${chosen.hero.localizedName} на ${rank(bracket).on}? Ответ — в опросе.`,
    poll: quiz(
      `Винрейт ${chosen.hero.localizedName} на ${rank(bracket).on}?`,
      WINRATE_BUCKETS.map((bucket) => bucket.label),
      WINRATE_BUCKETS.findIndex((bucket) => chosen.winRate < bucket.max),
      `${percent(chosen.winRate)} по ${chosen.matches.toLocaleString('ru-RU')} играм.`
    )
  };
}

export async function banOrPick(context: RubricContext): Promise<RubricSample> {
  const list = (await shares(context, 7)).filter((each) => each.matches >= 300);
  const [first, second] = shuffled(list, context.random);
  if (first === undefined || second === undefined) throw noData('heroes');
  const html = picturePage(
    `<div class="title">Бан <b>или пик?</b></div><div class="row"><img class="portrait big" src="${heroImage(first.hero.name)}" alt="">
<div class="vs">VS</div><img class="portrait big" src="${heroImage(second.hero.name)}" alt=""></div>
<div class="names"><span>${escapeHtml(first.hero.localizedName)}</span><span>${escapeHtml(second.hero.localizedName)}</span></div>`,
    `.row{display:flex;align-items:center;gap:48px;margin-top:48px}
.portrait.big{width:480px;height:270px}
.vs{font-weight:900;font-size:100px;color:var(--red)}
.names{display:flex;justify-content:space-between;width:1100px;font-weight:800;font-size:34px;margin-top:16px}`
  );
  return {
    picture: { html, ...PICTURE_SIZE },
    text: `Последний пик: ${first.hero.localizedName} или ${second.hero.localizedName}? Винрейты — после голосования.`,
    poll: poll('Кого берёшь последним пиком?', [first.hero.localizedName, second.hero.localizedName])
  };
}

export async function poisonForLow(context: RubricContext): Promise<RubricSample> {
  const [low, high] = await Promise.all([shares(context, 1), shares(context, 7)]);
  const lowById = new Map(low.map((each) => [each.hero.id, each]));
  const gaps = high
    .map((each) => ({ high: each, low: lowById.get(each.hero.id) }))
    .filter(
      (each): each is { high: Share; low: Share } =>
        each.low !== undefined && each.low.matches >= 300 && each.high.matches >= 300
    )
    .sort((a, b) => b.high.winRate - b.low.winRate - (a.high.winRate - a.low.winRate));
  const top = gaps[0];
  if (top === undefined) throw noData('heroes');
  return {
    picture: null,
    text: `☠️ Яд для низов: ${top.high.hero.localizedName}.\nНа Божествах — ${percent(top.high.winRate)} побед, на Рекрутах — ${percent(top.low.winRate)}. Не берите, если не умеете.`,
    poll: null
  };
}

export async function forgottenHero(context: RubricContext): Promise<RubricSample> {
  const list = await shares(context, 7);
  const candidates = list.filter((each) => each.pickRate < 0.03 && each.winRate > 0.51 && each.matches >= 100);
  const hero = candidates.sort((a, b) => b.winRate - a.winRate)[0];
  if (hero === undefined) throw noData('heroes');
  return {
    picture: null,
    text: `🕸 Забытый герой: ${hero.hero.localizedName}.\nЕго берут в ${percent(hero.pickRate)} игр, а он выигрывает ${percent(hero.winRate)}. Почему вы его не пикаете? Пишите в комментарии.`,
    poll: null
  };
}

const TIERS = [
  { name: 'ЛЕГ', min: 0.53, color: 'var(--tier-s)' },
  { name: 'НОРМ', min: 0.5, color: 'var(--tier-a)' },
  { name: 'НОЛЬ', min: 0.47, color: 'var(--tier-b)' },
  { name: 'РАК', min: 0, color: 'var(--tier-c)' }
];

export async function tierList(context: RubricContext): Promise<RubricSample> {
  const bracket = pick(BRACKETS, context.random);
  const list = (await shares(context, bracket)).filter((each) => each.matches >= 500);
  const rows = TIERS.map((tier, index) => {
    const upper = index === 0 ? Number.POSITIVE_INFINITY : (TIERS[index - 1]?.min ?? 1);
    const heroes = list
      .filter((each) => each.winRate >= tier.min && each.winRate < upper)
      .sort((a, b) => b.pickRate - a.pickRate)
      .slice(0, 6);
    return { tier, heroes };
  });
  const html = picturePage(
    `<div class="title">Тир-лист на <b>${rank(bracket).on}</b></div><div class="tiers">${rows
      .map(
        (row) => `<div class="tier"><div class="label" style="background:${row.tier.color}">${row.tier.name}</div>
${row.heroes.map((each) => `<img class="portrait small" src="${heroImage(each.hero.name)}" alt="">`).join('')}</div>`
      )
      .join('')}</div>`,
    `.tiers{display:flex;flex-direction:column;gap:12px;margin-top:28px}
.tier{display:flex;align-items:center;gap:12px}
.label{width:150px;height:88px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:34px;color:#0b0e13}
.portrait.small{width:156px;height:88px;border-width:2px}`
  );
  return {
    picture: { html, ...PICTURE_SIZE },
    text: `Тир-лист на ${rank(bracket).on} по реальному винрейту: лег, норм, ноль и рак.\nСогласен? Кого бы переставил — в комментарии.`,
    poll: null
  };
}

async function lateBuild(context: RubricContext, heroId: number, items: Map<number, ItemInfo>): Promise<ItemInfo[]> {
  const ids = await needStats(context).heroLateItems(heroId);
  return ids
    .map((id) => items.get(id))
    .filter((item): item is ItemInfo => item !== undefined && item.cost >= 2000)
    .slice(0, 6);
}

// «Кто кого перебьёт?» (owner, 27.10.2026): two carries face to face, the picture alone — no text, no poll, no answer:
// «пусть люди сами в комментах спорят». Half the time their real late builds, half a joke build («12 танго, одни
// рецепты, Пудж с 6 Тарасками, Антимаг с 6 БФ»).
const SIX = (key: string) => Array.from({ length: 6 }, () => ({ key }));
const JOKE_BUILDS: readonly { key: string }[][] = [
  SIX('tango'),
  SIX('branches'),
  SIX('recipe'),
  SIX('rapier'),
  SIX('heart'),
  SIX('bfury'),
  SIX('magic_stick'),
  ['tango', 'clarity', 'flask', 'enchanted_mango', 'faerie_fire', 'smoke_of_deceit'].map((key) => ({ key })),
  ['ward_observer', 'dust', 'smoke_of_deceit', 'tpscroll', 'blood_grenade', 'tango'].map((key) => ({ key }))
];
/** Builds a hero is a meme for: Pudge's Tarrasques, Anti-Mage's Battle Furies. */
const HERO_JOKES: Record<string, { key: string }[]> = {
  npc_dota_hero_pudge: SIX('heart'),
  npc_dota_hero_antimage: SIX('bfury')
};

export async function whoBeatsWhom(context: RubricContext): Promise<RubricSample> {
  const [heroes, itemList] = await Promise.all([context.sources.heroes(), context.sources.items()]);
  const items = new Map(itemList.map((item) => [item.id, item]));
  const carries = heroes.filter((hero) => hero.roles.includes('Carry'));
  const [first, second] = shuffled(carries, context.random);
  if (first === undefined || second === undefined) throw noData('carries');
  const joking = context.random() < 0.5;
  const build = async (hero: HeroInfo) =>
    joking
      ? (HERO_JOKES[hero.name] ?? pick(JOKE_BUILDS, context.random))
      : (await lateBuild(context, hero.id, items)).map((item) => ({ key: item.key }));
  const [buildA, buildB] = await Promise.all([build(first), build(second)]);
  if (buildA.length < 6 || buildB.length < 6) throw noData('builds');
  const look = pick(VERSUS_LOOKS, context.random);
  return {
    picture: {
      html: versusPicture(
        look,
        { hero: first, items: buildA },
        { hero: second, items: buildB },
        pick(VERSUS_TITLES, context.random)
      ),
      ...PICTURE_SIZE
    },
    text: '',
    ownText: true,
    poll: null
  };
}

export async function whoseBuild(context: RubricContext): Promise<RubricSample> {
  const [heroes, itemList] = await Promise.all([context.sources.heroes(), context.sources.items()]);
  const items = new Map(itemList.map((item) => [item.id, item]));
  const carries = heroes.filter((hero) => hero.roles.includes('Carry'));
  const hero = pick(carries, context.random);
  const build = await lateBuild(context, hero.id, items);
  if (build.length < 6) throw noData('build');
  const others = shuffled(
    carries.filter((each) => each.id !== hero.id && each.attackType === hero.attackType),
    context.random
  ).slice(0, 3);
  const options = shuffled([hero, ...others], context.random);
  const html = picturePage(
    `<div class="title">Чья <b>сборка?</b></div><div class="row"><div class="slots">${build
      .map((item) => `<img class="item" src="${itemImage(item.key)}" alt="">`)
      .join('')}</div><div class="q">?</div></div>`,
    `.row{display:flex;align-items:center;gap:64px;margin-top:56px}
.slots{display:grid;grid-template-columns:repeat(3,176px);gap:16px}
.slots .item{width:176px;height:128px}
.q{width:320px;height:300px;border:5px dashed var(--red);border-radius:16px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:200px;color:var(--red)}`
  );
  return {
    picture: { html, ...PICTURE_SIZE },
    text: 'Шесть слотов поздней игры. Чья это сборка?',
    poll: quiz(
      'Чья сборка?',
      options.map((each) => each.localizedName),
      options.findIndex((each) => each.id === hero.id),
      `${hero.localizedName}: самая частая поздняя сборка.`
    )
  };
}

const RECORDS = [
  { title: 'самый богатый герой', value: (row: Average) => row.networth, unit: 'золота к концу игры', digits: 0 },
  { title: 'больше всех урона по героям', value: (row: Average) => row.heroDamage, unit: 'урона за игру', digits: 0 },
  { title: 'самый кровожадный герой', value: (row: Average) => row.kills, unit: 'убийств за игру', digits: 1 },
  { title: 'главный фидер', value: (row: Average) => row.deaths, unit: 'смертей за игру', digits: 1 }
];
type Average = { heroId: number; matches: number; networth: number; heroDamage: number; kills: number; deaths: number };

export async function weeklyRecord(context: RubricContext): Promise<RubricSample> {
  const [rows, heroes] = await Promise.all([needStats(context).averages(), context.sources.heroes()]);
  const record = pick(RECORDS, context.random);
  const best = rows.filter((row) => row.matches >= 500).sort((a, b) => record.value(b) - record.value(a))[0];
  const hero = heroes.find((each) => each.id === best?.heroId);
  if (best === undefined || hero === undefined) throw noData('averages');
  const value =
    record.digits === 0
      ? Math.round(record.value(best)).toLocaleString('ru-RU')
      : record.value(best).toFixed(record.digits).replace('.', ',');
  return {
    picture: null,
    text: `🏆 Рекорд недели: ${record.title} — ${hero.localizedName}.\nВ среднем ${value} ${record.unit} на Божествах и Титанах. А у тебя сколько?`,
    poll: null
  };
}

export async function heroPeak(context: RubricContext): Promise<RubricSample> {
  const heroes = shuffled(await context.sources.heroes(), context.random);
  for (const hero of heroes.slice(0, 5)) {
    const timeline = await needStats(context).heroTimeline(hero.id);
    const start = timeline.find((row) => row.minute === 0);
    const at = (minute: number) => timeline.find((row) => row.minute === minute);
    const early = at(25);
    const late = at(45);
    if (start === undefined || early === undefined || late === undefined || late.remaining < 200) continue;
    // Games over by minute 25 are the start minus those still going; games past 45 are the ones still going.
    const shortGames = start.remaining - early.remaining;
    const shortWins = start.wins - early.wins;
    if (shortGames < 200) continue;
    const shortRate = shortWins / shortGames;
    const longRate = late.wins / late.remaining;
    const html = picturePage(
      `<div class="title">Когда <b>${escapeHtml(hero.localizedName)}</b> сильнее всего</div>
<div class="row"><img class="portrait big" src="${heroImage(hero.name)}" alt="">
<div class="bars"><div class="bar"><span>игра до 25 минут</span><b class="${shortRate >= 0.5 ? 'good' : 'bad'}">${percent(shortRate)}</b></div>
<div class="bar"><span>игра дольше 45 минут</span><b class="${longRate >= 0.5 ? 'good' : 'bad'}">${percent(longRate)}</b></div></div></div>`,
      `.row{display:flex;align-items:center;gap:64px;margin-top:48px}
.portrait.big{width:448px;height:252px}
.bars{display:flex;flex-direction:column;gap:28px}
.bar{display:flex;flex-direction:column}
.bar span{font-weight:600;font-size:32px;color:var(--muted)}
.bar b{font-weight:900;font-size:88px}
.good{color:var(--good)}.bad{color:var(--red)}`
    );
    const verdict = longRate > shortRate ? 'Тяните игру.' : 'Заканчивайте быстро.';
    return {
      picture: { html, ...PICTURE_SIZE },
      text: `${hero.localizedName}: игры до 25 минут — ${percent(shortRate)} побед, дольше 45 минут — ${percent(longRate)}.\n${verdict}`,
      poll: null
    };
  }
  throw noData('timeline');
}

/** Greedy items whose win rate falls the later they are bought. */
const ANTI_ITEMS = ['hand_of_midas', 'battle_fury', 'radiance', 'maelstrom', 'armlet'];

export async function antiBuild(context: RubricContext): Promise<RubricSample> {
  const [heroes, itemList] = await Promise.all([context.sources.heroes(), context.sources.items()]);
  const anti = new Map(itemList.filter((item) => ANTI_ITEMS.includes(item.key)).map((item) => [item.id, item]));
  for (const hero of shuffled(
    heroes.filter((each) => each.roles.includes('Carry')),
    context.random
  ).slice(0, 5)) {
    const purchases = await needStats(context).heroPurchases(hero.id);
    for (const [itemId, item] of anti) {
      const rows = purchases.filter((row) => row.itemId === itemId);
      const sum = (list: typeof rows) =>
        list.reduce((acc, row) => ({ matches: acc.matches + row.matches, wins: acc.wins + row.wins }), {
          matches: 0,
          wins: 0
        });
      const early = sum(rows.filter((row) => row.minute <= 14));
      const late = sum(rows.filter((row) => row.minute >= 22));
      if (early.matches < 100 || late.matches < 100) continue;
      const earlyRate = early.wins / early.matches;
      const lateRate = late.wins / late.matches;
      if (earlyRate - lateRate < 0.05) continue;
      const html = picturePage(
        `<div class="title"><b>Антисборка</b></div>
<div class="row"><img class="portrait" src="${heroImage(hero.name)}" alt="">
<div class="itemwrap"><img class="bigitem" src="${itemImage(item.key)}" alt=""><div class="cross"></div></div>
<div class="facts"><div class="fact"><span>до 14-й минуты</span><b class="good">${percent(earlyRate)}</b></div>
<div class="fact"><span>после 22-й минуты</span><b class="bad">${percent(lateRate)}</b></div></div></div>`,
        `.row{display:flex;align-items:center;gap:48px;margin-top:56px}
.portrait{width:320px;height:180px}
.itemwrap{position:relative}
.bigitem{width:220px;height:160px;border-radius:12px;border:1px solid var(--line)}
.cross{position:absolute;inset:-8px;background:linear-gradient(35deg,transparent 46%,var(--red) 46%,var(--red) 54%,transparent 54%),linear-gradient(-35deg,transparent 46%,var(--red) 46%,var(--red) 54%,transparent 54%)}
.facts{display:flex;flex-direction:column;gap:16px}
.fact{display:flex;flex-direction:column}
.fact span{font-weight:600;font-size:30px;color:var(--muted)}
.fact b{font-weight:900;font-size:76px}
.good{color:var(--good)}.bad{color:var(--red)}`
      );
      return {
        picture: { html, ...PICTURE_SIZE },
        text: `${item.name} на ${hero.localizedName}: до 14-й минуты — ${percent(earlyRate)} побед, после 22-й — ${percent(lateRate)}.\nЗачем вы его покупаете так поздно? 🤡`,
        poll: null
      };
    }
  }
  throw noData('item timings');
}

type PositionRow = { heroId: number; position: number; matches: number; wins: number };

/** Each hero's main position by its own matches (STRATZ), not by the roles the game lists. */
function mainPositions(rows: PositionRow[]): Map<number, { position: number; share: number; total: number }> {
  const byHero = new Map<number, PositionRow[]>();
  for (const row of rows) byHero.set(row.heroId, [...(byHero.get(row.heroId) ?? []), row]);
  const main = new Map<number, { position: number; share: number; total: number }>();
  for (const [heroId, own] of byHero) {
    const total = own.reduce((sum, row) => sum + row.matches, 0);
    const top = [...own].sort((a, b) => b.matches - a.matches)[0];
    if (top !== undefined && total > 0) main.set(heroId, { position: top.position, share: top.matches / total, total });
  }
  return main;
}

export async function carryOnFive(context: RubricContext): Promise<RubricSample> {
  const [rows, heroes] = await Promise.all([needStats(context).positions(), context.sources.heroes()]);
  const main = mainPositions(rows);
  // Real carries (most matches at position 1) that some still play as a five.
  const found = heroes
    .map((hero) => {
      const own = main.get(hero.id);
      const five = rows.find((row) => row.heroId === hero.id && row.position === 5);
      return { hero, own, five, share: five === undefined || own === undefined ? 0 : five.matches / own.total };
    })
    .filter(
      (each) => each.own?.position === 1 && each.own.total >= 1000 && each.five !== undefined && each.five.matches >= 50
    )
    .sort((a, b) => b.share - a.share)[0];
  if (found === undefined || found.five === undefined) throw noData('positions');
  return {
    picture: null,
    text: `Керри на пятой 🤡\n${found.hero.localizedName} — керри, но в ${percent(found.share)} игр его берут пятой позицией. И знаете что? Там он выигрывает ${percent(found.five.wins / found.five.matches)}.`,
    poll: null
  };
}

const SIGNS: Record<number, string> = { 1: 'Керри', 2: 'Мидеры', 3: 'Хардлайнеры', 4: 'Четвёрки', 5: 'Пятёрки' };

export async function horoscope(context: RubricContext): Promise<RubricSample> {
  const stats = needStats(context);
  const [rows, positions, heroes] = await Promise.all([stats.twoWeeks(7), stats.positions(), context.sources.heroes()]);
  const main = mainPositions(positions);
  const weeks = [...new Set(rows.map((row) => row.week))].sort((a, b) => b - a);
  const [current, previous] = weeks;
  if (current === undefined || previous === undefined) throw noData('two weeks');
  const rate = (heroId: number, week: number) => {
    const row = rows.find((each) => each.heroId === heroId && each.week === week);
    return row === undefined || row.matches < 200 ? null : row.wins / row.matches;
  };
  const lines = [1, 2, 3, 4, 5]
    .map((position) => {
      const up = heroes
        .filter((hero) => main.get(hero.id)?.position === position)
        .map((hero) => {
          const now = rate(hero.id, current);
          const before = rate(hero.id, previous);
          return now === null || before === null ? null : { hero, delta: now - before };
        })
        .filter((each): each is { hero: HeroInfo; delta: number } => each !== null)
        .sort((a, b) => b.delta - a.delta)[0];
      if (up === undefined || up.delta <= 0) return null;
      const points = (up.delta * 100).toFixed(1).replace('.', ',');
      return `${SIGNS[position] ?? 'Все'}: звёзды за ${up.hero.localizedName} — +${points}% побед за неделю.`;
    })
    .filter((line): line is string => line !== null);
  if (lines.length === 0) throw noData('moves');
  return {
    picture: null,
    text: `🔮 Дота-гороскоп на неделю (Божества):\n${lines.join('\n')}`,
    poll: null
  };
}

/** Rubrics that still lack a data source. */
export function notBuiltYet(what: string): Promise<RubricSample> {
  return Promise.reject(
    new AppError('UNAVAILABLE', `The rubric has no data source yet: ${what}`, { reason: 'NOT_BUILT_YET' })
  );
}

// «Кого понерфят?» (owner, 27.10.2026: «эти герои слишком сильные — понерфят ли, или Valve вообще похуй»): a bet on the
// next patch. The heroes strongest this week over every rank together (owner, 27.10.2026: «просто без рангов») whose
// win rate also went up against the week before; neither the patch's buffs («Кто теперь имба?») nor one rank's plain
// meta («Мета по рангам», «Тир-лист») picks them.
const NERF_BRACKETS = BRACKETS;
const NERF_MIN_MATCHES = 2000;
const NERF_HEROES_MAX = 5;
const VALVE_DONT_CARE = ['Никого, Valve похуй', 'Никого, Valve опять спит', 'Valve похуй, они делают кейсы'] as const;

export async function whoGetsNerfed(context: RubricContext): Promise<RubricSample> {
  const stats = needStats(context);
  const [rows, heroes] = await Promise.all([
    Promise.all(NERF_BRACKETS.map((bracket) => stats.twoWeeks(bracket))).then((each) => each.flat()),
    context.sources.heroes()
  ]);
  const weeks = [...new Set(rows.map((row) => row.week))].sort((a, b) => b - a);
  const [current, previous] = weeks;
  if (current === undefined || previous === undefined) throw noData('two weeks');
  // Every rank summed: STRATZ counts each bracket apart.
  const week = (heroId: number, which: number) =>
    rows
      .filter((row) => row.heroId === heroId && row.week === which)
      .reduce((sum, row) => ({ matches: sum.matches + row.matches, wins: sum.wins + row.wins }), {
        matches: 0,
        wins: 0
      });
  const top = heroes
    .map((hero) => {
      const now = week(hero.id, current);
      const before = week(hero.id, previous);
      if (now.matches < NERF_MIN_MATCHES || before.matches < NERF_MIN_MATCHES) return null;
      const winRate = now.wins / now.matches;
      return { hero, winRate, growth: winRate - before.wins / before.matches };
    })
    .filter((each): each is { hero: HeroInfo; winRate: number; growth: number } => each !== null)
    .filter((each) => each.winRate > 0.5 && each.growth > 0)
    // Strong now counts more than the rise: a 54% hero that rose 0.5% is a likelier nerf than a 51% one that rose 2%.
    .sort((a, b) => b.winRate + b.growth / 2 - (a.winRate + a.growth / 2))
    .slice(0, NERF_HEROES_MAX);
  if (top.length < 3) throw noData('strong rising heroes');
  // No arrow: the AI writer retells each line in words, the rich message makes no table of it.
  const lines = top.map(
    (each) =>
      `${each.hero.localizedName}: ${percent(each.winRate)} побед, за неделю винрейт вырос на ${percent(each.growth)}`
  );
  const result = await patchOutcomes(
    context,
    top.map((each) => each.hero.id)
  );
  const verdicts = top.map((each) => ({ ...each, outcome: result.outcomes.get(each.hero.id) ?? 'untouched' }));
  // The question and its result keep one look; A and B take turns at random (owner, 27.10.2026).
  const look = pick(NERF_LOOKS, context.random);
  return {
    picture: { html: nerfQuestionPicture(look, top), ...PICTURE_SIZE },
    text: ['Эти герои сейчас слишком сильные:', ...lines].join('\n'),
    followUp: {
      afterMinutes: null,
      picture: { html: nerfResultPicture(look, verdicts, result.version), ...PICTURE_SIZE },
      text: nerfResultText(
        result.version,
        verdicts.map((each) => ({ name: each.hero.localizedName, outcome: each.outcome })),
        context.random
      )
    },
    poll: poll(
      'Кого понерфят в следующем патче?',
      withJoke(
        top.map((each) => each.hero.localizedName),
        context.random,
        VALVE_DONT_CARE
      )
    )
  };
}

const OUTCOME_WORDS: Record<PatchOutcome, string> = {
  nerfed: 'понерфили',
  buffed: 'апнули ещё сильнее',
  changed: 'переделали',
  untouched: 'не тронули'
};
const NOBODY_NERFED = [
  'Никого не понерфили. Valve, как обычно, похуй.',
  'Ноль нерфов. Valve смотрит на эти винрейты и кивает.',
  'Никого не тронули: в Valve, видимо, все на них и играют.'
] as const;

/** «Угадали?»: the second post, after the next patch — what Valve did to each hero of the bet. */
function nerfResultText(
  version: string,
  heroes: { name: string; outcome: PatchOutcome }[],
  random: () => number
): string {
  const nerfed = heroes.filter((each) => each.outcome === 'nerfed').length;
  const verdict =
    nerfed === 0
      ? pick(NOBODY_NERFED, random)
      : nerfed === heroes.length
        ? 'Порезали всех. Кто ставил на нерф — красавчик.'
        : `Понерфили ${nerfed} из ${heroes.length}. Кто угадал — красавчик.`;
  return [
    // The post stands alone (owner: never point to another post): the heroes are named, the bet is not.
    `Вышел патч ${version}. Что Valve сделала с самыми сильными героями:`,
    ...heroes.map((each) => `${each.name} — ${OUTCOME_WORDS[each.outcome]}`),
    verdict
  ].join('\n');
}
