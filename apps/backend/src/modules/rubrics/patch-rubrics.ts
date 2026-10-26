import { abilityImage, escapeHtml, heroImage, PICTURE_SIZE, picturePage } from './picture';
import { type HeroInfo, noData, pick, plural, poll, quiz, type RubricContext, type RubricSample } from './types';

// Rubrics over Valve's latest patch notes (Russian datafeed). A note «X увеличен с 60 до 65» is read as a buff or a
// nerf by the stat's name: for a cooldown, a cost or a cast time less is better, for the rest more is better.

const CHANGE =
  /^(.+?)\s+(увеличен[аоы]?|повышен[аоы]?|уменьшен[аоы]?|снижен[аоы]?|понижен[аоы]?)\s+с\s+([\d.,/%\s]+?)\s+до\s+([\d.,/%\s]+?)\.?$/iu;
const LESS_IS_BETTER =
  /перезарядк|затрат|стоимост|время применения|время каста|время возрождения|задержк|урон по себе/iu;

interface Change {
  heroId: number;
  abilityId: number | null;
  stat: string;
  from: string;
  to: string;
  buff: boolean;
  /** |to − from| / from of the first number: how big the change is. */
  size: number;
  note: string;
}

const firstNumber = (value: string) => Number.parseFloat(value.replace(',', '.').split('/')[0] ?? '');

function readChange(heroId: number, abilityId: number | null, note: string): Change | null {
  const match = CHANGE.exec(note.trim());
  if (match === null) return null;
  const [, stat = '', verb = '', from = '', to = ''] = match;
  const before = firstNumber(from);
  const after = firstNumber(to);
  if (!Number.isFinite(before) || !Number.isFinite(after) || before === after) return null;
  const more = /увеличен|повышен/iu.test(verb);
  return {
    heroId,
    abilityId,
    stat: stat.trim(),
    from: from.trim(),
    to: to.trim(),
    buff: LESS_IS_BETTER.test(stat) ? !more : more,
    size: before === 0 ? 1 : Math.abs(after - before) / Math.abs(before),
    note: note.trim()
  };
}

async function latestPatch(context: RubricContext) {
  const patches = await context.sources.patches();
  const latest = [...patches].sort((a, b) => b.timestamp - a.timestamp)[0];
  if (latest === undefined) throw noData('patch list');
  const [notes, heroes] = await Promise.all([context.sources.patchNotes(latest.version), context.sources.heroes()]);
  const byId = new Map(heroes.map((hero) => [hero.id, hero]));
  const changes = notes.heroes.flatMap((hero) =>
    hero.notes
      .map((note) => readChange(hero.heroId, note.abilityId, note.note))
      .filter((each): each is Change => each !== null)
  );
  // Each changed hero with its notes count and the balance of buffs and nerfs.
  const scored = notes.heroes
    .map((hero) => {
      const own = changes.filter((change) => change.heroId === hero.heroId);
      const balance = own.reduce((sum, change) => sum + (change.buff ? 1 : -1), 0);
      return { hero: byId.get(hero.heroId), notes: hero.notes.length, balance };
    })
    .filter((each): each is { hero: HeroInfo; notes: number; balance: number } => each.hero !== undefined)
    .sort((a, b) => b.notes - a.notes);
  return { version: latest.version, timestamp: latest.timestamp, changes, scored, byId };
}

export async function patchBroken(context: RubricContext): Promise<RubricSample> {
  const patch = await latestPatch(context);
  const top = patch.scored.slice(0, 5);
  if (top.length < 3) throw noData('patch heroes');
  // Each hero's biggest change by size, «было → стало» (owner, 25.10.2026: «непонятно, насколько их понизили»).
  const details = await Promise.all(top.map((each) => context.sources.heroDetail(each.hero.id).catch(() => null)));
  const biggest = top.map((each, index) => {
    const change = patch.changes.filter((one) => one.heroId === each.hero.id).sort((a, b) => b.size - a.size)[0];
    if (change === undefined) return null;
    const ability = details[index]?.abilities.find((one) => one.id === change.abilityId)?.name ?? null;
    return { ...change, what: ability === null ? change.stat : `${ability}: ${change.stat.toLowerCase()}` };
  });
  // Portraits only (owner, 26.10.2026): players know heroes by face, and the post's lines carry «было → стало».
  const portraits = top.map((each) => `<img class="portrait" src="${heroImage(each.hero.name)}" alt="">`).join('');
  const html = picturePage(
    `<div class="title">Что <b>сломали</b> в патче</div><div class="plate"><small>ПАТЧ</small>${escapeHtml(patch.version)}</div>
<div class="cards">${portraits}</div>`,
    `.cards{display:flex;gap:22px;margin-top:72px}
.cards .portrait{width:258px;height:145px}`
  );
  const lines = [`Патч ${patch.version}: больше всего правок у этих героев.`];
  // One line per hero, its biggest change: the post shows how much, not only who.
  top.forEach((each, index) => {
    const change = biggest[index];
    if (change !== null && change !== undefined)
      lines.push(
        `${change.buff ? '▲' : '▼'} ${each.hero.localizedName} — ${change.what}: ${change.from} → ${change.to}`
      );
  });
  lines.push('Играете на ком-то из них? Кого сломали сильнее всех — пишите в комментарии.');
  return { picture: { html, ...PICTURE_SIZE }, text: lines.join('\n'), poll: null };
}

export async function whoIsImba(context: RubricContext): Promise<RubricSample> {
  const patch = await latestPatch(context);
  const options = patch.scored
    .filter((each) => each.balance > 0)
    .slice(0, 6)
    .map((each) => each.hero.localizedName);
  if (options.length < 2) throw noData('buffed heroes');
  return {
    picture: null,
    text: `После патча ${patch.version} этих героев усилили сильнее всех. Кто теперь имба?`,
    poll: poll(`Кто имба после ${patch.version}?`, options)
  };
}

export async function whoGetsNerfed(context: RubricContext): Promise<RubricSample> {
  const patch = await latestPatch(context);
  const options = patch.scored
    .filter((each) => each.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5)
    .map((each) => each.hero.localizedName);
  if (options.length < 2) throw noData('buffed heroes');
  return {
    picture: null,
    text: `Valve уже готовит следующий патч. Этих героев в ${patch.version} подняли сильнее всех — кого порежут первым?`,
    poll: poll('Кого понерфят первым?', options)
  };
}

/**
 * «Нерф или баф?» must be a real question (owner, 25.10.2026: «тут явный нерф, было больше — стало меньше, в чём суть»).
 * First choice: a hero who got buffs and nerfs at once — all its changes without a hint, and an opinion poll on the
 * total. Otherwise a trap: a cost, a cooldown or a cast time that went down is a buff though the number shrank.
 */
export async function nerfOrBuff(context: RubricContext): Promise<RubricSample> {
  const patch = await latestPatch(context);
  const mixed = patch.scored.filter((each) => {
    const own = patch.changes.filter((change) => change.heroId === each.hero.id);
    return own.length >= 2 && own.length <= 8 && own.some((one) => one.buff) && own.some((one) => !one.buff);
  });
  if (mixed.length > 0) {
    const { hero } = pick(mixed, context.random);
    const own = patch.changes.filter((change) => change.heroId === hero.id);
    const detail = await context.sources.heroDetail(hero.id).catch(() => null);
    const name = (change: Change) => {
      const ability = detail?.abilities.find((one) => one.id === change.abilityId)?.name;
      return ability === undefined ? change.stat : `${ability}: ${change.stat.toLowerCase()}`;
    };
    const html = picturePage(
      `<div class="title">Нерф <b>или</b> баф?</div>
<div class="row"><img class="portrait big" src="${heroImage(hero.name)}" alt="">
<div class="facts"><div class="hero">${escapeHtml(hero.localizedName)}</div>
<div class="stat">${own.length} ${plural(own.length, 'правка', 'правки', 'правок')} в патче ${escapeHtml(patch.version)}</div></div></div>`,
      `.row{display:flex;align-items:center;gap:56px;margin-top:48px}
.portrait.big{width:448px;height:252px}
.facts{display:flex;flex-direction:column;gap:14px;max-width:640px}
.hero{font-weight:800;font-size:52px}.stat{font-weight:600;font-size:34px;color:var(--muted)}`
    );
    return {
      picture: { html, ...PICTURE_SIZE },
      // «Название: было → стало» lines: the post's table, with no red or green to give the answer away.
      text: [
        `${hero.localizedName} в патче ${patch.version}: часть усилили, часть ослабили.`,
        ...own.map((change) => `${name(change)}: ${change.from} → ${change.to}`),
        `В итоге ${hero.localizedName} стал сильнее или слабее?`
      ].join('\n'),
      poll: poll(`${hero.localizedName} после ${patch.version}: в итоге нерф или баф?`, [
        'Нерф',
        'Баф',
        'Ничего не поменялось'
      ])
    };
  }
  const traps = patch.changes.filter(
    (change) =>
      change.abilityId !== null && LESS_IS_BETTER.test(change.stat) && firstNumber(change.to) < firstNumber(change.from)
  );
  if (traps.length === 0) throw noData('a change that is not obvious');
  const change = pick(traps, context.random);
  const hero = patch.byId.get(change.heroId);
  if (hero === undefined) throw noData('hero');
  const detail = await context.sources.heroDetail(change.heroId);
  const ability = detail.abilities.find((each) => each.id === change.abilityId);
  const subject = ability === undefined ? hero.localizedName : `${ability.name} (${hero.localizedName})`;
  const html =
    ability === undefined
      ? null
      : picturePage(
          `<div class="title">Нерф <b>или</b> баф?</div>
<div class="row"><img class="ability" src="${abilityImage(ability.key)}" alt="">
<div class="facts"><div class="hero">${escapeHtml(subject)}</div><div class="stat">${escapeHtml(change.stat)}</div>
<div class="nums">${escapeHtml(change.from)} → ${escapeHtml(change.to)}</div></div></div>`,
          `.row{display:flex;align-items:center;gap:56px;margin-top:48px}
.ability{width:256px;height:256px;border-radius:16px;border:1px solid var(--line);box-shadow:0 14px 40px rgba(0,0,0,.6)}
.facts{display:flex;flex-direction:column;gap:14px;max-width:760px}
.hero{font-weight:800;font-size:40px}.stat{font-weight:600;font-size:32px;color:var(--muted)}
.nums{font-weight:900;font-size:84px;color:var(--red)}`
        );
  return {
    picture: html === null ? null : { html, ...PICTURE_SIZE },
    text: `${subject}: ${change.stat.toLowerCase()}: ${change.from} → ${change.to}\nЦифра стала меньше — значит, нерф?`,
    poll: quiz('Это нерф или баф?', ['Нерф', 'Баф'], 1, `${change.note} (патч ${patch.version})`)
  };
}

export async function valveSeriously(context: RubricContext): Promise<RubricSample> {
  const patch = await latestPatch(context);
  const smallest = [...patch.changes].sort((a, b) => a.size - b.size)[0];
  if (smallest === undefined) throw noData('patch numbers');
  const hero = patch.byId.get(smallest.heroId);
  return {
    picture: null,
    text: `Valve, ты серьёзно? 🤡\n${hero?.localizedName ?? 'Герой'}: ${smallest.stat.toLowerCase()} — ${smallest.from} → ${smallest.to}. Самая крошечная правка патча ${patch.version}.\n🤡 или 🔥?`,
    poll: null
  };
}

export async function valveTime(context: RubricContext): Promise<RubricSample> {
  const patches = await context.sources.patches();
  const latest = [...patches].sort((a, b) => b.timestamp - a.timestamp)[0];
  if (latest === undefined) throw noData('patch list');
  const days = Math.max(0, Math.floor((context.now - latest.timestamp * 1000) / 86_400_000));
  const date = new Date(latest.timestamp * 1000).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Moscow'
  });
  return {
    picture: null,
    text: `⏳ ${days} ${plural(days, 'день', 'дня', 'дней')} без патча. Последний — ${latest.version}, ${date}.\nГейб считает до трёх: 1… 2… Ждём.`,
    poll: null
  };
}
