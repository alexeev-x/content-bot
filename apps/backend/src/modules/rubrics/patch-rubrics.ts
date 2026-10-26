import { abilityImage, escapeHtml, heroImage, heroPortraitImage, PICTURE_SIZE, picturePage } from './picture';
import {
  type HeroInfo,
  noData,
  pick,
  plural,
  poll,
  quiz,
  type RubricContext,
  type RubricSample,
  withJoke
} from './types';

// Rubrics over Valve's latest patch notes (Russian datafeed). A note «X увеличен с 60 до 65» is read as a buff or a
// nerf by the stat's name: for a cooldown, a cost or a cast time less is better, for the rest more is better.

const CHANGE =
  /^(.+?)\s+(увеличен[аоы]?|повышен[аоы]?|уменьшен[аоы]?|снижен[аоы]?|понижен[аоы]?)\s+с\s+([\d.,/%\s]+?)\s+до\s+([\d.,/%\s]+?)\.?$/iu;
// «Расход маны» too (26.10.2026: Power Cogs' mana cost 75 → 90 passed for a buff).
const LESS_IS_BETTER =
  /перезарядк|затрат|стоимост|расход|время применения|время каста|время возрождения|задержк|урон по себе/iu;

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

// «Кого понерфили» as a patch-notes poster (owner chose it 26.10.2026 from three looks): a huge condensed title stacked
// on the left, the patch number as outlined numerals under it, the faces as a mosaic on the right. The rubric's own CSS
// replaces the shared page's look: no diagonal stripes, red glow, rounded plate or soft shadows.

/** A Google Font stylesheet in the page body (the shared head loads Manrope and Unbounded only). */
const googleFont = (family: string) =>
  `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${family}&amp;display=block">`;

// Tiles keep the portrait's 16:9 (owner: «картинки как будто порезанные»): two columns, an odd last face centred, so
// 3, 4 and 5 heroes (the rubric's range) all fill the right side. Cards: a 10 px radius and a thin light border (owner
// chose it 26.10.2026 from five card styles).
const BROKEN_CSS = `body{display:block;padding:0;background:#0a0a0b}body::before,body::after{content:none}
.main{position:absolute;inset:0;display:block;padding:0}.main::after{content:none}
.mark{top:44px;left:64px;color:#6b6f76}
.title{position:absolute;margin:0;left:58px;top:82px;font-family:Oswald,sans-serif;font-weight:700;font-size:172px;
line-height:.86;letter-spacing:0;text-transform:uppercase}.title::after{content:none}
.title b{display:block;font-size:110px;line-height:1.04}
.plate{position:absolute;left:64px;right:auto;top:auto;bottom:52px;display:block;gap:0;border:0;border-radius:0;
background:none;padding:0;font-family:Oswald,sans-serif;font-weight:500;font-size:136px;line-height:.9;color:transparent;
-webkit-text-stroke:3px #f1ebe0}
.plate small{display:block;margin-bottom:12px;font-family:Manrope,sans-serif;font-weight:800;font-size:18px;
letter-spacing:8px;color:#d63a22;-webkit-text-stroke:0}
.heroes{position:absolute;right:0;top:0;bottom:0;width:836px;display:grid;grid-template-columns:repeat(2,411px);
grid-auto-rows:231px;align-content:center;gap:14px}
.tile{position:relative;overflow:hidden;background:#1d2229;border-radius:10px;border:1px solid rgba(255,255,255,.14)}
.tile:last-child:nth-child(odd){grid-column:1 / -1;justify-self:center;width:411px}
.face{display:block;width:100%;height:100%;object-fit:cover}.cut .face{object-position:50% 25%}`;

export async function patchBroken(context: RubricContext): Promise<RubricSample> {
  const patch = await latestPatch(context);
  // «Кого понерфили» (owner, 26.10.2026): heroes weakened on balance, the most nerfs first.
  const nerfs = (heroId: number) => patch.changes.filter((one) => one.heroId === heroId && !one.buff);
  const top = patch.scored
    .filter((each) => each.balance < 0)
    .sort((a, b) => nerfs(b.hero.id).length - nerfs(a.hero.id).length)
    .slice(0, 5);
  if (top.length < 3) throw noData('nerfed heroes');
  // Each hero's biggest nerf by size, «было → стало» (owner, 25.10.2026: «непонятно, насколько их понизили»).
  const details = await Promise.all(top.map((each) => context.sources.heroDetail(each.hero.id).catch(() => null)));
  const biggest = top.map((each, index) => {
    const change = nerfs(each.hero.id).sort((a, b) => b.size - a.size)[0];
    if (change === undefined) return null;
    const ability = details[index]?.abilities.find((one) => one.id === change.abilityId)?.name ?? null;
    return { ...change, what: ability === null ? change.stat : `${ability}: ${change.stat.toLowerCase()}` };
  });
  // Portraits only (owner, 26.10.2026): players know heroes by face, and the post's lines carry «было → стало».
  // Every hero keeps a background, one of two looks at random («1 раз так, другой так»): Valve's portrait with its
  // painted background, or the large cut-out crop on a dark backdrop.
  const painted = context.random() < 0.5;
  const faces = top
    .map(
      (each) =>
        `<div class="tile"><img class="face" src="${painted ? heroPortraitImage(each.hero.name) : heroImage(each.hero.name)}" alt=""></div>`
    )
    .join('');
  const html = picturePage(
    `${googleFont('Oswald:wght@500;700')}<div class="title">Кого <b>понерфили</b></div>
<div class="heroes${painted ? '' : ' cut'}">${faces}</div>
<div class="plate"><small>ПАТЧ</small>${escapeHtml(patch.version)}</div>`,
    BROKEN_CSS
  );
  const lines = [`Патч ${patch.version}: этих героев ослабили сильнее всех.`];
  // One line per hero, its biggest nerf: the post shows how much, not only who.
  top.forEach((each, index) => {
    const change = biggest[index];
    if (change !== null && change !== undefined)
      lines.push(`${each.hero.localizedName} — ${change.what}: ${change.from} → ${change.to}`);
  });
  lines.push('Играете на ком-то из них? Кого порезали сильнее всех — пишите в комментарии.');
  return { picture: { html, ...PICTURE_SIZE }, text: lines.join('\n'), poll: null };
}

// «Кто теперь имба?» is 01's pair (buffs instead of nerfs) but must not look like it (owner, 26.10.2026: «дизайн все же
// отличался между рубриками»). Two looks, switched here: 'A' — the heroes are too big for their cards, Valve's full
// renders break out above a row of tall cards under a wide Unbounded title; 'B' — a measuring plate, each portrait raised
// over a ruled scale by its biggest buff, in % of the old value (a cooldown cut counts too) (owner: «не понятно, что за правок»; in a small patch
// every hero has one buff, so a count would stand them all level), an accent Tektur title only (owner, 26.10.2026), the labels and figures in the page's plain Manrope.
const IMBA_LOOK: 'A' | 'B' = 'B';

/** Valve's 1440² cut-out render: sharp even at full card height, unlike the 400×250 crop. */
const heroRender = (heroName: string) => {
  const key = heroName.replace(/^npc_dota_hero_/, '');
  return `https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders/${/^[a-z0-9_]{1,80}$/.test(key) ? key : 'default'}.png`;
};

// A: cards share one row (grid columns by count, so 2…6 heroes fill the width); the render's clip is open at the top,
// so heads rise over the card's edge, and the card bottom crops the legs. 01's frame: 10 px radius, 1 px light border.
const IMBA_A_CSS = `body{display:block;padding:0;background:#0b0c0e}body::before,body::after{content:none}
.main{position:absolute;inset:0;display:block;padding:0}.main::after{content:none}
.mark{top:44px;left:72px;color:#6b6f76}
.title{position:absolute;margin:0;left:72px;top:82px;font-family:Unbounded,sans-serif;font-weight:900;font-size:64px;
line-height:1;letter-spacing:-.01em}.title::after{content:none}
.plate{position:absolute;top:44px;right:72px;display:block;border:0;border-radius:0;background:none;padding:0;
text-align:right;font-family:Unbounded,sans-serif;font-weight:700;font-size:48px;line-height:1;color:#f1ebe0}
.plate small{display:block;margin-bottom:14px;font-family:Manrope,sans-serif;font-weight:800;font-size:18px;
letter-spacing:8px;color:#d63a22}
.heroes{position:absolute;left:72px;right:72px;top:176px;bottom:56px;display:grid;grid-auto-flow:column;
grid-auto-columns:1fr;gap:14px}
.tile{position:relative;container-type:size}
.card{position:absolute;left:0;right:0;bottom:0;top:136px;border-radius:10px;border:1px solid rgba(255,255,255,.14);
background:linear-gradient(#1d232b,#13171d)}
.fig{position:absolute;inset:0;clip-path:inset(0 1px 1px 1px round 0 0 9px 9px)}
.fig img{position:absolute;left:50%;top:0;height:max(132cqh,118cqw);transform:translateX(-50%)}`;

// B: a ruled plate; one rule per tenth of the top hero's growth, every fifth stronger, so a portrait's height over the base line can be counted.
// The heroes stand from the smallest buff to the biggest, left to right: the row climbs.
const IMBA_B_CSS = `body{display:block;padding:0;background:#0d0d0e}body::before,body::after{content:none}
.main{position:absolute;inset:0;display:block;padding:0}.main::after{content:none}
.mark{top:44px;left:72px;color:#6b6f76}
.title{position:absolute;margin:0;left:68px;top:84px;font-family:Tektur,sans-serif;font-weight:800;font-style:normal;
font-size:96px;line-height:1;letter-spacing:-.01em;text-transform:none}.title::after{content:none}
.plate{position:absolute;left:72px;right:auto;top:212px;display:block;border:0;border-radius:0;background:none;padding:0;
font-family:Manrope,sans-serif;font-weight:600;font-size:26px;color:#8a929e}
.scale{position:absolute;left:72px;right:72px;bottom:96px;height:calc(var(--max) * var(--unit));
background:repeating-linear-gradient(to top,rgba(255,255,255,.2) 0 1px,transparent 1px calc(var(--unit) * 5)),
repeating-linear-gradient(to top,rgba(255,255,255,.09) 0 1px,transparent 1px var(--unit))}
.base{position:absolute;left:72px;right:72px;bottom:95px;height:2px;background:#f1ebe0}
.heroes{position:absolute;left:72px;right:72px;bottom:96px;height:600px;display:grid;grid-auto-flow:column;
grid-auto-columns:1fr;gap:24px;align-items:end}
.tile{position:relative;display:flex;flex-direction:column;align-items:center;height:calc(var(--n) * var(--unit))}
.tile::after{content:'';position:absolute;top:0;bottom:0;left:50%;width:2px;margin-left:-1px;background:#f1ebe0}
.face{position:absolute;bottom:100%;width:min(100%,360px);aspect-ratio:16/9;object-fit:cover;border-radius:10px;
border:1px solid rgba(255,255,255,.14);background:#1d2229}
.num{position:absolute;top:calc(100% + 16px);font-family:Manrope,sans-serif;font-weight:800;font-size:28px;
font-variant-numeric:tabular-nums;color:#f1ebe0}`;

function imbaPicture(version: string, heroes: { hero: HeroInfo; percent: number }[]): string {
  if (IMBA_LOOK === 'A') {
    const tiles = heroes
      .map(
        (each) =>
          `<div class="tile"><div class="card"></div><div class="fig"><img src="${heroRender(each.hero.name)}" alt=""></div></div>`
      )
      .join('');
    return picturePage(
      `<div class="title">Кто теперь <b>имба?</b></div>
<div class="heroes">${tiles}</div>
<div class="plate"><small>ПАТЧ</small>${escapeHtml(version)}</div>`,
      IMBA_A_CSS
    );
  }
  const climbing = [...heroes].sort((a, b) => a.percent - b.percent);
  // Ten rules for the tallest; the others stand in proportion (at least one rule, so no portrait sits on the line).
  const top = Math.max(...climbing.map((each) => each.percent));
  const steps = (percent: number) => Math.max(1, Math.round((percent / top) * 10));
  const max = 10;
  const tiles = climbing
    .map(
      (each) =>
        `<div class="tile" style="--n:${steps(each.percent)}"><img class="face" src="${heroPortraitImage(each.hero.name)}" alt=""><div class="num">на ${each.percent}%</div></div>`
    )
    .join('');
  return picturePage(
    `${googleFont('Tektur:wght@800')}
<div class="title">Кто теперь <b>имба?</b></div>
<div class="plate">Самое крупное усиление каждого героя в патче ${escapeHtml(version)}</div>
<div class="scale" style="--max:${max};--unit:${Math.floor(260 / max)}px"></div>
<div class="heroes" style="--unit:${Math.floor(260 / max)}px">${tiles}</div><div class="base"></div>`,
    IMBA_B_CSS
  );
}

/** Six portraits still read on a phone in one row; more would shrink every face. */
const IMBA_HEROES_MAX = 6;

export async function whoIsImba(context: RubricContext): Promise<RubricSample> {
  const patch = await latestPatch(context);
  // Heroes who came out stronger than they were (owner, 26.10.2026: «кто стал сильнее, чем был — это важно»): the sum of
  // their buffs in % beats the sum of their nerfs, so a small nerf beside a huge buff still counts («убрать силу, но очень
  // усилить ульту»). The strongest total first.
  const own = (heroId: number) => patch.changes.filter((change) => change.heroId === heroId);
  const sum = (changes: Change[]) => changes.reduce((total, change) => total + change.size, 0);
  const biggestOf = (changes: Change[]) => [...changes].sort((a, b) => b.size - a.size)[0];
  const ranked = patch.scored
    .map((each) => {
      const changes = own(each.hero.id);
      const buffs = changes.filter((change) => change.buff);
      const nerfs = changes.filter((change) => !change.buff);
      const biggest = biggestOf(buffs);
      // The picture's scale: the hero's biggest buff in % of the old value.
      return {
        hero: each.hero,
        net: sum(buffs) - sum(nerfs),
        biggest,
        nerf: biggestOf(nerfs),
        percent: Math.round(100 * (biggest?.size ?? 0))
      };
    })
    .filter((each) => each.net > 0 && each.biggest !== undefined)
    .sort((a, b) => b.net - a.net);
  // As many heroes as really came out stronger (owner, 26.10.2026: «важно, сколько героев реально усилили»), six at
  // most: the picture holds no more.
  const top = ranked.slice(0, IMBA_HEROES_MAX);
  if (top.length < 2) throw noData('heroes who came out stronger');
  // In words, no «было → стало» table (owner, 26.10.2026: «хватит таблиц, тут просто словами»): no arrow, so the rich
  // message makes no table of it; the AI writer retells it in the channel's voice. A nerf beside the buff is said too.
  const details = await Promise.all(top.map((each) => context.sources.heroDetail(each.hero.id).catch(() => null)));
  const said = (change: Change, index: number) => {
    const ability = details[index]?.abilities.find((one) => one.id === change.abilityId)?.name;
    const what = ability === undefined ? change.stat : `${ability}, ${change.stat.toLowerCase()}`;
    return `${what} — было ${change.from}, стало ${change.to}`;
  };
  const lines = top.flatMap((each, index) =>
    each.biggest === undefined
      ? []
      : [
          `${each.hero.localizedName}: ${said(each.biggest, index)}${each.nerf === undefined ? '' : `; зато порезали: ${said(each.nerf, index)}`}`
        ]
  );
  return {
    picture: { html: imbaPicture(patch.version, top), ...PICTURE_SIZE },
    // A plain opening, no count of the rest (owner, 26.10.2026: «просто: после 7.41f этих героев больше всего усилили»).
    text: [`После патча ${patch.version} сильнее всех усилили этих героев:`, ...lines].join('\n'),
    poll: poll(
      `Кто имба после ${patch.version}?`,
      withJoke(
        top.map((each) => each.hero.localizedName),
        context.random
      )
    )
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
