import { needStats, noData, pick, type RubricContext, type RubricSample } from './types';

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

export async function forgottenHero(context: RubricContext): Promise<RubricSample> {
  const [divine, heroes] = await Promise.all([rates(context, DIVINE), context.sources.heroes()]);
  const recruit = await rates(context, RECRUIT);
  const name = new Map(heroes.map((hero) => [hero.id, hero.localizedName]));
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
      return draft(`Вид: Переоценённый · ${look}\nГерой: ${name.get(hero.heroId) ?? '?'}\n${facts(hero, low)}`);
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
      ? `\nРядом с ним: ${name.get(crowd.heroId) ?? '?'} — берут в ${pct(crowd.pickRate)} игр на Рекрутах, выигрывает ${pct(crowd.winRate)}.`
      : '';
  return draft(
    `Вид: Забытый · ${look}\nГерой: ${name.get(hero.heroId) ?? '?'}\n${facts(hero, low)} Вердикт: ${verdict}.${pair}`
  );
}

function draft(text: string): RubricSample {
  return { picture: null, text, noPicture: true, boldLead: true, poll: null };
}

/** The writer's brief: the owner's own examples of each look (banks/23, 28.10.2026), the numbers from the draft. */
export const FORGOTTEN_BRIEF = [
  'Напиши пост «Забытый герой» в том виде, что указан в черновике, ровно как в примерах ниже: тот же заголовок, тот же порядок, грубо, с матом, от лица новичка, который сам фидит. Цифры и вердикт — только из черновика, ничего не придумывай про механику, чего не знаешь точно. Героя называй, как зовут игроки. Последняя строка — пара реакций, как в примере.',
  'Первая строка — сама суть одной фразой, как в примерах; название рубрики («Забытый герой», «Переоценённый») не пиши.',
  'Пример «Записка», бери:',
  '🕸 Трента никто не берёт, а он тащит\nБерут в ≈2% игр, на Божествах выигрывает ≈54%. Проверил у нас, на Рекрутах: ≈53%. Работает, бери.\nКидаешь броню на своего керри через всю карту, сам при этом стоишь в лесу и ни с кем не встречаешься. Потом жмёшь ульту — и вся их тима стоит в корнях, как я перед выбором героя.\nИдеальный герой для человека, который боится людей. То есть для меня.\n🔥 — беру, людей тоже боюсь · 💩 — я не дерево',
  'Пример «Записка», это не тебе:',
  '🕸 Чен тащит у Божеств. Тебе не надо\nБерут в ≈1% игр, на Божествах выигрывает ≈55%. Только не беги пикать: на Рекрутах тот же Чен выигрывает ≈43%. Это не тебе.\nНа Божествах на нём играют три маньяка, которые пятый год гоняют по карте стаю крипов и ни разу не трогали траву. Я одним героем не могу добить крипа, а тут надо управлять пятью.\nПоследний раз, когда я взял Чена, мои кентавры ушли в лес без меня. Самостоятельные, суки.\n🔥 — я тот самый маньяк · 💩 — у меня две руки',
  'Пример «Разыскивается»:',
  '🕸 Разыскивается: Трент\nПропал из пиков. Берут в ≈2% игр, хотя на Божествах выигрывает ≈54%, а у нас, на Рекрутах, — ≈53%.\nПриметы: большое дерево, медленно бьёт, кидает броню на своих через всю карту, ульта сажает всю вражескую тиму в корни.\nПоследний раз видели: в лесу. Стоял, не двигался, его приняли за обычное дерево и срубили Тангом.\nНашедшему — победа. Если увидите в пике — не баньте, он и так никому нахуй не нужен.\n🔥 — беру · 💩 — пусть дальше стоит в лесу',
  'Пример «Два героя»:',
  '🕸 Трент против Пуджа: кто реально тащит\nТрента берут в ≈2% игр, выигрывает ≈54%, у нас на Рекрутах — ≈53%.\nПуджа берут в каждой третьей игре, выигрывает ≈47%.\nОдин кидает броню на своих через всю карту и сажает врагов в корни. Второй промахивается хуком и сам бежит в пятерых.\nУгадайте, кого пикнул я.\n🔥 — беру Трента · 💩 — Пудж навсегда',
  'Пример «Переоценённый»:',
  '🎈 Пуджа берут все. И все сливают\nБерут в каждой третьей игре, выигрывает ≈47%. На Рекрутах, на Божествах — везде одно и то же.\nХук летит в крипа. Второй хук — в крипа. Третий хук — в своего Котла. Котла ебут, Котёл пишет, что я пидор. Котёл прав.\nЯ тоже его беру. И тоже проигрываю. Хоть в чём-то я как все.\n🤡 — это я · 🗿 — Пудж имба, цифры врут'
].join('\n');
