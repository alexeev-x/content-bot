import { spokenHeroName } from './anketa';
import { FORGOTTEN_PLAQUE } from './forgotten-plaque.generated';
import { escapeHtml } from './picture';
import { type HeroInfo, needStats, noData, pick, type RubricContext, type RubricSample } from './types';

// «Забытый герой» (owner, 28.10.2026: «все варианты понравились»): a hero almost nobody picks on Божества who still
// wins, checked on Рекрут — «бери» when he wins there too, an honest «это не тебе» when he doesn't; now and then the
// mirror «Переоценённый», picked by everyone and losing everywhere. Two STRATZ reads, one after the other. The numbers
// are live; the AI writer tells them in the author's voice in one of three looks — «Записка», «Разыскивается» (the
// mirror's «Найден герой»), «Два героя» (only for «бери») — after the owner's own examples in FORGOTTEN_BRIEF.

const DIVINE = 7;
const RECRUIT = 1;
const MIN_MATCHES = 100;
const RARE_PICK = 0.03;
const RARE_WIN = 0.52;
const OVER_PICK = 0.12;
const OVER_WIN = 0.48;
/** One post in four is the mirror. */
const OVER_SHARE = 0.25;

type Rate = { heroId: number; matches: number; pickRate: number; winRate: number };

async function rates(context: RubricContext, bracket: number): Promise<Map<number, Rate>> {
  const stats = await needStats(context).heroBracketStats(bracket);
  const total = stats.reduce((sum, each) => sum + each.matches, 0);
  if (total === 0) throw noData('bracket stats');
  return new Map(
    stats
      .filter((each) => each.matches >= MIN_MATCHES)
      // Ten heroes a match: a hero's share of matches is ten times his share of picks.
      .map((each) => [
        each.heroId,
        {
          heroId: each.heroId,
          matches: each.matches,
          pickRate: (each.matches / total) * 10,
          winRate: each.wins / each.matches
        }
      ])
  );
}

const pct = (value: number) => `${Math.round(value * 100)}%`;

// The picture (owner, 29.10.2026: «да супер»): the image model seats the hero, sad and in cobwebs, in the owner's ruins
// under the «ЗАБЫТЫЕ ГЕРОИ» sign; the browser writes his name on the plaque below it in a worn font of the sign's colour,
// screened into the wood, then lays the plaque's own cobwebs back over the letters so they look painted there.
const RENDERS = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders';
const WIDTH = 1536;
const HEIGHT = 1024;
const PLAQUE = `data:image/jpeg;base64,${FORGOTTEN_PLAQUE}`;
const CSS = `*{margin:0;padding:0}html,body{width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden}
body{position:relative;background:#0c0d14 var(--scene,none) 0 0/${WIDTH}px ${HEIGHT}px no-repeat}
.plaque{position:absolute;left:870px;top:575px;width:500px;height:150px}
.cobwebs{mix-blend-mode:lighten;opacity:.9;filter:brightness(1.05)}
.name{position:absolute;left:915px;top:612px;width:410px;height:90px;display:flex;align-items:center;justify-content:center;
font-family:'Rubik Distressed',Arial,sans-serif;font-size:54px;text-transform:uppercase;letter-spacing:2px;white-space:nowrap;
color:rgb(201,175,168);text-shadow:0 1px 0 rgba(0,0,0,.55),0 -1px 0 rgba(255,255,255,.06);
mix-blend-mode:screen;opacity:.82;transform:rotate(-.6deg)}`;
// The name never leaves the plaque: the font shrinks until it fits.
const FIT = `<script>(()=>{const done=()=>document.documentElement.setAttribute('data-fonts-ready','');
document.fonts.ready.then(()=>{const n=document.querySelector('.name');let s=54;
while((n.scrollWidth>n.clientWidth||n.scrollHeight>n.clientHeight)&&s>20){s-=2;n.style.fontSize=s+'px'}}).then(done,done);
setTimeout(done,8000);})();</script>`;

function scenePage(name: string): string {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Rubik+Distressed&amp;display=block&amp;subset=cyrillic" rel="stylesheet">
<style>${CSS}</style></head><body><img class="plaque" src="${PLAQUE}" alt=""><div class="name">${escapeHtml(name)}</div>
<img class="plaque cobwebs" src="${PLAQUE}" alt="">${FIT}</body></html>`;
}

const heroKey = (hero: HeroInfo) => hero.name.replace('npc_dota_hero_', '');
const spokenName = (hero: HeroInfo) => spokenHeroName(heroKey(hero)) ?? hero.localizedName;

export async function forgottenHero(context: RubricContext): Promise<RubricSample> {
  const [divine, heroes] = await Promise.all([rates(context, DIVINE), context.sources.heroes()]);
  const recruit = await rates(context, RECRUIT);
  const byId = new Map(heroes.map((hero) => [hero.id, hero]));
  const name = (heroId: number) => {
    const hero = byId.get(heroId);
    return hero === undefined ? '?' : spokenName(hero);
  };
  const facts = (hero: Rate, low: Rate) =>
    `Берут в ${pct(hero.pickRate)} игр, на Божествах выигрывает ${pct(hero.winRate)}. На Рекрутах: ${pct(low.winRate)}.`;

  if (context.random() < OVER_SHARE) {
    const over = [...divine.values()].flatMap((hero) => {
      const low = recruit.get(hero.heroId);
      return low !== undefined && hero.pickRate >= OVER_PICK && hero.winRate < OVER_WIN && low.winRate < 0.49
        ? [{ hero, low }]
        : [];
    });
    if (over.length > 0) {
      const { hero, low } = pick(over, context.random);
      const look = pick(['Записка', 'Найден герой'] as const, context.random);
      return draft(
        byId.get(hero.heroId),
        `Вид: Переоценённый · ${look}\nГерой: ${name(hero.heroId)}\n${facts(hero, low)}`
      );
    }
  }

  type Rare = { hero: Rate; low: Rate; verdict: 'бери' | 'это не тебе' };
  const rare = [...divine.values()].flatMap((hero): Rare[] => {
    const low = recruit.get(hero.heroId);
    if (low === undefined || hero.pickRate >= RARE_PICK || hero.winRate < RARE_WIN) return [];
    if (low.winRate >= 0.5) return [{ hero, low, verdict: 'бери' }];
    return low.winRate <= 0.48 ? [{ hero, low, verdict: 'это не тебе' }] : [];
  });
  if (rare.length === 0) throw noData('rare heroes that win');
  const { hero, low, verdict } = pick(
    [...rare].sort((a, b) => b.hero.winRate - a.hero.winRate).slice(0, 5),
    context.random
  );
  const looks =
    verdict === 'бери' ? (['Записка', 'Разыскивается', 'Два героя'] as const) : (['Записка', 'Разыскивается'] as const);
  const look = pick(looks, context.random);
  // «Два героя» sets him beside the one everybody picks on Рекрут.
  const crowd = [...recruit.values()].sort((a, b) => b.pickRate - a.pickRate)[0];
  const pair =
    look === 'Два героя' && crowd !== undefined
      ? `\nРядом с ним: ${name(crowd.heroId)} — берут в ${pct(crowd.pickRate)} игр на Рекрутах, выигрывает ${pct(crowd.winRate)}.`
      : '';
  return draft(
    byId.get(hero.heroId),
    `Вид: Забытый · ${look}\nГерой: ${name(hero.heroId)}\n${facts(hero, low)} Вердикт: ${verdict}.${pair}`
  );
}

function draft(hero: HeroInfo | undefined, text: string): RubricSample {
  if (hero === undefined) throw noData('the forgotten hero');
  const name = spokenName(hero);
  return {
    picture: { html: scenePage(name), width: WIDTH, height: HEIGHT },
    heroScene: { renderUrl: `${RENDERS}/${heroKey(hero)}.png`, heroName: name, scene: 'forgotten' },
    text,
    boldLead: true,
    poll: null
  };
}

/** The writer's brief: the owner's own examples of each look (banks/23, 28.10.2026), the numbers from the draft. */
export const FORGOTTEN_BRIEF = [
  'Напиши пост «Забытый герой» в том виде, что указан в черновике, ровно как в примерах ниже: тот же заголовок, тот же порядок, грубо, с матом, от лица новичка, который сам фидит. Цифры и вердикт — только из черновика, ничего не придумывай про механику, чего не знаешь точно. Героя называй, как зовут игроки. Последняя строка — пара реакций, как в примере.',
  'Первая строка — герой и суть, обыгранные одной живой фразой, как в примерах («Лина — переоценённый герой. Или люди не умеют играть, или я ебаное чмо»); не голое название рубрики вроде «Переоценённый: Лина».',
  'Пример «Записка», бери:',
  '🕸 Трент — забытый герой. Его никто не берёт, а он, сука, тащит\nБерут в ≈2% игр, на Божествах выигрывает ≈54%. Проверил у нас, на Рекрутах: ≈53%. Работает, бери.\nКидаешь броню на своего керри через всю карту, сам при этом стоишь в лесу и ни с кем не встречаешься. Потом жмёшь ульту — и вся их тима стоит в корнях, как я перед выбором героя.\nИдеальный герой для человека, который боится людей. То есть для меня.\n🔥 — беру, людей тоже боюсь · 💩 — я не дерево',
  'Пример «Записка», это не тебе:',
  '🕸 Чен тащит у Божеств. Тебе не надо\nБерут в ≈1% игр, на Божествах выигрывает ≈55%. Только не беги пикать: на Рекрутах тот же Чен выигрывает ≈43%. Это не тебе.\nНа Божествах на нём играют три маньяка, которые пятый год гоняют по карте стаю крипов и ни разу не трогали траву. Я одним героем не могу добить крипа, а тут надо управлять пятью.\nПоследний раз, когда я взял Чена, мои кентавры ушли в лес без меня. Самостоятельные, суки.\n🔥 — я тот самый маньяк · 💩 — у меня две руки',
  'Пример «Разыскивается»:',
  '🕸 Разыскивается: Трент\nПропал из пиков. Берут в ≈2% игр, хотя на Божествах выигрывает ≈54%, а у нас, на Рекрутах, — ≈53%.\nПриметы: большое дерево, медленно бьёт, кидает броню на своих через всю карту, ульта сажает всю вражескую тиму в корни.\nПоследний раз видели: в лесу. Стоял, не двигался, его приняли за обычное дерево и срубили Тангом.\nНашедшему — победа. Если увидите в пике — не баньте, он и так никому нахуй не нужен.\n🔥 — беру · 💩 — пусть дальше стоит в лесу',
  'Пример «Два героя»:',
  '🕸 Трент против Пуджа: кто реально тащит\nТрента берут в ≈2% игр, выигрывает ≈54%, у нас на Рекрутах — ≈53%.\nПуджа берут в каждой третьей игре, выигрывает ≈47%.\nОдин кидает броню на своих через всю карту и сажает врагов в корни. Второй промахивается хуком и сам бежит в пятерых.\nУгадайте, кого пикнул я.\n🔥 — беру Трента · 💩 — Пудж навсегда',
  'Пример «Переоценённый»:',
  '🎈 Пудж — переоценённый герой. Или люди не умеют играть, или я ебаное чмо\nБерут в каждой третьей игре, выигрывает ≈47%. На Рекрутах, на Божествах — везде одно и то же.\nХук летит в крипа. Второй хук — в крипа. Третий хук — в своего Котла. Котла ебут, Котёл пишет, что я пидор. Котёл прав.\nЯ тоже его беру. И тоже проигрываю. Хоть в чём-то я как все.\n🤡 — это я · 🗿 — Пудж имба, цифры врут'
].join('\n');
