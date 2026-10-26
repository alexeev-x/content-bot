import { abilityImage, heroImage, itemImage, PICTURE_SIZE, picturePage } from './picture';
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
const heading = (text: string) => {
  const clean = text
    .replace(/[:：]\s*$/u, '')
    .replace(/[%$+]/gu, '')
    .trim()
    .toLowerCase();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

/** The three heroes nearest to `hero` by `distance`: the numbers alone should not give the answer away. */
function nearest(hero: HeroInfo, heroes: HeroInfo[], distance: (a: HeroInfo, b: HeroInfo) => number) {
  return heroes
    .filter((each) => each.id !== hero.id)
    .sort((a, b) => distance(hero, a) - distance(hero, b))
    .slice(0, 3);
}

export async function whoseAbility(context: RubricContext): Promise<RubricSample> {
  const heroes = await context.sources.heroes();
  const hero = pick(heroes, context.random);
  const detail = await context.sources.heroDetail(hero.id);
  const ultimate = detail.abilities.find((each) => each.isUltimate && each.cooldowns.some((value) => value > 0));
  if (ultimate === undefined) throw noData('ultimate');
  const lines = [`Перезарядка: ${ultimate.cooldowns.map(decimal).join(' / ')} с`];
  if (ultimate.manaCosts.some((value) => value > 0)) lines.push(`Мана: ${ultimate.manaCosts.map(decimal).join(' / ')}`);
  for (const value of ultimate.values) {
    if (lines.length >= 4 || value.heading === '' || value.values.every((each) => each === 0)) continue;
    lines.push(`${heading(value.heading)}: ${value.values.map(decimal).join(' / ')}`);
  }
  // Same main attribute: «a strength hero's ultimate» is no hint.
  const distractors = shuffled(
    heroes.filter((each) => each.id !== hero.id && each.primaryAttr === hero.primaryAttr),
    context.random
  ).slice(0, 3);
  const options = shuffled([hero, ...distractors], context.random);
  return {
    picture: null,
    text: `Чья ульта? Только цифры:\n${lines.join('\n')}`,
    poll: quiz(
      'Чья это ульта?',
      options.map((each) => each.localizedName),
      options.findIndex((each) => each.id === hero.id),
      `${ultimate.name} — ${hero.localizedName}.`
    )
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
