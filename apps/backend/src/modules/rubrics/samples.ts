import { AppError } from '../../shared/app-error';
import { escapeHtml, heroImage, itemImage, PICTURE_SIZE, picturePage, rankMedalImage } from './picture';

// A rubric's post built from live data (owner, 25.10.2026: «нажимать кнопку рубрики, и мне просто в бот присылать»).
// The texts are templates over real numbers, not the AI writer: the owner judges the look and the data first.

export type RubricKey =
  'rank_meta' | 'who_beats_whom' | 'anti_build' | 'guess_winrate' | 'daily_record' | 'whose_ability';

type Bracket = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** The data a rubric reads; `app/` wires it to OpenDota. */
export interface RubricHero {
  id: number;
  name: string;
  localizedName: string;
  roles: string[];
  attackType: string;
  brackets: Record<Bracket, { picks: number; wins: number }>;
}
export interface RubricItem {
  id: number;
  key: string;
  name: string;
  cost: number | null;
}
export interface RubricAbility {
  key: string;
  name: string;
  cooldown: string[];
  manaCost: string[];
  attributes: { header: string; value: string[] }[];
}
export interface RubricData {
  heroStats(): Promise<RubricHero[]>;
  items(): Promise<Map<number, RubricItem>>;
  heroItemPopularity(heroId: number): Promise<Record<'start' | 'early' | 'mid' | 'late', Map<number, number>>>;
  records(
    field: 'duration' | 'kills' | 'gold_per_min'
  ): Promise<{ matchId: number; heroId: number | null; score: number }[]>;
  itemTimings(itemKey: string): Promise<{ time: number; games: number; wins: number }[]>;
  heroAbilities(): Promise<Map<string, string[]>>;
  abilities(keys: readonly string[]): Promise<Map<string, RubricAbility>>;
}

export interface RubricSample {
  picture: { html: string; width: number; height: number } | null;
  /** Plain text: the caption under the picture, or the message itself. */
  text: string;
  poll: {
    question: string;
    options: string[];
    type: 'regular' | 'quiz';
    correctOption: number | null;
    explanation: string | null;
  } | null;
}

const RANKS: Record<Bracket, { name: string; on: string }> = {
  1: { name: 'Рекрут', on: 'Рекрутах' },
  2: { name: 'Страж', on: 'Стражах' },
  3: { name: 'Рыцарь', on: 'Рыцарях' },
  4: { name: 'Герой', on: 'Героях' },
  5: { name: 'Легенда', on: 'Легендах' },
  6: { name: 'Властелин', on: 'Властелинах' },
  7: { name: 'Божество', on: 'Божествах' },
  8: { name: 'Титан', on: 'Титанах' }
};

const percent = (value: number) => `${(value * 100).toFixed(1).replace('.', ',')}%`;

function pick<T>(list: readonly T[], random: () => number): T {
  const item = list[Math.floor(random() * list.length)];
  if (item === undefined) throw new AppError('UNAVAILABLE', 'No data for the rubric', { reason: 'NO_DATA' });
  return item;
}

function shuffled<T>(list: readonly T[], random: () => number): T[] {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other] as T, copy[index] as T];
  }
  return copy;
}

/** OpenDota leaves the Titan bracket empty, so rubrics read Рекрут…Божество. */
const PLAYABLE_BRACKETS: Bracket[] = [1, 2, 3, 4, 5, 6, 7];

function bracketShares(heroes: RubricHero[], bracket: Bracket) {
  const totalPicks = heroes.reduce((sum, hero) => sum + hero.brackets[bracket].picks, 0);
  if (totalPicks === 0) throw new AppError('UNAVAILABLE', 'No picks in this bracket', { reason: 'NO_DATA' });
  return heroes.map((hero) => {
    const { picks, wins } = hero.brackets[bracket];
    // Ten heroes a match: a hero's share of matches is ten times its share of picks.
    return { hero, pickRate: (picks / totalPicks) * 10, winRate: picks === 0 ? 0 : wins / picks, picks };
  });
}

async function rankMeta(data: RubricData, random: () => number): Promise<RubricSample> {
  const heroes = await data.heroStats();
  const bracket = pick(PLAYABLE_BRACKETS, random);
  const worst = random() < 0.5;
  const shares = bracketShares(heroes, bracket).filter((each) => each.pickRate >= 0.02);
  const top = worst
    ? [...shares].sort((a, b) => a.winRate - b.winRate).slice(0, 5)
    : [...shares].sort((a, b) => b.pickRate - a.pickRate).slice(0, 5);
  const rank = RANKS[bracket];
  const cards = top
    .map(
      (each, index) => `<div class="card${index === 0 ? ' first' : ''}">
  <div class="place">${index + 1}</div>
  <img class="portrait" src="${heroImage(each.hero.name)}" alt="">
  <div class="name">${escapeHtml(each.hero.localizedName)}</div>
  <div class="value">${worst ? `${percent(each.winRate)} побед` : `в ${percent(each.pickRate)} игр`}</div>
</div>`
    )
    .join('');
  const html = picturePage(
    `<div class="title">${worst ? 'Худшие' : 'Топ-5'} на <b>${rank.on}</b></div>
<div class="row"><img class="medal" src="${rankMedalImage(bracket)}" alt=""><div class="cards">${cards}</div></div>`,
    `.row{display:flex;align-items:center;gap:40px;margin-top:64px}
.medal{width:230px;height:230px;filter:drop-shadow(0 10px 24px rgba(0,0,0,.6))}
.cards{display:flex;gap:18px;align-items:flex-end}
.card{display:flex;flex-direction:column;align-items:center;gap:12px;width:228px}
.card .portrait{width:228px;height:128px}
.card.first .portrait{border-color:#e8b04a;width:244px;height:137px}
.place{font-weight:900;font-size:52px;color:#e8b04a}
.name{font-weight:800;font-size:28px;text-align:center}
.value{font-weight:600;font-size:26px;color:${worst ? '#e46a5a' : '#7fd18f'}}`
  );
  const names = top.map((each) => each.hero.localizedName).join(', ');
  const text = worst
    ? `Худшие по винрейту на ${rank.on}: ${names}. ${top[0]?.hero.localizedName ?? ''} выигрывает только ${percent(top[0]?.winRate ?? 0)} игр.\nУзнал свою тиму? 🫡`
    : `Кого чаще всего пикают на ${rank.on}: ${names}. ${top[0]?.hero.localizedName ?? ''} — в каждой ${Math.round(1 / (top[0]?.pickRate ?? 1))}-й игре.\nУзнал себя? 🫡`;
  return { picture: { html, ...PICTURE_SIZE }, text, poll: null };
}

/** Late items worth a slot: no boots-only, consumables or recipes below 2 000 gold. */
async function lateBuild(data: RubricData, items: Map<number, RubricItem>, heroId: number): Promise<RubricItem[]> {
  const popularity = await data.heroItemPopularity(heroId);
  const counts = new Map<number, number>();
  for (const stage of [popularity.mid, popularity.late]) {
    for (const [id, total] of stage) counts.set(id, (counts.get(id) ?? 0) + total);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => items.get(id))
    .filter(
      (item): item is RubricItem => item !== undefined && (item.cost ?? 0) >= 2000 && !item.key.startsWith('recipe_')
    )
    .slice(0, 6);
}

async function whoBeatsWhom(data: RubricData, random: () => number): Promise<RubricSample> {
  const [heroes, items] = await Promise.all([data.heroStats(), data.items()]);
  const carries = heroes.filter((hero) => hero.roles.includes('Carry'));
  const first = pick(carries, random);
  const second = pick(
    carries.filter((hero) => hero.id !== first.id),
    random
  );
  const [buildA, buildB] = await Promise.all([lateBuild(data, items, first.id), lateBuild(data, items, second.id)]);
  if (buildA.length < 6 || buildB.length < 6) {
    throw new AppError('UNAVAILABLE', 'Not enough build data', { reason: 'NO_DATA' });
  }
  const side = (hero: RubricHero, build: RubricItem[]) => `<div class="side">
  <img class="portrait big" src="${heroImage(hero.name)}" alt="">
  <div class="name">${escapeHtml(hero.localizedName)}</div>
  <div class="slots">${build.map((item) => `<img class="item" src="${itemImage(item.key)}" alt="">`).join('')}</div>
</div>`;
  const html = picturePage(
    `<div class="title">Кто кого <b>перебьёт?</b></div>
<div class="arena">${side(first, buildA)}<div class="vs">VS</div>${side(second, buildB)}</div>`,
    `.arena{display:flex;align-items:center;gap:56px;margin-top:40px}
.side{display:flex;flex-direction:column;align-items:center;gap:14px}
.portrait.big{width:384px;height:216px}
.name{font-weight:800;font-size:32px}
.slots{display:grid;grid-template-columns:repeat(3,132px);gap:12px}
.slots .item{width:132px;height:96px}
.vs{font-weight:900;font-size:110px;color:#e8b04a;text-shadow:0 6px 24px rgba(0,0,0,.7)}`
  );
  return {
    picture: { html, ...PICTURE_SIZE },
    text: `Лейт, шесть слотов, 1 на 1: ${first.localizedName} или ${second.localizedName}?\nЧто бы поменяли в сборке — пишите в комментарии.`,
    poll: {
      question: 'Кто выиграет 1 на 1?',
      options: [first.localizedName, second.localizedName],
      type: 'regular',
      correctOption: null,
      explanation: null
    }
  };
}

const ANTI_ITEMS = [
  { key: 'hand_of_midas', name: 'Мидас' },
  { key: 'radiance', name: 'Радиант' },
  { key: 'battle_fury', name: 'Бфка' }
] as const;

async function antiBuild(data: RubricData, random: () => number): Promise<RubricSample> {
  const item = pick(ANTI_ITEMS, random);
  const rows = await data.itemTimings(item.key);
  const byTime = new Map<number, { games: number; wins: number }>();
  for (const row of rows) {
    const bucket = byTime.get(row.time) ?? { games: 0, wins: 0 };
    bucket.games += row.games;
    bucket.wins += row.wins;
    byTime.set(row.time, bucket);
  }
  const buckets = [...byTime.entries()].filter(([, each]) => each.games >= 100).sort((a, b) => a[0] - b[0]);
  const early = buckets[0];
  const late = buckets.at(-1);
  if (early === undefined || late === undefined || early === late) {
    throw new AppError('UNAVAILABLE', 'Not enough timing data', { reason: 'NO_DATA' });
  }
  const earlyRate = early[1].wins / early[1].games;
  const lateRate = late[1].wins / late[1].games;
  const earlyMin = Math.round(early[0] / 60);
  const lateMin = Math.round(late[0] / 60);
  const html = picturePage(
    `<div class="title"><b>Антисборка</b></div>
<div class="row">
  <div class="itemwrap"><img class="bigitem" src="${itemImage(item.key)}" alt=""><div class="cross"></div></div>
  <div class="facts">
    <div class="fact"><span class="label">к ${earlyMin}-й минуте</span><span class="good">${percent(earlyRate)}</span></div>
    <div class="fact"><span class="label">к ${lateMin}-й минуте</span><span class="bad">${percent(lateRate)}</span></div>
    <div class="note">побед с предметом</div>
  </div>
</div>`,
    `.row{display:flex;align-items:center;gap:80px;margin-top:60px}
.itemwrap{position:relative}
.bigitem{width:264px;height:192px;border-radius:14px;border:4px solid #3a2a20;box-shadow:0 14px 40px rgba(0,0,0,.6)}
.cross{position:absolute;inset:-10px;background:
linear-gradient(35deg,transparent 46%,#d4382a 46%,#d4382a 54%,transparent 54%),
linear-gradient(-35deg,transparent 46%,#d4382a 46%,#d4382a 54%,transparent 54%)}
.facts{display:flex;flex-direction:column;gap:18px}
.fact{display:flex;align-items:baseline;gap:24px}
.label{font-weight:600;font-size:38px;color:#cbbfae;min-width:330px}
.good,.bad{font-weight:900;font-size:92px}
.good{color:#7fd18f}.bad{color:#e46a5a}
.note{font-weight:600;font-size:26px;color:#8f8173}`
  );
  return {
    picture: { html, ...PICTURE_SIZE },
    text: `${item.name} к ${earlyMin}-й минуте — ${percent(earlyRate)} побед. К ${lateMin}-й — уже ${percent(lateRate)}.\nЗачем вы его покупаете так поздно? 🤡`,
    poll: null
  };
}

const WINRATE_BUCKETS = [
  { label: 'до 45%', max: 0.45 },
  { label: '45–48%', max: 0.48 },
  { label: '48–51%', max: 0.51 },
  { label: 'больше 51%', max: Number.POSITIVE_INFINITY }
] as const;

async function guessWinrate(data: RubricData, random: () => number): Promise<RubricSample> {
  const heroes = await data.heroStats();
  const bracket = pick(PLAYABLE_BRACKETS, random);
  const popular = bracketShares(heroes, bracket)
    .filter((each) => each.picks >= 500)
    .sort((a, b) => b.pickRate - a.pickRate)
    .slice(0, 40);
  const chosen = pick(popular, random);
  const correct = WINRATE_BUCKETS.findIndex((bucket) => chosen.winRate < bucket.max);
  const rank = RANKS[bracket];
  const html = picturePage(
    `<div class="title">Угадай <b>винрейт</b></div>
<div class="row"><img class="portrait big" src="${heroImage(chosen.hero.name)}" alt="">
<div class="on">на</div><img class="medal" src="${rankMedalImage(bracket)}" alt=""></div>
<div class="sub">${escapeHtml(chosen.hero.localizedName)} · ${rank.name}</div>`,
    `.row{display:flex;align-items:center;gap:40px;margin-top:48px}
.portrait.big{width:576px;height:324px}
.on{font-weight:900;font-size:56px;color:#e8b04a}
.medal{width:240px;height:240px;filter:drop-shadow(0 10px 24px rgba(0,0,0,.6))}
.sub{font-size:34px;font-weight:800;margin-top:22px;color:#f3eee6}`
  );
  return {
    picture: { html, ...PICTURE_SIZE },
    text: `Сколько побеждает ${chosen.hero.localizedName} на ${rank.on}? Ответ — в опросе.`,
    poll: {
      question: `Винрейт ${chosen.hero.localizedName} на ${rank.on}?`,
      options: WINRATE_BUCKETS.map((bucket) => bucket.label),
      type: 'quiz',
      correctOption: correct,
      explanation: `${percent(chosen.winRate)} по ${chosen.picks.toLocaleString('ru-RU')} играм на ${rank.on}.`
    }
  };
}

function duration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours} ч ${minutes} мин` : `${minutes} мин ${Math.round(seconds % 60)} с`;
}

const RECORDS = [
  { field: 'duration', title: 'самый долгий матч', format: (score: number) => duration(score) },
  { field: 'kills', title: 'больше всех убийств за игру', format: (score: number) => `${score} убийств` },
  { field: 'gold_per_min', title: 'самый богатый герой', format: (score: number) => `${score} золота в минуту` }
] as const;

async function dailyRecord(data: RubricData, random: () => number): Promise<RubricSample> {
  const record = pick(RECORDS, random);
  const [rows, heroes] = await Promise.all([data.records(record.field), data.heroStats()]);
  const best = [...rows].sort((a, b) => b.score - a.score)[0];
  if (best === undefined) throw new AppError('UNAVAILABLE', 'No records', { reason: 'NO_DATA' });
  const hero = heroes.find((each) => each.id === best.heroId);
  const who = hero === undefined ? '' : ` — на ${hero.localizedName}`;
  return {
    picture: null,
    text: `🏆 Рекорд суток: ${record.title}${who}.\n${record.format(best.score)}. А у тебя какой рекорд?`,
    poll: null
  };
}

const ATTRIBUTE_LABELS: Record<string, string> = {
  DURATION: 'Длительность',
  'STUN DURATION': 'Оглушение',
  DAMAGE: 'Урон',
  RADIUS: 'Радиус',
  'CAST RANGE': 'Дальность'
};

const firstNumber = (values: readonly string[]) => Number.parseFloat(values[0] ?? '');

async function whoseAbility(data: RubricData, random: () => number): Promise<RubricSample> {
  const [heroes, slots] = await Promise.all([data.heroStats(), data.heroAbilities()]);
  // The ultimate is the last real slot; «generic_hidden» fills empty ones.
  const ultimates = heroes
    .map((hero) => {
      const keys = (slots.get(hero.name) ?? []).filter((key) => key !== 'generic_hidden' && !key.endsWith('_empty'));
      return { hero, key: keys.at(-1) };
    })
    .filter((each): each is { hero: RubricHero; key: string } => each.key !== undefined);
  const abilities = await data.abilities(ultimates.map((each) => each.key));
  const usable = ultimates
    .map((each) => ({ ...each, ability: abilities.get(each.key) }))
    .filter(
      (each): each is { hero: RubricHero; key: string; ability: RubricAbility } =>
        each.ability !== undefined &&
        each.ability.cooldown.length >= 3 &&
        Number.isFinite(firstNumber(each.ability.cooldown))
    );
  const answer = pick(usable, random);
  const cooldown = firstNumber(answer.ability.cooldown);
  // Distractors: the three ultimates nearest in cooldown, so the numbers alone do not give it away.
  const distractors = usable
    .filter((each) => each.hero.id !== answer.hero.id)
    .sort(
      (a, b) =>
        Math.abs(firstNumber(a.ability.cooldown) - cooldown) - Math.abs(firstNumber(b.ability.cooldown) - cooldown)
    )
    .slice(0, 3);
  const options = shuffled([answer, ...distractors], random);
  const lines = [`Перезарядка: ${answer.ability.cooldown.join(' / ')} с`];
  if (answer.ability.manaCost.some((cost) => Number.parseFloat(cost) > 0)) {
    lines.push(`Мана: ${answer.ability.manaCost.join(' / ')}`);
  }
  // OpenDota's labels are English; only the ones with a Russian name go into the post.
  for (const each of answer.ability.attributes) {
    const label = ATTRIBUTE_LABELS[each.header.replace(/:$/, '').trim().toUpperCase()];
    if (label !== undefined && each.value.length > 0 && lines.length < 4) {
      lines.push(`${label}: ${each.value.join(' / ')}`);
    }
  }
  return {
    picture: null,
    text: `Чья ульта? Только цифры:\n${lines.join('\n')}`,
    poll: {
      question: 'Чья это ульта?',
      options: options.map((each) => each.hero.localizedName),
      type: 'quiz',
      correctOption: options.findIndex((each) => each.hero.id === answer.hero.id),
      explanation: `${answer.ability.name} — ${answer.hero.localizedName}.`.slice(0, 200)
    }
  };
}

const BUILDERS: Record<RubricKey, (data: RubricData, random: () => number) => Promise<RubricSample>> = {
  rank_meta: rankMeta,
  who_beats_whom: whoBeatsWhom,
  anti_build: antiBuild,
  guess_winrate: guessWinrate,
  daily_record: dailyRecord,
  whose_ability: whoseAbility
};

export function buildRubricSample(
  key: RubricKey,
  deps: { data: RubricData; random: () => number }
): Promise<RubricSample> {
  return BUILDERS[key](deps.data, deps.random);
}
