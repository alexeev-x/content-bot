import { AppError } from '../../shared/app-error';
import { escapeHtml, heroImage, itemImage, PICTURE_SIZE, picturePage } from './picture';
import { noData, pick, poll, quiz, type RubricContext, type RubricSample, shuffled } from './types';

// Rubrics over what Valve and the community put out (game files, announcements, the Workshop) and the fun ones whose
// material will come from banks the owner approves; the samples carry a few examples of such a bank.

const AREAS: { test: RegExp; name: string }[] = [
  { test: /npc_heroes|heroes\//iu, name: 'герои' },
  { test: /npc_abilities|abilities\//iu, name: 'способности' },
  { test: /items|neutral_items/iu, name: 'предметы' },
  { test: /resource\/localization/iu, name: 'тексты игры' },
  { test: /patchnotes/iu, name: 'патчноуты' },
  { test: /\.vdata$/iu, name: 'механики' }
];

export async function filesDontLie(context: RubricContext): Promise<RubricSample> {
  const builds = context.sources.gameBuilds();
  if (builds === null) {
    throw new AppError('UNAVAILABLE', 'The game-files tracker has no token', { reason: 'GITHUB_NOT_CONFIGURED' });
  }
  const recent = (await builds)
    .map((build) => ({
      ...build,
      areas: AREAS.filter((area) => build.paths.some((path) => area.test.test(path))).map((area) => area.name)
    }))
    .filter((build) => build.areas.length > 0)
    .slice(0, 4);
  if (recent.length === 0) throw noData('game builds');
  const lines = recent.map((build) => {
    const date = new Date(build.committedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    return `• Сборка ${build.build} (${date}): ${build.areas.join(', ')}`;
  });
  return {
    picture: null,
    text: `🔎 Файлы не врут. Что Valve тихо поменяла за последние сборки:\n${lines.join('\n')}\nValve это не подтверждала — может измениться.`,
    poll: null
  };
}

export async function rateIt(context: RubricContext): Promise<RubricSample> {
  const news = (await context.sources.steamNews()).filter((item) => item.imageUrl !== null);
  const latest = news[0];
  if (latest === undefined || latest.imageUrl === null) throw noData('announcement picture');
  const html = picturePage(
    `<div class="title"><b>Оцениваем</b></div><img class="shot" src="${escapeHtml(latest.imageUrl)}" alt="">`,
    `.shot{margin-top:28px;max-width:1200px;max-height:520px;border-radius:14px;border:1px solid var(--line);box-shadow:0 14px 40px rgba(0,0,0,.6);object-fit:contain}`
  );
  return {
    picture: { html, ...PICTURE_SIZE },
    // Valve's titles are English and posts speak Russian; the AI writer will name the novelty.
    text: 'Новинка из свежего анонса Valve. Оцениваем: 🔥 или 💩?',
    poll: null
  };
}

export async function workshopSet(context: RubricContext): Promise<RubricSample> {
  const set = await context.sources.workshopTrending();
  if (set === null) throw noData('workshop');
  const html = picturePage(
    `<div class="title">Сет из <b>мастерской</b></div><img class="shot" src="${escapeHtml(set.previewUrl)}" alt="">
<div class="sub">${escapeHtml(set.title)}</div>`,
    `.shot{margin-top:28px;max-width:1000px;max-height:470px;border-radius:14px;border:1px solid var(--line);object-fit:contain}
.sub{font-size:30px;font-weight:800;margin-top:18px}`
  );
  return {
    picture: { html, ...PICTURE_SIZE },
    text: `Свежий сет из мастерской Steam набирает популярность: «${set.title}».\nОцениваем: 🔥 или 💩?\nМастерская: ${set.url}`,
    poll: null
  };
}

// Twemoji, an open emoji set; a rebus is pictures only, the answer is in the quiz.
const TWEMOJI = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg';
const REBUSES = [
  { answer: 'Crystal Maiden', emoji: ['1f9ca', '1f478'] },
  { answer: 'Monkey King', emoji: ['1f412', '1f451'] },
  { answer: 'Wraith King', emoji: ['1f480', '1f451'] },
  { answer: 'Dragon Knight', emoji: ['1f409', '1f6e1'] },
  { answer: 'Phantom Assassin', emoji: ['1f47b', '1f5e1'] },
  { answer: 'Storm Spirit', emoji: ['26c8', '1f47b'] }
];

export async function rebus(context: RubricContext): Promise<RubricSample> {
  const heroes = await context.sources.heroes();
  const chosen = pick(REBUSES, context.random);
  const others = shuffled(
    heroes.filter((hero) => hero.localizedName !== chosen.answer),
    context.random
  ).slice(0, 3);
  const options = shuffled([chosen.answer, ...others.map((hero) => hero.localizedName)], context.random);
  const icons = chosen.emoji
    .map((code) => `<img class="emoji" src="${TWEMOJI}/${code}.svg" alt="">`)
    .join('<div class="plus">+</div>');
  const html = picturePage(
    `<div class="title"><b>Ребус</b></div><div class="row">${icons}<div class="plus">=</div><div class="q">?</div></div>`,
    `.row{display:flex;align-items:center;gap:36px;margin-top:56px}
.emoji{width:260px;height:260px}
.plus{font-weight:900;font-size:96px;color:var(--muted)}
.q{font-weight:900;font-size:200px;color:var(--red)}`
  );
  return {
    picture: { html, ...PICTURE_SIZE },
    text: 'Ребус: какой это герой?',
    poll: quiz('Какой это герой?', options, options.indexOf(chosen.answer), `${chosen.answer}.`)
  };
}

export async function guessStreak(context: RubricContext): Promise<RubricSample> {
  const heroes = await context.sources.heroes();
  const hero = pick(heroes, context.random);
  const others = shuffled(
    heroes.filter((each) => each.id !== hero.id && each.attackType === hero.attackType),
    context.random
  ).slice(0, 3);
  const options = shuffled([hero, ...others], context.random);
  return {
    picture: null,
    text: `🔥 Угадай-серия, вопрос дня.\nУ кого из них скорость ${hero.moveSpeed} и дальность атаки ${hero.attackRange}? Держи серию до воскресенья — там топ-10 знатоков.`,
    poll: quiz(
      'Чьи это цифры?',
      options.map((each) => each.localizedName),
      options.findIndex((each) => each.id === hero.id),
      `${hero.localizedName}.`
    )
  };
}

export async function tierListVote(context: RubricContext): Promise<RubricSample> {
  const heroes = await context.sources.heroes();
  const hero = pick(heroes, context.random);
  const html = picturePage(
    `<div class="title">Куда в <b>тир-листе?</b></div><img class="portrait big" src="${heroImage(hero.name)}" alt="">
<div class="sub">${escapeHtml(hero.localizedName)}</div><div class="tiers"><span class="s">S</span><span class="a">A</span><span class="b">B</span><span class="c">C</span><span class="d">D</span></div>`,
    `.portrait.big{width:512px;height:288px;margin-top:24px}
.sub{font-size:36px;font-weight:800;margin-top:14px}
.tiers{display:flex;gap:16px;margin-top:18px}
.tiers span{width:72px;height:72px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:40px;color:#0b0e13}
.s{background:var(--tier-s)}.a{background:var(--tier-a)}.b{background:var(--tier-b)}.c{background:var(--tier-c)}.d{background:var(--tier-d)}`
  );
  return {
    picture: { html, ...PICTURE_SIZE },
    text: `Собираем тир-лист подписчиков. Куда бы ты поставил ${hero.localizedName}? Итог — картинкой через день.`,
    poll: poll(`${hero.localizedName}: какой тир?`, ['S', 'A', 'B', 'C', 'D'])
  };
}

const FAKE_NAMES = ['Тапок Рошана', 'Сапоги токсика', 'Кольцо вечного фида', 'Посох мута', 'Шемелис'];
const FAKE_STATS = [
  '+300 к удаче',
  '−50 к совести',
  '+1 к мату в чате',
  '−100% к желанию ставить варды',
  '+25 к скорости ливания',
  'Пассивно: репорт отскакивает в отправителя'
];

export async function fakeItem(context: RubricContext): Promise<RubricSample> {
  const items = await context.sources.items();
  const looks = pick(
    items.filter((item) => item.cost >= 2000),
    context.random
  );
  const name = pick(FAKE_NAMES, context.random);
  const stats = shuffled(FAKE_STATS, context.random).slice(0, 3);
  const html = picturePage(
    `<div class="title">Шемелис <b>недели</b></div>
<div class="card"><img class="item big" src="${itemImage(looks.key)}" alt=""><div class="facts"><div class="name">${escapeHtml(name)}</div>
${stats.map((stat) => `<div class="stat">${escapeHtml(stat)}</div>`).join('')}<div class="fake">выдумка</div></div></div>`,
    `.card{display:flex;align-items:center;gap:48px;margin-top:48px;padding:32px 48px;border:1px solid var(--line);border-radius:18px;background:rgba(0,0,0,.35)}
.item.big{width:264px;height:192px;border-radius:12px}
.facts{display:flex;flex-direction:column;gap:10px}
.name{font-weight:900;font-size:52px;color:var(--red)}
.stat{font-weight:600;font-size:30px}
.fake{margin-top:8px;align-self:flex-start;font-weight:800;font-size:22px;letter-spacing:2px;text-transform:uppercase;color:#fff;background:var(--red);padding:4px 12px;border-radius:8px}`
  );
  return {
    picture: { html, ...PICTURE_SIZE },
    text: `Шемелис недели: «${name}» — ${stats.join(', ')}.\nПредмета нет, это шутка. Собрали бы? 🔥 или 💩`,
    poll: null
  };
}
