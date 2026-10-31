import { shuffledOrder } from './bank-order';
import { escapeHtml, PICTURE_SIZE, picturePage } from './picture';
import type { RubricContext, RubricSample } from './types';

// «Предмет, которого нет» (33; owner, 30.10.2026): a made-up Dota item as a game tooltip with its own icon (the owner's
// ChatGPT icons, one per item). Every post is one item of the approved bank, in a shuffled order without repeats.

interface FakeItem {
  id: string;
  name: string;
  cost: string;
  stats: readonly string[];
  ability: { type: 'Пассив' | 'Аура' | 'Актив'; title: string; text: string };
  note: string;
  caption: string;
  reactions: readonly [string, string];
}

const ITEMS: readonly FakeItem[] = [
  {
    id: 'anti-pudge',
    name: 'Крюкоотвод',
    cost: '1900',
    stats: ['+250 к здоровью: Пуджу больше жевать'],
    ability: {
      type: 'Пассив',
      title: 'Сам придёт',
      text: 'хук Пуджа наматывается на штырь, и цепь тащит к тебе самого Пуджа. Жирной жопой вперёд.'
    },
    note: 'Хук ты отвёл, молодец. Пудж всё равно прилетел и выебал тебя вблизи.',
    caption: 'Девять хуков мимо, десятый — через три дерева прямо в очко.',
    reactions: ['🤮 — воняет', '🔥 — в патч']
  },
  {
    id: 'anti-techies',
    name: 'Миноискатель',
    cost: '900',
    stats: ['+50% к ходьбе на цыпочках', '−2 пальца, −1 яйцо'],
    ability: {
      type: 'Пассив',
      title: 'Пищит',
      text: 'находит мины Течиса с точностью до сантиметра: пищит, когда ты уже на ней стоишь.'
    },
    note: 'Катушка расплавилась. Яйца нашли у руны, остальное — в реке.',
    caption: 'Пошёл за руной — бахнуло, и я даже не увидел этого ебучего Течиса.',
    reactions: ['😱 — бахнуло', '🤬 — Течиса удалить']
  },
  {
    id: 'anti-pa',
    name: 'Каска рекрута',
    cost: '975',
    stats: ['+6 к броне: Фантомке похуй'],
    ability: {
      type: 'Пассив',
      title: 'Держит удар',
      text: 'блокирует 5 урона от каждого удара Фантомки. От крита на 1400 — тоже 5.'
    },
    note: 'Каска цела наполовину. Голова — нет, мозги на траве.',
    caption: 'Тык, тык, крит на полторы тысячи в ебало — и я смотрю на серый экран.',
    reactions: ['😭 — это я', '🔥 — в патч']
  },
  {
    id: 'anti-riki',
    name: 'Колокольчик',
    cost: '80',
    stats: ['+1 к паранойе'],
    ability: {
      type: 'Пассив',
      title: 'Дзынь',
      text: 'вешается тебе на жопу. Звенит, когда в неё втыкается кинжал Рики.'
    },
    note: 'Теперь ты слышишь, как тебя ебут сзади: дзынь, дзынь, серый экран.',
    caption: 'Восемь смертей — и ни разу не увидел, кто, блять, меня убил.',
    reactions: ['👀 — оглянулся', '🙈 — не вижу']
  },
  {
    id: 'anti-slark',
    name: 'Сушилка',
    cost: '4700',
    stats: ['+30 к урону', '−100% к влажности рыбы'],
    ability: {
      type: 'Аура',
      title: 'Вобла',
      text: 'Сларк рядом с тобой сохнет: ульта не лечит, прыжок не прыгает. Висит и воняет.'
    },
    note: 'Наконец-то от Сларка польза: снял с верёвки, почистил, под пиво.',
    caption: 'Сларк упрыгал с 20 хп, спрятался в ульту и отхилился. В пятый раз, сука, в пятый.',
    reactions: ['🍾 — под пиво', '🔥 — в патч']
  },
  {
    id: 'anti-void',
    name: 'Справка от хроны',
    cost: '1500',
    stats: ['+5 ко всем атрибутам'],
    ability: {
      type: 'Пассив',
      title: 'Не виноват',
      text: 'доказывает, что ты умер в хроне своего же Войда. Репорты летят ему, а не тебе.'
    },
    note: 'Справку тоже заморозило в хроне. Репорты летят тебе в очко.',
    caption: 'Хрона на четверых своих и одного врага. Войд в чат: «где урон, долбоёбы?»',
    reactions: ['🤡 — я Войд', '🤬 — опять хрона']
  },
  {
    id: 'anti-kotl',
    name: 'Антикотл',
    cost: '2400',
    stats: ['+7 к броне', 'Котлу −1 фонарь'],
    ability: {
      type: 'Пассив',
      title: 'Зеркальце',
      text: 'луч Котла отражается от щита обратно. Котл сносит свою же волну и себя заодно.'
    },
    note: 'Котл ослеп от своего же света. Фонарь ему вставили обратно — в жопу.',
    caption: 'Десять минут на линии — ноль крипов: Котл светит, а я сосу.',
    reactions: ['😎 — ослепил', '🔥 — в патч']
  },
  {
    id: 'anti-sniper',
    name: 'Пинок Снайперу',
    cost: '2200',
    stats: ['+10 к уму', '+1000 к дальности пинка'],
    ability: {
      type: 'Актив',
      title: 'Поближе',
      text: 'пинком под жопу швыряет Снайпера из-за третьей вышки в центр драки.'
    },
    note: 'Вмятина на носке — от его жопы. В драке он прожил ровно секунду.',
    caption: 'Нас выебали вчетвером, а дед жив: всю драку стрелял по крипам за вышкой.',
    reactions: ['🖕 — Снайперу', '🔥 — беру']
  },
  {
    id: 'anti-tinker',
    name: 'Тапки Тинкера',
    cost: '2500',
    stats: ['+70 к скорости бега', '−100% к желанию Тинкера жить'],
    ability: {
      type: 'Пассив',
      title: 'Не туда',
      text: 'любой телепорт Тинкера приводит его в ваш фонтан. Прямо в тапках.'
    },
    note: 'Фонтан ебёт его больно. Тинкер реармит и прилетает за добавкой.',
    caption: 'Тинкер в лесу, Тинкер на базе, Тинкер у меня в жопе — и я опять серый.',
    reactions: ['🤓 — я Тинкер', '🔥 — в патч']
  },
  {
    id: 'anti-huskar',
    name: 'Аптечка для Хускара',
    cost: '2250',
    stats: ['+300 к лечению, насильно'],
    ability: {
      type: 'Актив',
      title: 'Полечиться',
      text: 'лечит Хускара до полного здоровья. Без спроса, каждые 5 секунд.'
    },
    note: 'На полном хп Хускар — голый мужик с копьём. Бьёт как крип и плачет.',
    caption: 'Хускар с 50 хп прыгнул на четверых и убил всех. Нахуй так жить.',
    reactions: ['🤯 — гениально', '😈 — я Хускар']
  },
  {
    id: 'anti-meepo',
    name: 'Тапок для Мипо',
    cost: '500',
    stats: ['+45 к скорости бега'],
    ability: {
      type: 'Актив',
      title: 'Прихлопнуть',
      text: 'один шлепок по Мипо бьёт всех пятерых. Как по тараканам на кухне.'
    },
    note: 'Пять вмятин — пять Мипо. Хозяин Мипо ливнул после первого шлепка.',
    caption: 'Пять пиздюков в одинаковых шапках отпиздили меня за секунду.',
    reactions: ['🔥 — беру', '💩 — Мипо нахуй']
  },
  {
    id: 'anti-bristle',
    name: 'Поворотник',
    cost: '3725',
    stats: ['+8 к броне'],
    ability: {
      type: 'Пассив',
      title: 'Лицом ко мне',
      text: 'мигнул поворотником — Бристалбэк разворачивается к тебе лицом. Хочет он или нет.'
    },
    note: 'Спереди он мягкий. Сорок минут ты долбил ежа в самую броню — в жопу.',
    caption: 'Минуту долбил Бристалбэка сзади, снял 30 хп и получил иглы в ебало.',
    reactions: ['💔 — я так и бью', '🔥 — в патч']
  },
  {
    id: 'anti-invoker',
    name: 'Пульт Инвокера',
    cost: '3275',
    stats: ['+15 к уму'],
    ability: {
      type: 'Пассив',
      title: 'Одна кнопка',
      text: 'все заклинания Инвокера на одной кнопке. Что вылетит — не знает даже он.'
    },
    note: 'Нажал — санстрайк себе в очко. Первый раз за игру попал.',
    caption: 'Инвокер две минуты дрочил шарики. Драка кончилась, мы сдохли, он прожал гостволк.',
    reactions: ['🤓 — я Инвокер', '🤣 — попал']
  },
  {
    id: 'anti-zeus',
    name: 'Громоотвод',
    cost: '3725',
    stats: ['+40% к защите от магии'],
    ability: {
      type: 'Пассив',
      title: 'Моё',
      text: 'ульта Зевса бьёт в штырь, а не в твою цель. Кил и золото остаются тебе.'
    },
    note: 'Зевс стоит с молнией в руке, как с хуем. А кила нет.',
    caption: 'Сорок секунд гнал его до фонтана — молния с неба, кил Зевса. Сука.',
    reactions: ['⚡ — моё', '🤬 — опять']
  },
  {
    id: 'anti-furion',
    name: 'Бензопила',
    cost: '100',
    stats: ['+8 к урону по деревьям Фуриона'],
    ability: {
      type: 'Актив',
      title: 'Свобода',
      text: 'спиливает клетку Фуриона за секунду. Опилки летят Фуриону в глаза.'
    },
    note: 'Лучшие 100 золота в жизни. Деревья Фурион пусть себе в жопу сажает.',
    caption: 'Фурион запер меня под их вышкой. Стоял в деревьях, пока меня ебали.',
    reactions: ['🌚 — я Фурион', '🔥 — беру']
  },
  {
    id: 'anti-enigma',
    name: 'Пылесос',
    cost: '900',
    stats: ['+100% к всасыванию'],
    ability: {
      type: 'Пассив',
      title: 'Втянуть',
      text: 'засасывает дыру Энигмы в бак. Пятеро свободны, Энигма крутится один.'
    },
    note: 'Энигма крутится один посреди вашей пятёрки, как хуй на ветру.',
    caption: 'Пять минут ждал идеальную дыру — засосал одного саппорта и крипа.',
    reactions: ['🤣 — дыра', '🔥 — в патч']
  },
  {
    id: 'anti-wisp',
    name: 'Ножницы',
    cost: '4650',
    stats: ['+26 к ловкости'],
    ability: {
      type: 'Актив',
      title: 'Развести',
      text: 'режет связь Виспа с вашим керри, пока они не улетели к пятерым врагам.'
    },
    note: 'Висп улетает в пятерых один. Ему не привыкать: его все бросают.',
    caption: 'Висп притащил нашего керри к пятерым. Выебали обоих, зато вместе.',
    reactions: ['💔 — развели', '🔥 — беру']
  },
  {
    id: 'anti-ogre',
    name: 'Мозг для Огра',
    cost: '5200',
    stats: ['+1 к уму', 'второй голове: +0'],
    ability: {
      type: 'Пассив',
      title: 'Думать',
      text: 'Огр кидает бладласт на керри, а не на себя. Мозг один на две головы.'
    },
    note: 'Головы подрались за банку. Мозг выпал, бладласт опять на себе.',
    caption: 'Огр сорок минут мультикастит бладласт на себя. Керри в ахуе, я тоже.',
    reactions: ['🗿 — я Огр', '🔥 — в патч']
  },
  {
    id: 'anti-brood',
    name: 'Дихлофос',
    cost: '250',
    stats: ['+100% к вони в лесу'],
    ability: { type: 'Актив', title: 'Пшик', text: 'травит всех пауков Бруды в радиусе 900.' },
    note: 'Один выжил и сидит на баллоне. Остальные сорок — у тебя в штанах.',
    caption: 'Восьмая минута: вышки нет, на линии сорок пауков и я. Ебут по очереди.',
    reactions: ['🤮 — пауки', '🔥 — беру']
  },
  {
    id: 'anti-rubick',
    name: 'Сигналка',
    cost: '4800',
    stats: ['+300 к здоровью'],
    ability: {
      type: 'Пассив',
      title: 'Чужое не трожь',
      text: 'когда Рубик крадёт твою ульту, на всю карту воет сирена.'
    },
    note: 'Воет громко. Ульту всё равно спиздили, как магнитолу во дворе.',
    caption: 'Рубик спиздил мою ульту и разъебал ею нас. Мою, сука, ульту.',
    reactions: ['😈 — я Рубик', '🤬 — спиздили']
  },
  {
    id: 'anti-sf',
    name: 'Зонтик от рейзов',
    cost: '1600',
    stats: ['+20% к защите от магии'],
    ability: { type: 'Пассив', title: 'Мимо', text: 'защищает от рейза СФа. Рассчитан на один рейз.' },
    note: 'Рейзов было три. Дырок в зонтике тоже три, а в тебе — одна, но горит.',
    caption: 'Три рейза подряд — и я иду на базу без хп и с горящей жопой.',
    reactions: ['😭 — это я', '🔥 — беру']
  },
  {
    id: 'anti-alchemist',
    name: 'Налоговая',
    cost: '13% золота',
    stats: ['+13% к справедливости'],
    ability: {
      type: 'Пассив',
      title: 'Декларация',
      text: 'Алхимик платит тебе 13% с каждого крипа. Банку конфискуют до полной уплаты.'
    },
    note: 'Алхимик заплатил налог и на сдачу купил Рапиру. Ты на свои 13% — Фласку.',
    caption: 'Пятнадцатая минута: у Алхимика три предмета, у меня Фласка и хуй в кармане.',
    reactions: ['💯 — справедливо', '🔥 — в патч']
  },
  {
    id: 'anti-night-stalker',
    name: 'Ночник',
    cost: '50',
    stats: ['+1 к смелости ночью'],
    ability: {
      type: 'Актив',
      title: 'Включить свет',
      text: 'ночь на всей карте кончается. Сталкер жмёт ульту — а у тебя светло.'
    },
    note: 'Сталкер полетел на свет, как моль. Крыло прилипло к стеклу, жопа обгорела.',
    caption: 'Ночь, десятая минута — из темноты вылетел Сталкер и сожрал меня с говном.',
    reactions: ['😨 — страшно', '🔥 — беру']
  },
  {
    id: 'anti-lifestealer',
    name: 'Слабительное',
    cost: '60',
    stats: ['+200% к перистальтике'],
    ability: { type: 'Пассив', title: 'Выход', text: 'Гуля, залезший в тебя, вылетает через секунду. Через жопу.' },
    note: 'Пробку выбило. Гуля вышел с позором, ты — с облегчением.',
    caption: 'Гуля всю драку сидел у саппорта в жопе. Саппорт сдох — Гуля вылез и убежал.',
    reactions: ['🤮 — фу', '🤣 — через жопу']
  },
  {
    id: 'anti-spirit-breaker',
    name: 'Лежачий полицейский',
    cost: '300',
    stats: ['−100% к разгону'],
    ability: {
      type: 'Пассив',
      title: 'Кочка',
      text: 'Баратрум, бегущий к тебе через всю карту, влетает рогом в кочку.'
    },
    note: 'Рог застрял в кочке. Ты успел уйти на базу и спокойно обосраться.',
    caption: 'Фармлю лес, слышу топот — и у меня уже ноль хп и мокрые штаны.',
    reactions: ['😱 — топот', '🔥 — в патч']
  },
  {
    id: 'anti-legion',
    name: 'Белый флаг',
    cost: '0',
    stats: ['+100% к капитуляции'],
    ability: { type: 'Актив', title: 'Сдаюсь', text: 'машешь флагом посреди дуэли Легионки — и дуэль отменяется.' },
    note: 'Легионка флаги не читает. Древко у тебя в жопе, кровь на флаге — твоя.',
    caption: 'Вызвала на дуэль, убила за две секунды — и урона у неё навсегда больше.',
    reactions: ['🫡 — сдаюсь', '🔥 — в патч']
  },
  {
    id: 'recruit-bkb',
    name: 'БКБ рекрута',
    cost: '4050',
    stats: ['+10 к силе', '+24 к урону'],
    ability: {
      type: 'Актив',
      title: 'Аватар',
      text: 'иммунитет к магии на 9 секунд. Если вспомнишь, что он у тебя есть.'
    },
    note: 'Не нажал ни разу. Мог бы сразу сунуть его себе в жопу — эффект тот же.',
    caption: 'Купил на 30-й и умер под станом с целым БКБ в слоте. Три раза подряд, блять.',
    reactions: ['😭 — это я', '🤡 — ни разу не жал']
  },
  {
    id: 'recruit-diaper',
    name: 'Памперс мидера',
    cost: '175',
    stats: ['+1 к сухости'],
    ability: {
      type: 'Пассив',
      title: 'Сухо',
      text: 'когда тебя дайвят под вышкой, ты не обсираешься. Первые 3 минуты.'
    },
    note: 'Ганк пришёл на 4-й. Памперс полный, руну взял их мид.',
    caption: 'Трое дайвнули меня под вышкой на 4-й. Насрал в памперс, теперь живу в лесу.',
    reactions: ['💩 — не справился', '😭 — это я']
  },
  {
    id: 'recruit-dagger',
    name: 'Даггер с подвохом',
    cost: '2250',
    stats: ['+1 к уверенности'],
    ability: {
      type: 'Актив',
      title: 'Магнит',
      text: 'переносит на 1200 к ближайшему врагу. Всегда. Даже когда убегаешь.'
    },
    note: 'Убегать с ним нельзя. Только сразу подставлять жопу.',
    caption: 'Хотел свалить — блинканул в пятерых. Умер, не успев поздороваться.',
    reactions: ['🤣 — это я', '🔥 — в патч']
  },
  {
    id: 'salve-patience',
    name: 'Фласка терпения',
    cost: '100',
    stats: ['+30 к лечению в секунду'],
    ability: { type: 'Актив', title: 'Терпеть', text: 'лечит, пока по тебе никто не бьёт.' },
    note: 'По тебе бьют всегда. Даже Фласку прострелили насквозь.',
    caption: 'Три Фласки подряд под их керри — триста золота в жопу.',
    reactions: ['😭 — это я', '🔥 — беру']
  },
  {
    id: 'tp-late',
    name: 'ТП на драку',
    cost: '100',
    stats: ['+3 секунды ожидания'],
    ability: { type: 'Актив', title: 'Опоздать', text: 'переносит в драку ровно в ту секунду, когда она закончилась.' },
    note: 'Прилетел к пяти трупам. Четыре ваших, пятый — сейчас будет твой.',
    caption: 'Пока грузился ТП, наших доели. Прилетел на десерт.',
    reactions: ['🫡 — я пришёл', '😢 — опоздал']
  },
  {
    id: 'smoke-trust',
    name: 'Смок доверия',
    cost: '50',
    stats: ['+1 к надежде'],
    ability: {
      type: 'Актив',
      title: 'Пятеро в тумане',
      text: 'прячет вашу пятёрку до первого шага: вы входите ровно в их пятерых.'
    },
    note: 'Скинули смок на ганк — ганкнули сами себя.',
    caption: 'Скинули смок, пошли ебать их пятёрку. Выебали нас — по очереди.',
    reactions: ['🤡 — классика', '🔥 — в патч']
  },
  {
    id: 'midas-support',
    name: 'Мидас пятёрки',
    cost: '2200',
    stats: ['+35 к скорости атаки'],
    ability: { type: 'Актив', title: 'Инвестиция', text: 'окупается на 74-й минуте.' },
    note: 'Игра кончается на 24-й.',
    caption: 'Пятая позиция, девятая минута, Мидас. Вардов ноль, совести ноль, керри в ахуе.',
    reactions: ['🤬 — саппорт', '🔥 — беру']
  },
  {
    id: 'wards-self',
    name: 'Варды на автопилоте',
    cost: '0',
    stats: ['+1 к обзору'],
    ability: {
      type: 'Пассив',
      title: 'Сам дойду',
      text: 'вард сам ползёт на точку и ставится. Саппорту не надо даже уходить с линии.'
    },
    note: 'Вард хотя бы ходит по карте. Ты сорок минут сидишь в лесу на жопе.',
    caption: 'Варды в лавке бесплатные, а карта чёрная, как жопа.',
    reactions: ['👀 — где варды', '🗿 — не моя работа']
  },
  {
    id: 'aegis-recruit',
    name: 'Аегис рекрута',
    cost: 'не продаётся',
    stats: ['+1 жизнь'],
    ability: {
      type: 'Пассив',
      title: 'Второй шанс',
      text: 'воскрешает на месте смерти. Замок откроется, когда сломают трон.'
    },
    note: 'Ключ — у Рошана. Рошана опять забрали они, пока ты фармил лес.',
    caption: 'Рошан наш, Аегис их, игра их. Пиздец.',
    reactions: ['💔 — больно', '🔥 — в патч']
  },
  {
    id: 'rapier-loan',
    name: 'Рапира в кредит',
    cost: '5600',
    stats: ['+300 к урону', '+1 к долгам'],
    ability: {
      type: 'Пассив',
      title: 'Взыскание',
      text: 'даётся без денег. При смерти выпадает, а долг 5600 остаётся на тебе.'
    },
    note: 'Ценник пустой. Цену назовёт их саппорт, когда её подберёт.',
    caption: 'Купил Рапиру, полетел в драку — через 15 секунд ей ебут нас.',
    reactions: ['🤯 — видел такое', '🖕 — коллекторам']
  },
  {
    id: 'mute-all',
    name: 'Тишина',
    cost: '900',
    stats: ['+100% к спокойствию'],
    ability: { type: 'Актив', title: 'Мут', text: 'выключает всем чат, войс и пинги до конца игры. Тебе тоже.' },
    note: 'Вы впервые за месяц выиграли. Молча.',
    caption: 'Сорок минут «?» в чат, «мид ебаный» в войс — и ни одной победы.',
    reactions: ['😇 — тишина', '🙊 — молчу']
  },
  {
    id: 'gg-button',
    name: 'Кнопка «гг»',
    cost: '460',
    stats: ['+0 к пользе'],
    ability: { type: 'Актив', title: 'Сдаться', text: 'пишет «гг» в чат. Больше ничего не происходит.' },
    note: 'Кнопка стёрта до блеска. Дрочишь её чаще, чем играешь.',
    caption: 'Первая смерть — «гг», вторая — «репорт мид», третья — лив.',
    reactions: ['🤡 — знаю такого', '🖕 — гг']
  },
  {
    id: 'lasthit-glasses',
    name: 'Очки рекрута',
    cost: '750',
    stats: ['+1 к добиванию'],
    ability: { type: 'Пассив', title: 'Прицел', text: 'каждый твой удар по крипу — добивание.' },
    note: 'Добиваешь идеально. Их мид тем временем ебёт тебя под вышкой.',
    caption: 'Десятая минута, 23 крипа. Их мид на пятой имел столько же — и меня.',
    reactions: ['😭 — это я', '🔥 — беру']
  },
  {
    id: 'leash-carry',
    name: 'Поводок для керри',
    cost: '2250',
    stats: ['+500 к дальности рывка'],
    ability: {
      type: 'Актив',
      title: 'К ноге',
      text: 'гарпуном вытаскивает вашего керри из леса прямо в драку. За шкирку.'
    },
    note: 'Он перегрыз поводок и убежал добивать лесного крипа. Сука, буквально.',
    caption: 'Нам ломают трон, а керри добивает лесного крипа. Двадцать золота, блять!',
    reactions: ['🤬 — керри', '🔥 — беру']
  }
];

const CSS = `.main{display:block;padding:0}
.title{position:absolute;left:82px;top:60px;margin:0;font-size:40px}.title::after{display:none}
.tip{position:absolute;left:882px;right:72px;top:136px;height:576px;display:flex;flex-direction:column;background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.top{display:flex;gap:28px;align-items:center;padding:20px 32px;background:#0f141b;border-bottom:1px solid var(--line)}
.art{position:absolute;left:82px;top:136px;width:768px;height:576px;border-radius:10px;border:1px solid var(--line);overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.55)}
.icon{width:100%;height:100%;display:block;object-fit:cover}
.wm{position:absolute;right:22px;bottom:16px;font-weight:800;font-size:26px;letter-spacing:8px;color:rgba(255,255,255,.72);text-shadow:0 2px 8px rgba(0,0,0,.85)}
.nameblock{min-width:0;flex:1}
.name{font-weight:800;font-size:56px;line-height:1.1}
.cost{font-weight:800;font-size:30px;color:var(--muted);margin-top:8px;font-variant-numeric:tabular-nums}
.cost i{display:inline-block;width:16px;height:16px;border-radius:50%;background:#c9a24a;margin-right:10px;vertical-align:-1px}
.body{flex:1;min-height:0;padding:22px 40px 24px;display:flex;flex-direction:column;justify-content:center;gap:18px;overflow:hidden}
.stat{font-weight:600;font-size:34px;line-height:1.2;color:#c9d1db}
.abil{border-left:4px solid var(--red);padding:4px 0 4px 20px}
.abil .h{font-weight:800;font-size:28px;color:var(--red)}
.abil .t{font-weight:600;font-size:40px;line-height:1.3;margin-top:4px}
.note{font-weight:600;font-size:32px;color:var(--muted);line-height:1.35}`;

// The name and the body never leave the tooltip: their fonts shrink until they fit.
const FIT = `<script>(()=>{const done=()=>document.documentElement.setAttribute('data-fonts-ready','');
const shrink=(box,parts)=>{let k=1;while(box.scrollHeight>box.clientHeight+1&&k>.5){k-=.04;for(const[n,s]of parts){n.style.fontSize=Math.round(s*k)+'px'}}};
document.fonts.ready.then(()=>{const nm=document.querySelector('.name');let s=56;while(nm.scrollHeight>140&&s>30){s-=2;nm.style.fontSize=s+'px'}
const body=document.querySelector('.body');shrink(body,[...body.querySelectorAll('.stat')].map((n)=>[n,34]).concat([...body.querySelectorAll('.t')].map((n)=>[n,40]),[...body.querySelectorAll('.note')].map((n)=>[n,32])))}).then(done,done);
setTimeout(done,8000);})();</script>`;

const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function fakeItemPage(item: FakeItem, iconBase64: string): string {
  const page = picturePage(
    `<div class="title">Предмет, которого <b>нет</b></div>
<div class="art"><img class="icon" src="data:image/jpeg;base64,${iconBase64}" alt=""><div class="wm">ALEXEEV</div></div>
<div class="tip"><div class="top"><div class="nameblock"><div class="name">${escapeHtml(item.name)}</div><div class="cost"><i></i>${escapeHtml(item.cost)}</div></div></div>
<div class="body">${item.stats.map((stat) => `<div class="stat">${escapeHtml(stat)}</div>`).join('')}
<div class="abil"><div class="h">${item.ability.type}: ${escapeHtml(item.ability.title)}</div><div class="t">${escapeHtml(upperFirst(item.ability.text))}</div></div>
<div class="note">${escapeHtml(item.note)}</div></div></div>`,
    CSS
  );
  // picturePage's own script marks the fonts ready as soon as they load; ours must mark it after the fit.
  return page.replace(/<script>[\s\S]*<\/script><\/body>/u, `${FIT}</body>`);
}

export async function fakeItem(context: RubricContext): Promise<RubricSample> {
  const turn =
    (await context.sources.turns?.next('fake_item', ITEMS.length)) ?? Math.floor(context.random() * ITEMS.length);
  const size = ITEMS.length;
  const item = ITEMS[shuffledOrder(Math.floor(turn / size), size)[turn % size] ?? 0] ?? ITEMS[0];
  if (item === undefined) throw new Error('fake item bank is empty');
  // Loaded on demand: the icons are ~1.2 MB of base64 a cold start should not parse.
  const { FAKE_ITEM_ICONS } = await import('./fake-item-icons.generated');
  const icon = FAKE_ITEM_ICONS[item.id];
  if (icon === undefined) throw new Error(`fake item ${item.id} has no icon`);
  return {
    picture: { html: fakeItemPage(item, icon), ...PICTURE_SIZE },
    text: `${item.caption}\n\n${item.reactions.join('\n')}`,
    ownText: true,
    poll: null
  };
}
