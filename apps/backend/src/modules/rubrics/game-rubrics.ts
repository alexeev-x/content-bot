import {
  abilityImage,
  escapeHtml,
  heroImage,
  heroPortraitImage,
  itemImage,
  PICTURE_SIZE,
  picturePage
} from './picture';
import {
  type AbilityDetail,
  type HeroInfo,
  noData,
  pick,
  quiz,
  type RubricContext,
  type RubricSample,
  shuffled
} from './types';

// Rubrics over the game itself: every hero's base numbers and every item (dotaconstants), a hero's abilities with
// Russian names and values (Valve's datafeed). No pick or win rates here.

const decimal = (value: number) => String(Math.round(value * 100) / 100).replace('.', ',');

/** The three heroes nearest to `hero` by `distance`: the numbers alone should not give the answer away. */
function nearest(hero: HeroInfo, heroes: HeroInfo[], distance: (a: HeroInfo, b: HeroInfo) => number) {
  return heroes
    .filter((each) => each.id !== hero.id)
    .sort((a, b) => distance(hero, a) - distance(hero, b))
    .slice(0, 3);
}

/**
 * A value's name told neutrally on the picture: a telling one («урон за ед. недостающей маны» is Mana Void) would give
 * the hero away (owner, 26.10.2026).
 */
const neutral = (text: string) => {
  const name = text.toLowerCase();
  if (/урон/u.test(name)) return 'Урон';
  if (/длительн|время/u.test(name)) return 'Длительность';
  if (/радиус|область/u.test(name)) return 'Радиус';
  if (/дальн/u.test(name)) return 'Дальность';
  if (/скорост/u.test(name)) return 'Скорость';
  return 'Значение';
};

const ASK_CAPTIONS = ['Чья это ульта? Пишите в комменты.', 'Только цифры. Чья ульта? Ответы — в комменты.'];
const ASK_HARD_CAPTIONS = [
  'Чья это способность? Пишите в комменты.',
  'Тяжёлый уровень: чья способность? Ответы — в комменты.'
];
// The answer three hours later (owner, 26.10.2026: «кто угадал — могут скидывать жопу в личку, кто нет — идите учите
// матчасть»).
const ANSWER_CAPTIONS = [
  'Кто угадал — скидывайте жопу в личку. Кто нет — идите учите матчасть.',
  'Угадали? Красавчики, жопу в личку. Не угадали — марш учить матчасть.',
  'Кто угадал — респект и жопу в личку. Остальные — учить матчасть, бегом.'
];
/** The answer comes this long after the question in the channel. */
const ANSWER_AFTER_MINUTES = 180;

// Three levels, one at random per post (owner, 26.10.2026: «уровень сложности… рандомно, чтобы менялось»): easy — an
// ultimate with four lines; medium — an ultimate with two; hard — a basic ability with its cooldown, mana and one value.
const LEVELS = [
  { key: 'easy', name: 'Лёгкий', marks: 1, lines: 4, ultimate: true },
  { key: 'medium', name: 'Средний', marks: 2, lines: 2, ultimate: true },
  { key: 'hard', name: 'Тяжёлый', marks: 3, lines: 3, ultimate: false }
] as const;

type WhoseLevel = (typeof LEVELS)[number];

/** One line of the riddle: its neutral name for the question, the datafeed's own one for the answer. */
interface WhoseLine {
  name: string;
  real: string;
  values: string[];
  unit: string;
}

interface WhoseRiddle {
  kind: string;
  level: WhoseLevel;
  lines: WhoseLine[];
  hero: HeroInfo;
  ability: AbilityDetail;
}

// Three looks of the question and its answer the owner chose of five (26.10.2026), made as pairs: the answer keeps the question's frame,
// badge and numbers and fills what the question left blank, so it reads as that riddle's reveal. One look at random per
// post, like «Нерф или баф?». Each is unlike 01's poster, 02's measuring plate and 03's hero panel over a ruled list:
// 'A' an empty ability slot next to the numbers; 'B' a hidden pick, a dark panel the hero later stands in; 'E' a
// per-level board.
const WHOSE_LOOKS = ['A', 'B', 'E'] as const;
type WhoseLook = (typeof WHOSE_LOOKS)[number];

/** Valve's 1440² cut-out render: sharp at full picture height, where the 400×250 crop would be soft. */
const heroRender = (heroName: string) => {
  const key = heroName.replace(/^npc_dota_hero_/, '');
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders/${/^[a-z0-9_]{1,80}$/.test(key) ? key : 'default'}.png`;
};

/** A heading from the datafeed («УРОН:») as a label: no colon, capitalised once. */
const realName = (heading: string) => {
  const text = heading.replace(/[:：]\s*$/u, '').trim();
  const lower = text === text.toUpperCase() ? text.toLowerCase() : text;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

const valueText = (line: WhoseLine) => `${line.values.join(' / ')}${line.unit === '' ? '' : ` ${line.unit}`}`;

/** A text's width in em of Manrope ExtraBold (figures ≈ 0.62, a space 0.26, a slash or comma ≈ 0.36). */
const ems = (text: string) =>
  [...text].reduce(
    (sum, char) => sum + (/\d/.test(char) ? 0.62 : char === ' ' ? 0.26 : /[/,.]/.test(char) ? 0.36 : 0.64),
    0
  );

/** Tektur's capitals and lowercase together run ≈ 0.62 em a letter. */
const titleSize = (text: string, room: number, max = 80) => Math.min(max, Math.floor(room / (text.length * 0.62)));

/**
 * The largest figure size at which the lines, stacked label over value, fit a `width`×`height` room; the label is a
 * third of the figure, never under 22 px.
 */
function stackFit(lines: WhoseLine[], width: number, height: number, max: number) {
  const widest = Math.max(...lines.map((line) => ems(valueText(line))));
  const label = (value: number) => Math.max(22, Math.round(value * 0.3));
  const rows = (value: number) => lines.length * (label(value) * 1.25 + 6 + value + value * 0.32);
  let value = Math.min(max, Math.floor(width / widest));
  while (value > 28 && rows(value) > height) value -= 2;
  return { value, label: label(value), gap: Math.round(value * 0.32) };
}

/** The lines as a stack, label over a big value. */
function stackHtml(lines: WhoseLine[], real: boolean, width: number, height: number, max: number) {
  const fit = stackFit(lines, width, height, max);
  return `<div class="stack" style="--v:${fit.value}px;--k:${fit.label}px;gap:${fit.gap}px">${lines
    .map(
      (line) =>
        `<div class="l"><span class="k">${escapeHtml(real ? line.real : line.name)}</span><span class="v">${escapeHtml(valueText(line))}</span></div>`
    )
    .join('')}</div>`;
}

/** The lines one per row, label left and value right, sized to a `width`×`height` room. */
function rowsHtml(lines: WhoseLine[], real: boolean, width: number, height: number, max: number, labelSize = 26) {
  const labelWidth = Math.max(...lines.map((line) => (real ? line.real : line.name).length)) * labelSize * 0.56;
  const widest = Math.max(...lines.map((line) => ems(valueText(line))));
  const value = Math.max(
    28,
    Math.min(max, Math.floor((width - labelWidth - 32) / widest), Math.floor((height / lines.length) * 0.7))
  );
  return `<div class="rows" style="--v:${value}px;--k:${labelSize}px">${lines
    .map(
      (line) =>
        `<div class="r"><span class="k">${escapeHtml(real ? line.real : line.name)}</span><span class="v">${escapeHtml(valueText(line))}</span></div>`
    )
    .join('')}</div>`;
}

// The difficulty: skulls (A and B; owner, 26.10.2026: «не звания из Доты, лучше черепушки») or rising bars (E), the
// level's word always next to it.
const SKULL =
  'M12 1C5.9 1 2 5.3 2 10.8c0 3.2 1.4 5.4 3.4 6.8V22a1.5 1.5 0 0 0 1.5 1.5h10.2a1.5 1.5 0 0 0 1.5-1.5v-4.4c2-1.4 3.4-3.6 3.4-6.8C22 5.3 18.1 1 12 1ZM5.6 11.2a2.7 2.7 0 1 0 5.4 0a2.7 2.7 0 1 0-5.4 0ZM13 11.2a2.7 2.7 0 1 0 5.4 0a2.7 2.7 0 1 0-5.4 0ZM12 14.8l-1.6 2.8h3.2ZM9.4 20.2h1.2v3.3H9.4ZM13.4 20.2h1.2v3.3h-1.2Z';
const skulls = (level: WhoseLevel) =>
  `<div class="lvl skulls">${[1, 2, 3]
    .map(
      (mark) =>
        `<svg class="${mark <= level.marks ? 'on' : ''}" viewBox="0 0 24 25"><path fill-rule="evenodd" d="${SKULL}"/></svg>`
    )
    .join('')}<span>${level.name}</span></div>`;

const BADGES: Record<WhoseLook, (level: WhoseLevel) => string> = {
  A: (level) => skulls(level),
  B: (level) => skulls(level),
  E: (level) =>
    `<div class="lvl bars">${[1, 2, 3].map((mark) => `<i class="${mark <= level.marks ? 'on' : ''}"></i>`).join('')}<span>${level.name}</span></div>`
};

const WHOSE_BASE = `body{display:block;padding:0;background:#0c0d0f}body::before,body::after{content:none}
.main{position:absolute;inset:0;display:block;padding:0}.main::after{content:none}
.mark{top:40px;left:72px;color:#6b6f76;z-index:3}
.title{position:absolute;left:72px;top:72px;margin:0;z-index:2;font-size:var(--t,80px);line-height:1;letter-spacing:-.01em;
text-transform:none;white-space:nowrap}.title::after{content:none}
.k{font-weight:600;font-size:var(--k);line-height:1.25;color:#8a929e}
.v{font-weight:800;font-size:var(--v);line-height:1;white-space:nowrap;font-variant-numeric:tabular-nums;color:#f1ebe0}
.stack{display:flex;flex-direction:column}.stack .l{display:flex;flex-direction:column;gap:6px}
.rows{display:flex;flex-direction:column;justify-content:center}
.rows .r{display:flex;justify-content:space-between;align-items:baseline;gap:32px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.1)}
.rows .r:last-child{border-bottom:0}
.hole{display:flex;align-items:center;justify-content:center;background:#151a21;border:1px solid rgba(255,255,255,.12);
border-radius:10px;font-family:Tektur,sans-serif;font-weight:800;line-height:1;color:#2e353f}
.icon{display:block;border-radius:10px;border:1px solid rgba(255,255,255,.16)}
.pic{display:block;border-radius:10px;border:1px solid rgba(255,255,255,.16);object-fit:cover}
.aname{font-weight:800;line-height:1.1;color:#f1ebe0}
.lvl{position:absolute;display:flex;align-items:center;gap:16px;font-weight:800;font-size:38px;line-height:1;color:#f1ebe0;z-index:2}
.skulls svg{width:54px;height:56px;fill:#2a3039}.skulls svg.on{fill:var(--red)}.skulls span{margin-left:8px}

.bars{align-items:flex-end;gap:8px}.bars i{display:block;width:16px;background:#2a3039;transform:skewX(-14deg)}
.bars i{width:24px}.bars i:nth-child(1){height:28px}.bars i:nth-child(2){height:50px}.bars i:nth-child(3){height:72px}.bars i.on{background:var(--red)}
.bars span{margin-left:14px}`;

const questionTitle = (riddle: WhoseRiddle) => `Чья <b>${riddle.kind}?</b>`;
const answerTitle = (riddle: WhoseRiddle) => `Это <b>${escapeHtml(riddle.hero.localizedName)}</b>`;
const answerTitleSize = (riddle: WhoseRiddle, room: number) => titleSize(`Это ${riddle.hero.localizedName}`, room);

interface WhosePair {
  question(riddle: WhoseRiddle): string;
  answer(riddle: WhoseRiddle): string;
  css: string;
}

const WHOSE_PAIRS: Record<WhoseLook, WhosePair> = {
  // A: the ability's slot stands empty beside the numbers; the answer puts its icon there and the hero beside.
  A: {
    question: (riddle) =>
      `<style>:root{--t:${titleSize(`Чья ${riddle.kind}?`, 1032)}px}</style><div class="title">${questionTitle(riddle)}</div>
<div class="body"><div class="hole slot">?</div>${stackHtml(riddle.lines, false, 1072, 480, 120)}</div>`,
    answer: (riddle) =>
      `<style>:root{--t:${answerTitleSize(riddle, 1032)}px}</style><div class="title">${answerTitle(riddle)}</div>
<div class="aname sub">${escapeHtml(riddle.ability.name)}</div>
<div class="body ans"><img class="icon slot" src="${abilityImage(riddle.ability.key)}" alt="">${stackHtml(riddle.lines, true, 576, 440, 72)}
<img class="pic hero" src="${heroPortraitImage(riddle.hero.name)}" alt=""></div>`,
    css: `.skulls{top:52px;right:72px}
.body{position:absolute;left:72px;right:72px;top:216px;bottom:48px;display:flex;align-items:center;gap:64px}
.slot{flex:none;width:256px;height:256px;font-size:180px}
.body .stack{flex:1;min-width:0}.body.ans{top:248px;gap:56px}
.sub{position:absolute;left:72px;top:176px;max-width:1000px;font-size:40px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hero{flex:none;width:448px;height:252px}`
  },
  // B: a hidden pick: a dark panel on the right where the hero stands in the answer.
  B: {
    question: (riddle) =>
      `<div class="fig"><span class="hole q">?</span></div>
<style>:root{--t:${titleSize(`Чья ${riddle.kind}?`, 860)}px}</style><div class="title">${questionTitle(riddle)}</div>
<div class="left">${stackHtml(riddle.lines, false, 860, 452, 116)}</div>`,
    answer: (riddle) =>
      `<div class="fig"><img src="${heroRender(riddle.hero.name)}" alt=""></div>
<style>:root{--t:${answerTitleSize(riddle, 860)}px}</style><div class="title">${answerTitle(riddle)}</div>
<div class="left"><div class="id"><img class="icon" src="${abilityImage(riddle.ability.key)}" alt=""><div class="aname">${escapeHtml(riddle.ability.name)}</div></div>
${rowsHtml(riddle.lines, true, 860, 300, 48, 26)}</div>`,
    css: `.fig{position:absolute;left:1000px;right:0;top:0;bottom:0;overflow:hidden;background:linear-gradient(#1b2028,#101318)}
.fig .q{position:absolute;inset:0;background:none;border:0;font-size:340px;color:#252b34}
.fig img{position:absolute;left:50%;top:-40px;height:1080px;transform:translateX(-50%)}
.skulls{left:72px;top:176px}
.left{position:absolute;left:72px;width:860px;top:268px;bottom:48px;display:flex;flex-direction:column;justify-content:center;gap:28px}
.id{display:flex;align-items:center;gap:28px}.id .icon{width:112px;height:112px}.id .aname{font-size:40px}`
  },
  // E: a board by level: each value in its own cell, as the game shows an ability's levels.
  E: {
    question: (riddle) =>
      `<style>:root{--t:${titleSize(`Чья ${riddle.kind}?`, 1032)}px}</style><div class="title">${questionTitle(riddle)}</div>
${boardHtml(riddle.lines, false, 512, 150)}`,
    answer: (riddle) =>
      `<style>:root{--t:${answerTitleSize(riddle, 1032)}px}</style><div class="title">${answerTitle(riddle)}</div>
<div class="who"><img class="pic hero" src="${heroPortraitImage(riddle.hero.name)}" alt="">
<img class="icon" src="${abilityImage(riddle.ability.key)}" alt=""><div class="aname">${escapeHtml(riddle.ability.name)}</div></div>
${boardHtml(riddle.lines, true, 264, 100, true)}`,
    css: `.bars{top:68px;right:72px}
.board{position:absolute;left:72px;right:72px;top:200px;bottom:48px;display:grid;
grid-template-columns:320px repeat(var(--cols),minmax(0,1fr));grid-auto-rows:var(--h);align-content:center;gap:var(--gap) 16px}
.board.low{top:auto;height:var(--room)}
.board.pipped{grid-template-rows:12px}
.pips{display:flex;justify-content:center;gap:6px}.pips i{display:block;flex:0 1 26px;min-width:0;height:12px;background:#2a3039}
.pips i.on{background:#f1ebe0}
.board .k{align-self:center;font-size:var(--k);line-height:1.15}
.cell{display:flex;align-items:center;justify-content:center;background:#151a21;border:1px solid rgba(255,255,255,.1);
border-radius:2px;font-weight:800;font-size:var(--v);line-height:1;font-variant-numeric:tabular-nums;color:#f1ebe0;white-space:nowrap}
.who{position:absolute;left:72px;right:72px;top:176px;display:flex;align-items:flex-start;gap:40px}
.who .hero{flex:none;width:384px;height:216px}.who .icon{flex:none;width:128px;height:128px}
.who .aname{font-size:44px;max-width:640px;align-self:center}`
  }
};

/**
 * The lines as a board: one cell per level, a single value across them all; above the columns, the game's level pips
 * (the first column one lit, the next two…). `low`: the answer's board, pinned to the bottom under the hero.
 */
function boardHtml(lines: WhoseLine[], real: boolean, room: number, maxRow: number, low = false) {
  const cols = Math.max(...lines.map((line) => line.values.length));
  const gap = Math.round(Math.min(20, room * 0.04));
  const pipRoom = cols < 2 ? 0 : 12 + gap;
  const rowHeight = Math.min(maxRow, Math.floor((room - pipRoom - gap * (lines.length - 1)) / lines.length));
  const cellWidth = (1392 - 320 - 16 * cols) / cols;
  const widest = Math.max(...lines.flatMap((line) => line.values.map((value) => ems(value))));
  const value = Math.max(24, Math.min(Math.round(rowHeight * 0.6), Math.floor((cellWidth - 24) / widest)));
  const label = Math.max(22, Math.min(30, Math.round(rowHeight * 0.3)));
  const rows = lines.map((line) => {
    const name = `${real ? line.real : line.name}${line.unit === '' ? '' : `, ${line.unit}`}`;
    const cells =
      line.values.length === 1
        ? `<div class="cell" style="grid-column:span ${cols}">${escapeHtml(line.values[0] ?? '')}</div>`
        : line.values.map((each) => `<div class="cell">${escapeHtml(each)}</div>`).join('') +
          (line.values.length < cols ? `<div style="grid-column:span ${cols - line.values.length}"></div>` : '');
    return `<span class="k">${escapeHtml(name)}</span>${cells}`;
  });
  const pip = (col: number) =>
    `<div class="pips">${Array.from({ length: cols }, (_, each) => `<i class="${each <= col ? 'on' : ''}"></i>`).join('')}</div>`;
  const pips = cols < 2 ? '' : `<span></span>${Array.from({ length: cols }, (_, col) => pip(col)).join('')}`;
  const style = `--cols:${cols};--h:${rowHeight}px;--gap:${gap}px;--v:${value}px;--k:${label}px;--room:${room}px`;
  return `<div class="board${low ? ' low' : ''}${cols < 2 ? '' : ' pipped'}" style="${style}">${pips}${rows.join('')}</div>`;
}

export async function whoseAbility(context: RubricContext): Promise<RubricSample> {
  const heroes = await context.sources.heroes();
  const hero = pick(heroes, context.random);
  const detail = await context.sources.heroDetail(hero.id);
  const level = pick([...LEVELS], context.random);
  const candidates = detail.abilities.filter(
    (each) => each.isUltimate === level.ultimate && each.cooldowns.some((value) => value > 0)
  );
  if (candidates.length === 0) throw noData(level.ultimate ? 'ultimate' : 'basic ability');
  const ability = pick(candidates, context.random);
  const lines: WhoseLine[] = [
    { name: 'Перезарядка', real: 'Перезарядка', values: ability.cooldowns.map(decimal), unit: 'с' }
  ];
  if (ability.manaCosts.some((value) => value > 0))
    lines.push({ name: 'Мана', real: 'Мана', values: ability.manaCosts.map(decimal), unit: '' });
  for (const value of ability.values) {
    if (lines.length >= level.lines || value.heading === '' || value.values.every((each) => each === 0)) continue;
    lines.push({
      name: neutral(value.heading),
      real: realName(value.heading),
      values: value.values.map(decimal),
      unit: ''
    });
  }
  const look = pick([...WHOSE_LOOKS], context.random);
  const riddle: WhoseRiddle = { kind: level.ultimate ? 'ульта' : 'способность', level, lines, hero, ability };
  const pair = WHOSE_PAIRS[look];
  const css = `${WHOSE_BASE}\n${pair.css}`;
  const badge = BADGES[look](level);
  // No options: the answer goes to the comments, and comes as its own post three hours later (owner, 26.10.2026).
  const question = picturePage(
    `<div class="whose-${look} lvl-${level.key}">${pair.question(riddle)}${badge}</div>`,
    css
  );
  const answer = picturePage(`<div class="whose-${look} lvl-${level.key}">${pair.answer(riddle)}${badge}</div>`, css);
  return {
    picture: { html: question, ...PICTURE_SIZE },
    text: pick(level.ultimate ? ASK_CAPTIONS : ASK_HARD_CAPTIONS, context.random),
    ownText: true,
    poll: null,
    followUp: {
      afterMinutes: ANSWER_AFTER_MINUTES,
      picture: { html: answer, ...PICTURE_SIZE },
      text: pick(ANSWER_CAPTIONS, context.random)
    }
  };
}

export async function guessByNumbers(context: RubricContext): Promise<RubricSample> {
  const heroes = await context.sources.heroes();
  const hero = pick(heroes, context.random);
  const distractors = nearest(
    hero,
    heroes,
    (a, b) =>
      Math.abs(a.moveSpeed - b.moveSpeed) * 4 +
      Math.abs(a.attackRange - b.attackRange) +
      Math.abs(a.baseAttackTime - b.baseAttackTime) * 200
  );
  const options = shuffled([hero, ...distractors], context.random);
  const lines = [
    `Скорость: ${hero.moveSpeed}`,
    `Дальность атаки: ${hero.attackRange}`,
    `Время атаки: ${decimal(hero.baseAttackTime)} с`,
    `Броня: ${decimal(hero.baseArmor)}`,
    `Ног: ${hero.legs}`
  ];
  return {
    picture: null,
    text: `Кто это? Только цифры героя:\n${lines.join('\n')}`,
    poll: quiz(
      'Чьи это цифры?',
      options.map((each) => each.localizedName),
      options.findIndex((each) => each.id === hero.id),
      `${hero.localizedName}. Варианты — герои с самыми похожими цифрами.`
    )
  };
}

const FACTS: { title: string; value: (hero: HeroInfo) => number | null; unit: string; max: boolean }[] = [
  { title: 'Самый быстрый герой', value: (hero) => hero.moveSpeed, unit: 'скорости', max: true },
  { title: 'Самый медленный герой', value: (hero) => hero.moveSpeed, unit: 'скорости', max: false },
  { title: 'Самая дальняя атака', value: (hero) => hero.attackRange, unit: 'дальности', max: true },
  { title: 'Самый толстокожий на старте', value: (hero) => hero.baseArmor, unit: 'брони', max: true },
  { title: 'Самый неповоротливый', value: (hero) => hero.turnRate, unit: 'скорости поворота', max: false },
  { title: 'Больше всех ног', value: (hero) => hero.legs, unit: 'ног', max: true },
  { title: 'Лучшее ночное зрение', value: (hero) => hero.nightVision, unit: 'ночного зрения', max: true }
];

export async function didYouKnow(context: RubricContext): Promise<RubricSample> {
  const heroes = await context.sources.heroes();
  for (const fact of shuffled(FACTS, context.random)) {
    const ranked = heroes
      .map((hero) => ({ hero, value: fact.value(hero) }))
      .filter((each): each is { hero: HeroInfo; value: number } => each.value !== null && Number.isFinite(each.value))
      .sort((a, b) => (fact.max ? b.value - a.value : a.value - b.value));
    const [first, second] = ranked;
    // A tie is no record.
    if (first === undefined || second === undefined || first.value === second.value) continue;
    return {
      picture: null,
      text: `А вы знали? ${fact.title} в Доте — ${first.hero.localizedName}: ${decimal(first.value)} ${fact.unit}.\nНа втором месте ${second.hero.localizedName} — ${decimal(second.value)}.`,
      poll: null
    };
  }
  throw noData('hero numbers');
}

export async function itemExam(context: RubricContext): Promise<RubricSample> {
  const items = await context.sources.items();
  const byKey = new Map(items.map((item) => [item.key, item]));
  const built = items.filter(
    (item) => item.components.length >= 2 && item.components.every((key) => byKey.has(key)) && item.cost >= 1000
  );
  const target = pick(built, context.random);
  if (context.random() < 0.5) {
    // «Во что превратится?»: the components on the picture, four built items to choose from.
    const parts = target.components.map((key) => byKey.get(key)).filter((item) => item !== undefined);
    const others = shuffled(
      built.filter((item) => item.key !== target.key && Math.abs(item.cost - target.cost) < 1500),
      context.random
    ).slice(0, 3);
    const options = shuffled([target, ...others], context.random);
    const icons = parts
      .map((item) => `<img class="item big" src="${itemImage(item.key)}" alt="">`)
      .join('<div class="plus">+</div>');
    const html = picturePage(
      `<div class="title">Во что <b>превратится?</b></div><div class="row">${icons}<div class="plus">=</div><div class="q">?</div></div>`,
      `.row{display:flex;align-items:center;gap:24px;margin-top:64px}
.item.big{width:176px;height:128px;border-radius:10px}
.plus{font-weight:900;font-size:72px;color:var(--muted)}
.q{width:176px;height:128px;border:4px dashed var(--red);border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:90px;color:var(--red)}`
    );
    return {
      picture: { html, ...PICTURE_SIZE },
      text: `Предметный экзамен: что соберётся из этих предметов?`,
      poll: quiz(
        'Во что превратится?',
        options.map((item) => item.name),
        options.findIndex((item) => item.key === target.key),
        `${target.name}: ${parts.map((item) => item.name).join(' + ')}${target.cost > parts.reduce((sum, item) => sum + item.cost, 0) ? ' + рецепт' : ''}.`
      )
    };
  }
  // «Сколько стоит?»: price ranges around the real one.
  const step = 500;
  const base = Math.floor(target.cost / step) * step;
  const ranges = [base - 2 * step, base - step, base, base + step]
    .filter((from) => from >= 0)
    .slice(-4)
    .map((from) => ({ from, to: from + step - 1 }));
  const correct = ranges.findIndex((range) => target.cost >= range.from && target.cost <= range.to);
  return {
    picture: null,
    text: `Предметный экзамен: сколько стоит ${target.name}?`,
    poll: quiz(
      `Сколько стоит ${target.name}?`,
      ranges.map((range) => `${range.from}–${range.to}`),
      correct,
      `${target.name} стоит ${target.cost} золота.`
    )
  };
}

// A nuke's damage: the value headed just «Урон», at least 100 on its last level (not damage per second or a percent).
const damageOf = (ability: AbilityDetail) => {
  const damage = ability.values.find((value) => /^уронs*:?s*$/iu.test(value.heading.trim()));
  const top = damage?.values.at(-1);
  return top !== undefined && top >= 100 ? top : null;
};

export async function comboMath(context: RubricContext): Promise<RubricSample> {
  const heroes = await context.sources.heroes();
  for (const hero of shuffled(heroes, context.random).slice(0, 10)) {
    const detail = await context.sources.heroDetail(hero.id);
    const damaging = detail.abilities
      .map((ability, slot) => ({ ability, slot, damage: damageOf(ability) }))
      .filter(
        (each): each is { ability: AbilityDetail; slot: number; damage: number } =>
          each.damage !== null && each.slot < 6
      );
    if (damaging.length < 2) continue;
    const [first, second] = damaging;
    if (first === undefined || second === undefined) continue;
    const total = Math.round(first.damage + second.damage);
    const slotName = (each: { ability: AbilityDetail; slot: number }) =>
      each.ability.isUltimate ? 'ульта' : `${each.slot + 1}-й скилл`;
    const html = picturePage(
      `<div class="title">Комбо-<b>расчёт</b></div>
<div class="row"><img class="portrait big" src="${heroImage(hero.name)}" alt="">
<img class="ability" src="${abilityImage(first.ability.key)}" alt=""><div class="plus">+</div>
<img class="ability" src="${abilityImage(second.ability.key)}" alt=""><div class="plus">=</div>
<div class="total">${total}</div></div><div class="sub">урона на максимальном уровне</div>`,
      `.row{display:flex;align-items:center;gap:22px;margin-top:48px}
.portrait.big{width:384px;height:216px}
.ability{width:160px;height:160px;border-radius:12px;border:1px solid var(--line)}
.plus{font-weight:900;font-size:64px;color:var(--muted)}
.total{font-weight:900;font-size:110px;color:var(--red)}
.sub{font-size:30px}`
    );
    return {
      picture: { html, ...PICTURE_SIZE },
      text: `${hero.localizedName}: ${first.ability.name} (${slotName(first)}) + ${second.ability.name} (${slotName(second)}) — ${total} урона на максимуме.\nВот почему ты умер за секунду.`,
      poll: null
    };
  }
  throw noData('damaging abilities');
}
