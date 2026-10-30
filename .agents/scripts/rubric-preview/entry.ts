// Renders rubric pictures locally: live dotaconstants/datafeed/Steam data, made-up STRATZ numbers, headless Chrome.
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createDotaConstantsApi } from '../../../apps/backend/src/integrations/dotaconstants/dotaconstants';
import { createValveDatafeedApi } from '../../../apps/backend/src/integrations/valve-datafeed/valve-datafeed';
import { createSteamPublicApi } from '../../../apps/backend/src/integrations/steam-public/steam-public';
import { buildRubricSample, RUBRIC_KEYS } from '../../../apps/backend/src/modules/rubrics';
import type { RubricSources } from '../../../apps/backend/src/modules/rubrics/types';

const out = process.argv[2]!;
mkdirSync(out, { recursive: true });
let seed = Number(process.env.RUBRIC_SEED ?? 7);
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const constants = createDotaConstantsApi();
const datafeed = createValveDatafeedApi();
const steam = createSteamPublicApi();
const heroIds = async () => (await constants.heroes()).map((h) => h.id);
const itemIds = async () => (await constants.items()).filter((i) => i.cost > 2000).map((i) => i.id);

const sources: RubricSources = {
  heroes: () => constants.heroes(),
  items: () => constants.items(),
  async itemValues(itemKey) {
    const item = (await datafeed.itemList()).find((each) => each.name === itemKey);
    return item === undefined ? null : datafeed.itemValues(item.id);
  },
  async heroDetail(heroId) {
    const hero = await datafeed.hero(heroId);
    return {
      id: hero.id,
      name: hero.name,
      localizedName: hero.nameLoc,
      abilities: hero.abilities.map((a) => ({
        id: a.id,
        key: a.name,
        name: a.nameLoc,
        isUltimate: a.type === 1,
        cooldowns: a.cooldowns,
        manaCosts: a.manaCosts,
        values: a.values.map((v) => ({ name: v.name, heading: v.heading, values: v.values }))
      }))
    };
  },
  patches: () => datafeed.patchList(),
  async patchNotes(version) {
    const n = await datafeed.patchNotes(version);
    return { version: n.version, timestamp: n.timestamp, heroes: n.heroes };
  },
  steamNews: () => steam.dotaNews(),
  workshopTrending: () => steam.workshopTrending(),
  // A week of finds as the tracker gives them (newest first); RUBRIC_FINDS=1…8 keeps that many.
  gameFinds: async () =>
    [
      {
        build: '6971',
        committedAt: Date.now() - 0.4 * 86_400_000,
        note: 'В английских строках появились реплики диктора для нового события',
        text: 'Сборка 6971 добавила в файл dota_english.txt два десятка реплик диктора для Terrorblade.\nВ них упоминается событие, которого ещё нет в игре.\nНазвание события в строках не указано.'
      },
      {
        build: '6969',
        committedAt: Date.now() - 1.3 * 86_400_000,
        note: 'В scripts/npc у предмета без иконки поменяли перезарядку',
        text: 'В items.txt нашёлся предмет item_crimson_guard_2 без иконки и без цены.\nЕму урезали перезарядку с 40 до 32 секунд.\nВ магазине его нет.'
      },
      {
        build: '6967',
        committedAt: Date.now() - 2.1 * 86_400_000,
        note: 'Изменены значения урона у способностей двух героев',
        text: 'Тихие правки цифр без патча: у двух героев поменяли урон способностей.\nВ описании патча об этом ничего.'
      },
      {
        build: '6966',
        committedAt: Date.now() - 2.9 * 86_400_000,
        note: 'Новые строки описаний для нейтральных предметов',
        text: 'В строках появились описания трёх нейтральных предметов.\nСами предметы в игру пока не добавлены.'
      },
      {
        build: '6964',
        committedAt: Date.now() - 4.2 * 86_400_000,
        note: 'Добавлен файл с заметками к будущему патчу',
        text: 'В папке patchnotes появился новый файл.\nВнутри черновые строки к будущему патчу, текст пока пустой.\nДата выхода не указана.'
      },
      {
        build: '6963',
        committedAt: Date.now() - 5.0 * 86_400_000,
        note: 'В таблицах героев поменяли базовую скорость',
        text: 'Двум героям тихо подняли базовую скорость передвижения.'
      },
      {
        build: '6962',
        committedAt: Date.now() - 5.8 * 86_400_000,
        note: 'Новые ключи у способности героя в vdata',
        text: 'У одной способности появились новые ключи значений.\nВ игре они пока ни на что не влияют.\nПохоже на заготовку под будущий талант.'
      },
      {
        build: '6961',
        committedAt: Date.now() - 6.6 * 86_400_000,
        note: 'Строки для нового сета героя',
        text: 'В английских строках нашлись названия пяти предметов одного сета.\nГерой сета в строках не назван.'
      }
    ].slice(0, Number(process.env.RUBRIC_FINDS ?? 4)),
  stats: {
    heroBracketStats: async (bracket) =>
      (await heroIds()).map((heroId) => {
        const matches = 2000 + Math.floor(rnd() * 40000);
        return { heroId, bracket, matches, wins: Math.floor(matches * (0.42 + rnd() * 0.16)) };
      }),
    heroLateItems: async () => (await itemIds()).sort(() => rnd() - 0.5).slice(0, 8),
    heroPurchases: async () =>
      (await itemIds()).flatMap((itemId) =>
        [10, 20, 30].map((minute) => {
          const matches = 300 + Math.floor(rnd() * 3000);
          return { itemId, minute, matches, wins: Math.floor(matches * (0.35 + rnd() * 0.3)) };
        })
      ),
    heroTimeline: async () =>
      Array.from({ length: 70 }, (_, minute) => {
        const remaining = Math.max(50, 10000 - minute * 140);
        return { minute, remaining, wins: Math.floor(remaining * (0.42 + minute / 400)) };
      }),
    positions: async () =>
      (await heroIds()).flatMap((heroId) =>
        [1, 2, 3, 4, 5].map((position) => {
          const matches = 200 + Math.floor(rnd() * 9000);
          return { heroId, position, matches, wins: Math.floor(matches * (0.4 + rnd() * 0.2)) };
        })
      ),
    twoWeeks: async () =>
      (await heroIds()).flatMap((heroId) =>
        [0, 1].map((week) => {
          const matches = 2000 + Math.floor(rnd() * 30000);
          return { heroId, week, matches, wins: Math.floor(matches * (0.42 + rnd() * 0.16)) };
        })
      ),
    averages: async () =>
      (await heroIds()).map((heroId) => ({
        heroId,
        matches: 5000,
        networth: 15000 + rnd() * 10000,
        heroDamage: 15000 + rnd() * 20000,
        kills: 4 + rnd() * 8,
        deaths: 4 + rnd() * 5
      }))
  }
};

const chrome = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
for (const key of RUBRIC_KEYS.filter((k) => process.argv.length < 4 || process.argv.slice(3).includes(k))) {
  try {
    const sample = await buildRubricSample(key, { sources, random: rnd, now: Date.now() });
    // The draft text and the poll next to the picture (before the AI writer retells the text).
    const poll =
      sample.poll === null
        ? ''
        : `\n\n[${sample.poll.question}]\n${sample.poll.options.map((o) => `- ${o}`).join('\n')}`;
    writeFileSync(`${out}/${key}.txt`, `${sample.text}${poll}\n`);
    if (sample.picture === null) {
      console.log('none', key);
      continue;
    }
    const file = `${out}/${key}.html`;
    writeFileSync(file, sample.picture.html);
    execFileSync(
      chrome,
      [
        '--headless=new',
        '--hide-scrollbars',
        '--window-size=1536,768',
        '--virtual-time-budget=8000',
        `--screenshot=${out}/${key}.png`,
        `file:///${file}`
      ],
      { stdio: 'ignore' }
    );
    // The rubric's second post (a riddle's answer), as <key>-answer.png.
    const answer = sample.followUp?.picture;
    if (answer) {
      writeFileSync(`${out}/${key}-answer.html`, answer.html);
      execFileSync(
        chrome,
        [
          '--headless=new',
          '--hide-scrollbars',
          '--window-size=1536,768',
          '--virtual-time-budget=8000',
          `--screenshot=${out}/${key}-answer.png`,
          `file:///${out}/${key}-answer.html`
        ],
        { stdio: 'ignore' }
      );
    }
    console.log('ok', key);
  } catch (error) {
    console.log('fail', key, String(error).slice(0, 120));
  }
}
