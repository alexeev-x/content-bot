import type { RichSampleKey, SendRichSamplesResponse } from '@alexeev/contracts';
import { GrammyError } from 'grammy';
import { latestRichReports, readLastWeekData, weeklyRichHtml } from '../../modules/content-analytics';
import { getOwnerOperationsSettings } from '../../modules/settings';
import type { TelegramRichMessageApi } from '../../integrations/telegram/telegram-api';
import type { Logger } from '../../platform/logging/logger';
import type { Container } from '../container';

// The DEV look at Telegram rich messages (Bot API 10.1–10.3) before any post is rebuilt (owner, 23.10.2026): every
// kind of channel post and both analytics reports. The texts are the AI writer's drafts on DEV, the facts of Valve's
// announcements and Liquipedia, and the reports DEV released; nothing calls the AI. The owner's rules (23.10.2026):
// one picture per post, no English text but names, no source line, only «Подробнее» to dota2.com.

const SEND_TIMEOUT_MS = 10_000;
const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const ERROR_MAX = 300;

const CDN = 'https://cdn.steamstatic.com/apps/dota2';
const CARNIVAL_PAGE = 'https://www.dota2.com/darkcarnival';
const TROVE_PAGE = 'https://www.dota2.com/newsentry/681888927386174386';
// The newest patch picture from the studio's library, uploaded (`tg://photo?id=`) as our R2 pictures would go.
const COVER_ID = 'patch_cover';
const COVER_FIGURE = `<figure><img src="tg://photo?id=${COVER_ID}"/></figure>\n`;
// The reports are read when the button is pressed; these mark where they go.
const DAILY = 'daily-report';
const WEEKLY = 'weekly-report';

type Target = 'channel' | 'owner';
type Sample = { key: RichSampleKey; title: string; targets: Target[]; classic?: boolean; html: string };

const more = (url: string) => `<tg-button-row><tg-button type="url" url="${url}">Подробнее</tg-button></tg-button-row>`;
const picture = (url: string) => `<figure><img src="${url}"/></figure>`;
// Several pictures of one post go in one slider (owner, 23.10.2026), never a collage.
const slideshow = (urls: readonly string[]) =>
  `<tg-slideshow>${urls.map((url) => `<img src="${url}"/>`).join('')}</tg-slideshow>`;

// A big patch (owner, 23.10.2026): the main change, then one table of the two heroes cut hardest, the two buffed
// most and two mixed ones, each group under a header row (no stripes: they mixed with the group rows), the items
// folded apart. From Valve's Russian notes (datafeed/patchnotes) and the AI writer's draft.
type HeroChange = [hero: string, change: string];
function patchPost(input: {
  version: string;
  cover: boolean;
  main: string;
  nerfed: HeroChange[];
  buffed: HeroChange[];
  mixed: HeroChange[];
  items: string[];
}): string {
  const group = (title: string, heroes: HeroChange[]) => [
    `<tr><th colspan="2">${title}</th></tr>`,
    ...heroes.map(([hero, change]) => `<tr><td>${hero}</td><td>${change}</td></tr>`)
  ];
  return [
    `<h3>Вышел ${input.version}</h3>`,
    `${input.cover ? COVER_FIGURE : ''}<p>Главное: ${input.main}</p>`,
    '<table bordered compact>',
    ...group('🔴 Порезали сильнее всех', input.nerfed),
    ...group('🟢 Усилили', input.buffed),
    ...group('🟡 И то и другое', input.mixed),
    '</table>',
    `<details><summary>Предметы</summary><ul>${input.items.map((item) => `<li>${item}</li>`).join('')}</ul></details>`,
    more(`https://www.dota2.com/patches/${input.version}`)
  ].join('\n');
}

const PATCH = patchPost({
  version: '7.41f',
  cover: true,
  main: '<b>Тренту порезали базовый интеллект</b>, инвиз после выхода из деревьев держится вдвое меньше, а Living Armor теперь стоит ману.',
  nerfed: [
    [
      'Трент',
      'интеллект 20 → 17, инвиз после деревьев 2 → 1 сек, Living Armor стоит 35 маны и лечит слабее на ранних уровнях'
    ],
    ['Кипер', 'базовая скорость атаки 100 → 90, слабее сокращает перезарядки, Illuminate лечит 60% вместо 70%']
  ],
  buffed: [
    ['Урса', 'урон от своего здоровья 1,25% → 1,75%'],
    ['Анти-Маг', 'урон от сожжённой маны 60% → 65%']
  ],
  mixed: [
    ['Хускар', 'базовая сила −1, зато прирост силы 3,3 → 3,4'],
    [
      'Earth Spirit',
      'таланты переставили: +200 урона Geomagnetic Grip от копии уже на 20-м, но заряды копий растут медленнее и их максимум 13'
    ]
  ],
  items: [
    'Капли дают на четверть меньше регена маны',
    'Satanic и Mask of Madness слабее вампирят',
    'У сильвера чуть дольше откат инвиза и меньше бонус скорости',
    'Battle Fury рубит деревья раз в 3 секунды вместо 4'
  ]
});

// 7.41e: the draft's main change (Bind breaks a Twin Gate teleport) and Valve's notes for the groups.
const PATCH_E = patchPost({
  version: '7.41e',
  cover: false,
  main: '<b>Привязка теперь сбивает телепорт через парные порталы.</b> Ещё один способ никуда не уехать.',
  nerfed: [
    [
      'Snapfire',
      'урон от приземления и шаров ульты ниже, выстрел в упор +25% вместо +30%, на 25-м 6 шаров вместо 8, талант на печеньку заменили дальностью'
    ],
    [
      'Clockwerk',
      'обзор шестерней днём 1600 → 800, ночью 600 → 400, толчок шестерни короче на ранних уровнях, жжёт меньше маны'
    ]
  ],
  buffed: [
    ['Troll Warlord', 'смена стойки больше не снимает невидимость, +35% к сопротивлению замедлениям, ловкость 23 → 24'],
    [
      'Outworld Destroyer',
      'барьер ставится мгновенно и не прерывает движение, прочнее на ранних уровнях, перезарядка до 27 сек'
    ]
  ],
  mixed: [
    [
      'Legion Commander',
      'сила 24 → 25 и скорость атаки 100 → 105, но прирост силы 3,1 → 3, а талант на 25-м вместо сброса Duel даёт −30 сек перезарядки'
    ],
    ['Doom', 'дальность атаки 200 → 175, зато больше базового урона от способности']
  ],
  items: [
    'Mask of Madness дальникам даёт меньше скорости и вдвое меньше сопротивления замедлению',
    'У Butterfly −5 ловкости, но +5 урона',
    "Crella's Crozier: кража скорости длится на треть дольше, Putrefaction Aura 75% → 90%"
  ]
});

// A hotfix worth a post: «Dota 2 Update - 7/1/2026» (event rewards a player cares about), the rest folded.
const HOTFIX = `<h3>Обновление 1 июля: карнавал щедрее</h3>
<p>Valve выпустила мелкий фикс, но для «Тёмного карнавала» он важный:</p>
<ul>
<li>за обычные игры теперь дают <b>2 металлолома, за турбо — 1</b>, даже при поражении. 6 металлолома меняются на билет любого героя;</li>
<li>Seeing Stones теперь можно получить в коопе с ботами на сложности Hard и Unfair;</li>
<li>в Candyworks видно, есть ли у тебя уже предложенный предмет.</li>
</ul>
<details><summary>Остальные исправления</summary><ul>
<li>Для ранкеда по ролям в соло теперь хватает одной востребованной роли</li>
<li>Билеты карнавала снова дают за Ability Draft и игры с ботами</li>
<li>Пироги карнавала больше не выдают, где настоящий герой, а где иллюзия</li>
<li>Ironwood Nut больше не даёт некоторым героям не тот основной атрибут</li>
</ul></details>
${more('https://www.dota2.com/newsentry/670621050832160174')}`;

// The event series (owner, 22.10.2026: three posts on fixed topics): the AI writer's three Dark Carnival posts.
const SERIES_EVENT = `<h3>«Тёмный карнавал»: побег из поезда и награды</h3>
${picture(`${CDN}/images/dota_react/darkcarnival/overworld/dark_carnival_overworld_poster.jpg`)}
<p>В Доте вышел «Тёмный карнавал»: надо сбежать из пауконогого поезда Магистра. Основной сюжет бесплатный. Играешь в Доту, получаешь билеты в зависимости от выбранного героя и открываешь путь по вагонам.</p>
<p>Главная приманка по дороге: <b>четыре набора для Phantom Assassin, Crystal Maiden, Invoker и Magnus</b>. Получить их можно только через сюжет. Ещё вернулась лавка конфет, а десять монет можно обменять на скидку в магазине события.</p>
<p>За деньги отдельно продают «Комплект тайных комнат»: он открывает побочные истории с наградами, а крипов и музыку даёт сразу. Для основного побега покупать его не надо))</p>
${more(CARNIVAL_PAGE)}`;

const SERIES_COSMETICS = `<h3>Пять личностей-автоматонов</h3>
${slideshow(
  ['axe', 'legion_commander', 'oracle', 'morphling', 'bristleback'].map(
    (hero) => `${CDN}/images/dota_react/darkcarnival/automatons/${hero}/${hero}_automaton_gameplay_poster.jpg`
  )
)}
<p>Морф теперь из стали, а брист перешёл на машинное масло. Причём бристу сойдёт и отработка, если уж наливают))</p>
<table bordered striped compact>
<tr><th>Герой</th><th>Какой он теперь</th></tr>
<tr><td>Axe</td><td>чуть не расплавили: собрали двигатель ярости, а он хочет убить вообще всё</td></tr>
<tr><td>Legion Commander</td><td>роботизированный сапог, чтобы давить врагов каблуком и пореже останавливаться</td></tr>
<tr><td>Oracle</td><td>заводной пророк: будущее видит, изменить не может, а слушать его никто не хочет</td></tr>
<tr><td>Morphling</td><td>теперь из стали</td></tr>
<tr><td>Bristleback</td><td>перешёл на машинное масло</td></tr>
</table>
<p>И тут переделали не одну внешность. У каждого из пяти новые анимации, уникальные эффекты и иконки, плюс изменённая обработка голоса. Даже звучать эта пятёрка будет по-другому</p>
${more(CARNIVAL_PAGE)}`;

// The carnival treasure's sets in the event page's order, from common to the rarest (dota2.com/darkcarnival).
const CARNIVAL_SETS: [string, string, string][] = [
  ['Drow Ranger', 'drow', 'Motley Marauder'],
  ['Undying', 'undying', 'Court Fester'],
  ['Queen of Pain', 'qop', 'Mistress of Ceremonies'],
  ['Arc Warden', 'arc_warden', 'Palms of Prophecy'],
  ['Troll Warlord', 'troll_warlord', 'Lute and Pillager'],
  ['Death Prophet', 'death_prophet', 'Mademoiselle Macabaret'],
  ['Phantom Lancer', 'phantom_lancer', 'Flim-Flam Felidae'],
  ['Dawnbreaker', 'dawnbreaker', 'Bar Belle'],
  ['Templar Assassin', 'templar_assassin', 'Vaudevillain'],
  ['Monkey King', 'monkey_king', 'Bonobo the Clown'],
  ['Pudge', 'pudge', 'The Woodcutter (с личностью)'],
  ['Primal Beast', 'primal_beast', 'Mane Attraction'],
  ['Mirana', 'mirana', 'Selemene Showgirl'],
  ['Dark Willow', 'dark_willow', 'Fairy Godmummer'],
  ['Io', 'io', '<b>Madame Scrio</b> — самая редкая']
];
const SERIES_TREASURE = `<h3>Treasure of Wonders: Io и карнавальные сеты</h3>
${slideshow(
  [...CARNIVAL_SETS].reverse().map(([, slug]) => `${CDN}/videos/dota_react/darkcarnival/treasure/set_${slug}.png`)
)}
<p>Самая редкая награда Treasure of Wonders досталась шару: Io в наборе Madame Scrio. Всего в сокровищнице 15 карнавальных сетов. У Пуджа тут The Woodcutter, причём личность к нему прилагается.</p>
<table bordered striped compact>
<tr><th>Герой</th><th>Сет</th></tr>
${CARNIVAL_SETS.map(([hero, , set]) => `<tr><td>${hero}</td><td>${set}</td></tr>`).join('\n')}
</table>
<p>Что интереснее, шар или Пудж с личностью?</p>
${more(CARNIVAL_PAGE)}`;

// A treasure without its own page: the AI writer's Trove of Terror news, then its two follow-ups (sets, details).
const TROVE_NEWS = `<h3>Trove of Terror</h3>
${picture('https://clan.akamai.steamstatic.com/images/3703047/44e04da47da8b634dee235756e4ffa1234879b40.png')}
<p>Габен вернул аркану на дровку и добавил новую на тайда. Обе в новой сокровищнице Trove of Terror, которая уже вышла в Доте.</p>
<p>Внутри 15 Immortal-сетов в духе потусторонних кошмаров. У дровки есть прежний облик и новый мрачный вариант.</p>
<p>Тайду досталась <b>Maw of the Megalodon</b>: новая модель, анимации, эффекты, насмешки и реплики. Всего три акульих облика, которые предстоит открыть.</p>
<p>За открытие определённого количества сокровищниц гарантированно дадут новый облик Терзателя, а за ещё большее количество — Рошана.</p>
${more(TROVE_PAGE)}`;

// Liquipedia's set icons (its `imageinfo` API, 256×170), the rarest first.
const LIQUIPEDIA_IMAGES = 'https://liquipedia.net/commons/images';
const TROVE_ICONS = [
  '6/67/Cosmetic_icon_Maw_of_the_Megalodon.png',
  'a/a6/Cosmetic_icon_Sepulchral_Stalker.png',
  'a/a0/Cosmetic_icon_Hell%27s_Legion.png',
  '1/1c/Cosmetic_icon_Curse_of_the_Wyrmbender.png',
  '9/95/Cosmetic_icon_Mesmer-Eye.png',
  'f/f2/Cosmetic_icon_Stoneback_Sovereign.png',
  '1/18/Cosmetic_icon_Patchwork_Protector.png',
  '4/43/Cosmetic_icon_Creeping_Calabash.png',
  '0/0a/Cosmetic_icon_Rictus_Ripper.png',
  'e/e2/Cosmetic_icon_Clairvoyant_Configuration.png',
  'c/c0/Cosmetic_icon_Slobbering_Strongbox.png',
  '2/25/Cosmetic_icon_Shattered_Sanity.png',
  '0/04/Cosmetic_icon_Arachnid_Anathema.png',
  '1/10/Cosmetic_icon_Daemon_Hunter.png',
  '6/65/Cosmetic_icon_Direstone_Desecration.png',
  '2/2f/Cosmetic_icon_Greasepaint_Gutbuster.png',
  'd/d4/Cosmetic_icon_Silken_Sibyl.png'
];
const TROVE_SETS = `<h3>Trove of Terror: все сеты и цена</h3>
${slideshow(TROVE_ICONS.map((path) => `${LIQUIPEDIA_IMAGES}/${path}`))}
<p>Сокровищница стоит <b>$4.99</b>. Шанс на редкие растёт с каждым открытием и сбрасывается, когда предмет выпал.</p>
<table bordered striped compact>
<tr><th>Редкость</th><th>Сеты</th></tr>
<tr><td>Обычные</td><td>Stoneback Sovereign, Patchwork Protector, Creeping Calabash, Rictus Ripper, Clairvoyant Configuration, Slobbering Strongbox, Shattered Sanity, Arachnid Anathema, Daemon Hunter, Direstone Desecration, Greasepaint Gutbuster, Silken Sibyl</td></tr>
<tr><td>Редкие</td><td>Curse of the Wyrmbender, Mesmer-Eye</td></tr>
<tr><td>Очень редкий</td><td>Hell's Legion</td></tr>
<tr><td>Ультраредкие</td><td>Sepulchral Stalker, Maw of the Megalodon</td></tr>
</table>
${more(TROVE_PAGE)}`;

const TROVE_DETAILS = `<h3>Trove of Terror: шансы и бонусы</h3>
<p>Бонусы за открытия: <b>12</b> сокровищниц — Obscene Eye Ball, <b>40</b> — R'shan the Eternal и Baby R'shan the Eternal.</p>
<table bordered striped compact>
<caption>Шанс на N-м открытии</caption>
<tr><th>№</th><th align="right">Редкий</th><th align="right">Оч. редкий</th><th align="right">Ультра</th></tr>
<tr><td>1-е</td><td align="right">0.05%</td><td align="right">0.005%</td><td align="right">0.001%</td></tr>
<tr><td>10-е</td><td align="right">9.61%</td><td align="right">1.78%</td><td align="right">0.17%</td></tr>
<tr><td>20-е</td><td align="right">38.46%</td><td align="right">7.87%</td><td align="right">0.95%</td></tr>
<tr><td>30-е</td><td align="right">71.42%</td><td align="right">16.66%</td><td align="right">2.17%</td></tr>
<tr><td>40-е</td><td align="right">100%</td><td align="right">30.30%</td><td align="right">3.84%</td></tr>
<tr><td>50-е</td><td align="right">100%</td><td align="right">45.45%</td><td align="right"><b>100%</b></td></tr>
</table>
<p>Если за 50 открытий ультраредкий не выпал, на 50-м он гарантирован.</p>
${more(TROVE_PAGE)}`;

const CLAN_IMAGES = 'https://clan.akamai.steamstatic.com/images/3703047';

// News that is neither a patch nor an event (owner, 23.10.2026: the whole content, not a short summary): Valve's
// «Летняя чистка 2026» page (dota2.com/summerscrub2026, Valve's Russian texts) behind the 7.41e announcement.
const NEWS = `<h3>Летняя чистка 2026</h3>
${picture(`${CLAN_IMAGES}/5179a724ee3987b0b0dab399b9ef2eaba7b2abf4.png`)}
<p>Вместе с 7.41e Valve выкатила большую чистку: <b>две новые функции и 163 исправления</b>.</p>
<h4>Новое</h4>
<ul>
<li><b>Послеигровой разбор</b>: развеивания, командное снижение урона, вклад союзников в урон, какие способности добили врагов и откуда пришло лечение. Всё можно отфильтровать по времени игры.</li>
<li><b>Горячие клавиши для существ</b>: на каждого не-героя можно повесить свою клавишу.</li>
</ul>
<h4>Подбор игр</h4>
<ul>
<li>Random Draft и классический рейтинговый подбор убрали из рейтинговых режимов;</li>
<li>новая опция «выбирать все роли, если кончились жетоны ролевого поиска», а при первом доступе к рейтингу дают 5 жетонов;</li>
<li>рейтинг Титанов пересчитали: теперь у всех от 1 до 9500, места в таблице лидеров те же, Immortal Draft всё так же с 8500.</li>
</ul>
<details><summary>Исправления по разделам</summary>
<table bordered striped compact>
<tr><th>Раздел</th><th align="right">Исправлений</th></tr>
<tr><td>Косметика</td><td align="right">68</td></tr>
<tr><td>Игровой процесс</td><td align="right">59</td></tr>
<tr><td>Прочее</td><td align="right">23</td></tr>
<tr><td>Визуальные ошибки</td><td align="right">7</td></tr>
<tr><td>Подбор игр</td><td align="right">6</td></tr>
</table>
<p>Из забавного: свитками телепортации можно было генерировать бесконечное золото, а Bristleback навсегда оставался с Warpath, если тот срабатывал от смертельного удара.</p>
</details>
${more('https://www.dota2.com/summerscrub2026')}`;

// No table for long descriptions (owner, 23.10.2026: a one-word column stretched on a phone): name, then the text.
// A second news post: The International's predictions, fantasy and supporter bundles (Valve's announcement).
const TI_NEWS = `<h3>The International: прогнозы, фэнтези и наборы команд</h3>
${picture(`${CLAN_IMAGES}/5c825b3d35627bfc4276c013745aa6fd4de935ea.png`)}
<p>До TI в Шанхае две недели, все 16 команд известны, и Valve открыла всё, во что можно вписаться зрителю.</p>
<p><b>Наборы поддержки</b><br>Для всех 16 команд и сотни комментаторов; <b>50% продаж уходит команде или таланту, 30% — в призовой</b>. С уровня Gold — своё изваяние команды на базе до конца сентября.</p>
<p><b>Прогнозы</b><br>Угадать швейцарскую стадию и сетку; полностью швейцарку ещё не угадал никто. Успеть до первого матча.</p>
<p><b>Фэнтези</b><br>Теперь ты тренер со своими модификаторами на всю команду; игроков берёшь парами: обе поддержки из одной команды, лёгкая и сложная линии из одной, плюс любимый мидер.</p>
<p><b>Награды</b><br>Лучшим — сокровищница Tyrian Regalia с пятью переделанными Immortal и новый жетон ландшафта: один из шести, включая Reef's Edge и Immortal Gardens.</p>
${more('https://www.dota2.com/newsentry/678505520073540063')}`;

// A find in the game files (build 6962: Primal Beast's new effect slots), the diff retold in Russian.
const DIFF = `+ эффекты Trample
+ эффекты Uproar
+ эффекты Rock Throw
+ эффекты Pulverize
+ эффекты Colossal`;
const DATAMINE_TEXT =
  'В файлах игры нашли: у Primal Beast появились отдельные слоты эффектов для Trample, Uproar, Rock Throw, Pulverize и Colossal. Похоже на кастомные эффекты способностей. Valve не подтверждала, может измениться.';
// No heading: the text opens with «В файлах игры нашли» (owner, 23.10.2026: the heading only repeated it).
const DATAMINE = `<p>${DATAMINE_TEXT}</p>
<pre><code class="language-diff">${DIFF}</code></pre>`;
const DATAMINE_CLASSIC = `${DATAMINE_TEXT}

<pre><code class="language-diff">${DIFF}</code></pre>`;

// Posts only to the test channel, the reports only to the owner (owner, 23.10.2026: no copies in both).
const CHANNEL: Target[] = ['channel'];
const SAMPLES: Sample[] = [
  { key: 'patch_f', title: 'Патч 7.41f', targets: CHANNEL, html: PATCH },
  { key: 'patch_e', title: 'Патч 7.41e', targets: CHANNEL, html: PATCH_E },
  { key: 'hotfix', title: 'Хотфикс 1 июля', targets: CHANNEL, html: HOTFIX },
  { key: 'series_event', title: 'Серия ивента 1/3', targets: CHANNEL, html: SERIES_EVENT },
  { key: 'series_cosmetics', title: 'Серия ивента 2/3', targets: CHANNEL, html: SERIES_COSMETICS },
  { key: 'series_treasure', title: 'Серия ивента 3/3', targets: CHANNEL, html: SERIES_TREASURE },
  { key: 'trove_news', title: 'Сокровище: новость', targets: CHANNEL, html: TROVE_NEWS },
  { key: 'trove_sets', title: 'Сокровище: сеты', targets: CHANNEL, html: TROVE_SETS },
  { key: 'trove_details', title: 'Сокровище: детали', targets: CHANNEL, html: TROVE_DETAILS },
  { key: 'news_scrub', title: 'Новость: Летняя чистка', targets: CHANNEL, html: NEWS },
  { key: 'news_ti', title: 'Новость: The International', targets: CHANNEL, html: TI_NEWS },
  { key: 'datamine', title: 'Файлы игры (rich)', targets: CHANNEL, html: DATAMINE },
  {
    key: 'datamine_classic',
    title: 'Файлы игры (обычный pre)',
    targets: CHANNEL,
    classic: true,
    html: DATAMINE_CLASSIC
  },
  { key: 'daily_report', title: 'Отчёт за день', targets: ['owner'], html: DAILY },
  { key: 'weekly_report', title: 'Отчёт за неделю', targets: ['owner'], html: WEEKLY }
];

/** The newest released daily and weekly reports as the module renders them, all parts and the AI review kept. */
export async function latestReports(container: Container): Promise<{ daily: string | null; weekly: string | null }> {
  const stored = await latestRichReports({
    reports: container.contentDailyReports,
    names: container.contentVideoNames
  });
  return { daily: stored.daily, weekly: stored.weekly ?? (await lastWeekHtml(container)) };
}

/** Before DEV's first Monday report: the last full week read now (no review), so the layout can still be seen. */
async function lastWeekHtml(container: Container): Promise<string> {
  const { timezone } = await getOwnerOperationsSettings({
    repo: container.settings,
    logger: container.logger,
    requestId: 'rich-samples'
  });
  const data = await readLastWeekData({
    analytics: container.contentAnalytics,
    alerts: container.contentAlerts,
    goals: container.contentGoals,
    clock: container.clock,
    timezone
  });
  return weeklyRichHtml(data, timezone);
}

/** The newest drawn patch picture (`patch-<id>.jpg`) in the studio's library, or null. */
export async function latestPatchCover(container: Container): Promise<Uint8Array | null> {
  const storage = container.mediaStorage;
  if (storage === undefined) return null;
  // The picture is attached by the bot, which the library never lists: it is found on the newest announcement's post.
  const { items: events } = await container.sourceEvents.list({ view: 'active', page: 1, limit: 20 });
  const postIds = events.flatMap((event) => (event.draft === null ? [] : [event.draft.postId]));
  const posts = await container.posts.findManyByIds(postIds);
  const item = postIds
    .flatMap((id) => posts.find((post) => post.id === id)?.media ?? [])
    .find((media) => media.kind === 'photo' && media.fileName.startsWith('patch-'));
  if (item === undefined) return null;
  const key = (await container.postMedia.findObjectKeys([item.id])).get(item.id);
  const object = key === undefined ? null : await storage.get(key);
  if (object === null) return null;
  const bytes = new Uint8Array(await new Response(object.body).arrayBuffer());
  return bytes.byteLength > 0 && bytes.byteLength <= UPLOAD_MAX_BYTES ? bytes : null;
}

/** Telegram's «Bad Request» text tells which tag it refused; other failures stay a code (a description may echo the path). */
function failureText(error: unknown, signal: AbortSignal): string {
  if (signal.aborted) return 'timeout';
  if (error instanceof GrammyError) {
    return error.description.startsWith('Bad Request')
      ? error.description.slice(0, ERROR_MAX)
      : `telegram_http_${error.error_code}`;
  }
  return 'network_error';
}

export async function sendRichSamples(deps: {
  api: TelegramRichMessageApi;
  /** The samples to send; all without it. */
  only?: readonly RichSampleKey[];
  patchCover: () => Promise<Uint8Array | null>;
  reports: () => Promise<{ daily: string | null; weekly: string | null }>;
  channelChatId: string;
  ownerChatId: string;
  logger: Logger;
  requestId: string;
}): Promise<SendRichSamplesResponse> {
  const chosen = SAMPLES.filter((sample) => deps.only === undefined || deps.only.includes(sample.key));
  const wants = (html: string) => chosen.some((sample) => sample.html === html);
  const cover = chosen.some((sample) => sample.html.includes(COVER_FIGURE))
    ? await deps.patchCover().catch(() => null)
    : null;
  const reports =
    wants(DAILY) || wants(WEEKLY)
      ? await deps.reports().catch(() => ({ daily: null, weekly: null }))
      : { daily: null, weekly: null };
  const results: SendRichSamplesResponse['results'] = [];
  for (const sample of chosen) {
    const html =
      sample.html === DAILY
        ? reports.daily
        : sample.html === WEEKLY
          ? reports.weekly
          : cover === null
            ? sample.html.replace(COVER_FIGURE, '')
            : sample.html;
    if (html === null) {
      for (const target of sample.targets)
        results.push({ sample: sample.title, target, status: 'failed', error: 'На DEV ещё нет такого отчёта' });
      continue;
    }
    const uploads =
      cover !== null && html.includes(`tg://photo?id=${COVER_ID}`)
        ? [{ id: COVER_ID, fileName: 'patch-cover.jpg', bytes: cover }]
        : [];
    for (const target of sample.targets) {
      const chatId = target === 'channel' ? deps.channelChatId : deps.ownerChatId;
      const signal = AbortSignal.timeout(SEND_TIMEOUT_MS);
      try {
        if (sample.classic === true) await deps.api.sendClassicHtml(chatId, html, signal);
        else await deps.api.sendRichMessage(chatId, { html, uploads }, signal);
        results.push({ sample: sample.title, target, status: 'sent', error: null });
      } catch (error) {
        const text = failureText(error, signal);
        deps.logger.warn({
          component: 'rich-samples',
          operation: 'send',
          requestId: deps.requestId,
          status: 502,
          errorCode: error instanceof GrammyError ? `telegram_http_${error.error_code}` : text
        });
        results.push({ sample: sample.title, target, status: 'failed', error: text });
      }
    }
  }
  return { results, pictureTrialQueued: false };
}
