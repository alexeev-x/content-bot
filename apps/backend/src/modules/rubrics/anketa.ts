import { abilityImage, escapeHtml } from './picture';
import { shuffledOrder } from './bank-order';
import { pick, type RubricContext, type RubricSample } from './types';

// «Анкета» (owner, 28.10.2026): a hero's dating profile on the owner's own scene — the arena of love with a «Давай
// поженимся» sign and a board. The image model puts the hero into the scene (the sample asks for it with `heroScene`);
// the browser lays the board over it: the name, a crude distance line, three fields and the hero's ability icons.
// Every anketa: «Ищу», «В постели», then the field funniest for that hero (owner, 28.10.2026).

const RENDERS = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders';
const WIDTH = 1536;
const HEIGHT = 1024;

type Anketa = {
  hero: string;
  name: string;
  distance: string;
  fields: readonly [string, string][];
  abilities: readonly string[];
};

const ANKETAS: readonly Anketa[] = [
  {
    hero: 'pudge',
    name: 'Пудж',
    distance: 'в 12 хуях от вас',
    fields: [
      ['Ищу', 'свежее мясо. Притяну хуком, не отвертишься'],
      ['В постели', 'хуй как хук: длинный, кривой и вечно мимо'],
      ['Красный флаг', 'зову погулять, а через секунду ты у меня дома']
    ],
    abilities: ['pudge_meat_hook', 'pudge_rot', 'pudge_flesh_heap', 'pudge_dismember']
  },
  {
    hero: 'faceless_void',
    name: 'Войд',
    distance: 'в двух пиздюлях от вас',
    fields: [
      ['Ищу', 'ту, что не заметит косяков. Я их откатываю'],
      ['В постели', 'кончаю за пару секунд, а ты не можешь пошевелиться'],
      ['Красный флаг', 'на первом свидании запер всех, своих тоже']
    ],
    abilities: [
      'faceless_void_time_walk',
      'faceless_void_time_dilation',
      'faceless_void_time_lock',
      'faceless_void_chronosphere'
    ]
  },
  {
    hero: 'antimage',
    name: 'Антимаг',
    distance: 'в одном ебучем блинке от вас',
    fields: [
      ['Ищу', 'лес побогаче и тиму потерпеливее'],
      ['В постели', 'член встаёт только к сороковой минуте. Зато как'],
      ['Цель знакомства', 'нафармиться и съебаться']
    ],
    abilities: ['antimage_mana_break', 'antimage_blink', 'antimage_counterspell', 'antimage_mana_void']
  },
  {
    hero: 'invoker',
    name: 'Инвокер',
    distance: 'в десяти ебаных кнопках от вас',
    fields: [
      ['Ищу', 'ту, что запомнит все мои десять кнопок'],
      ['В постели', 'пока прожму десять кнопок, стояк уже пропал'],
      ['Вредные привычки', 'кидаю Санстрайк туда, где тебя уже нет']
    ],
    abilities: ['invoker_quas', 'invoker_wex', 'invoker_exort', 'invoker_invoke']
  },
  {
    hero: 'techies',
    name: 'Течис',
    distance: 'в одном взрыве, нахуй, от вас',
    fields: [
      ['Ищу', 'ту, что наступит в лесу куда не надо'],
      ['В постели', 'кончаю раз за катку, зато разносит всех вокруг'],
      ['Не пишите, если', 'носишь сентри. Зануда ебаная']
    ],
    abilities: ['techies_sticky_bomb', 'techies_reactive_tazer', 'techies_suicide', 'techies_land_mines']
  },
  {
    hero: 'sniper',
    name: 'Снайпер',
    distance: 'в двух экранах, блядь, от вас',
    fields: [
      ['Ищу', 'отношения на расстоянии. На очень большом'],
      ['В постели', 'долго целюсь, кончаю в голову'],
      ['Не пишите, если', 'ты Бара. Нахуй вас, бегущих через всю карту']
    ],
    abilities: ['sniper_shrapnel', 'sniper_headshot', 'sniper_take_aim', 'sniper_assassinate']
  },
  {
    hero: 'snapfire',
    name: 'Бабка',
    distance: 'в одной сраной печеньке от вас',
    fields: [
      ['Ищу', 'внучка. Откормлю печеньем и швырну в замес'],
      ['В постели', 'сажусь сверху, как на Мортимера. Скачу до утра'],
      ['Вредные привычки', 'дробовиком в ебало с порога, по-старчески']
    ],
    abilities: [
      'snapfire_scatterblast',
      'snapfire_firesnap_cookie',
      'snapfire_lil_shredder',
      'snapfire_mortimer_kisses'
    ]
  },
  {
    hero: 'keeper_of_the_light',
    name: 'Котл',
    distance: 'в одной лошади, ёб твою мать, от вас',
    fields: [
      ['Ищу', 'ту, что не ревнует к моей лошади'],
      ['В постели', 'заряжаю три секунды, кончаю через полкарты'],
      ['Красный флаг', 'свечу в ебало и отталкиваю']
    ],
    abilities: [
      'keeper_of_the_light_illuminate',
      'keeper_of_the_light_blinding_light',
      'keeper_of_the_light_chakra_magic',
      'keeper_of_the_light_will_o_wisp'
    ]
  },
  {
    hero: 'earthshaker',
    name: 'Шейкер',
    distance: 'в одном блинке и Эхо, сука, от вас',
    fields: [
      ['Ищу', 'толпу. Один на один у меня не встаёт'],
      ['В постели', 'елда как тотем. Шлёпну — у тебя сотрясение'],
      ['Вредные привычки', 'Фишер поперёк своей же тимы']
    ],
    abilities: ['earthshaker_fissure', 'earthshaker_enchant_totem', 'earthshaker_aftershock', 'earthshaker_echo_slam']
  },
  {
    hero: 'meepo',
    name: 'Мипо',
    distance: 'в куче одинаковых пиздюков от вас',
    fields: [
      ['Ищу', 'ту, что выдержит пятерых. Все пятеро — я'],
      ['В постели', 'пять писюнов, и все одинаково маленькие'],
      ['Красный флаг', 'убьёшь одного из нас — сдохнем все']
    ],
    abilities: ['meepo_earthbind', 'meepo_poof', 'meepo_ransack', 'meepo_divided_we_stand']
  },
  {
    hero: 'lion',
    name: 'Лион',
    distance: 'в одном пальце, ёпта, от вас',
    fields: [
      ['Ищу', 'принцессу. Превращу в лягушку, а не наоборот'],
      ['В постели', 'болт размером с пальчик. Но тоже насмерть'],
      ['Вредные привычки', 'сосу. Ману, а вы что подумали']
    ],
    abilities: ['lion_impale', 'lion_voodoo', 'lion_mana_drain', 'lion_finger_of_death']
  },
  {
    hero: 'crystal_maiden',
    name: 'Цмка',
    distance: 'в двух хуёвых медленных шагах от вас',
    fields: [
      ['Ищу', 'того, кто подарит Блинк. Сама я до тебя не дойду'],
      ['В постели', 'задница ледяная. Сяду сверху — отморозишь яйца'],
      ['Цель знакомства', 'раздать всем ману и сдохнуть первой']
    ],
    abilities: [
      'crystal_maiden_crystal_nova',
      'crystal_maiden_frostbite',
      'crystal_maiden_brilliance_aura',
      'crystal_maiden_freezing_field'
    ]
  },
  {
    hero: 'slark',
    name: 'Сларк',
    distance: 'в одном прыжке, хуяк, от вас',
    fields: [
      ['Ищу', 'ту, что любит, когда её привязывают'],
      ['В постели', 'с каждым разом шланг длиннее. Статы-то твои'],
      ['Вредные привычки', 'любая проблема — Дарк Пакт и в кусты']
    ],
    abilities: ['slark_dark_pact', 'slark_pounce', 'slark_essence_shift', 'slark_shadow_dance']
  },
  {
    hero: 'phantom_assassin',
    name: 'Фантомка',
    distance: 'в одном ебанутом крите от вас',
    fields: [
      ['Ищу', 'того, кто меня найдёт. На карте меня не видно'],
      ['В постели', 'жопой бью редко, но с критом на полторы тыщи'],
      ['Не пишите, если', 'у тебя МКБ. Токсик ебаный']
    ],
    abilities: [
      'phantom_assassin_stifling_dagger',
      'phantom_assassin_phantom_strike',
      'phantom_assassin_blur',
      'phantom_assassin_coup_de_grace'
    ]
  },
  {
    hero: 'juggernaut',
    name: 'Джаггер',
    distance: 'в одном пиздатом омнислеше от вас',
    fields: [
      ['Ищу', 'ту, что не спросит, что у меня под маской'],
      ['В постели', 'Омнислеш членом: тычу быстро, иногда не туда'],
      ['Первое свидание', 'кручусь вокруг тебя, магией не достанешь']
    ],
    abilities: ['juggernaut_blade_fury', 'juggernaut_healing_ward', 'juggernaut_blade_dance', 'juggernaut_omni_slash']
  },
  {
    hero: 'axe',
    name: 'Акс',
    distance: 'в одном крике, ёбаный в рот, от вас',
    fields: [
      ['Ищу', 'ту, что сама на меня полезет. Я только крикну'],
      ['В постели', 'бьёшь меня, а я кручу хуем, как Хеликсом'],
      ['Красный флаг', 'как только тебе хуёво — добиваю топором']
    ],
    abilities: ['axe_berserkers_call', 'axe_battle_hunger', 'axe_counter_helix', 'axe_culling_blade']
  },
  {
    hero: 'lina',
    name: 'Лина',
    distance: 'в одной Лагуне, пиздец, от вас',
    fields: [
      ['Ищу', 'того, кто не сгорит. Предыдущие все сгорели'],
      ['В постели', 'жопа горит в прямом смысле. Тушить будешь хуем'],
      ['Вредные привычки', 'Лагуна в того, у кого 50 хп']
    ],
    abilities: ['lina_dragon_slave', 'lina_light_strike_array', 'lina_fiery_soul', 'lina_laguna_blade']
  },
  {
    hero: 'zuus',
    name: 'Зевс',
    distance: 'в целой карте, похуй, от вас',
    fields: [
      ['Ищу', 'чужие киллы. И чужих баб, через всю карту'],
      ['В постели', 'молния из конца. Достану, где бы ты ни была'],
      ['Не пишите, если', 'ты Рики. Найду и в невидимке']
    ],
    abilities: ['zuus_arc_lightning', 'zuus_lightning_bolt', 'zuus_heavenly_jump', 'zuus_thundergods_wrath']
  },
  {
    hero: 'riki',
    name: 'Рики',
    distance: 'в полуметре за жопой от вас',
    fields: [
      ['Ищу', 'ту, что никогда не оборачивается'],
      ['В постели', 'только сзади. Спереди не умею'],
      ['Не пишите, если', 'носишь Даст. Не люблю, когда палят']
    ],
    abilities: ['riki_smoke_screen', 'riki_blink_strike', 'riki_tricks_of_the_trade', 'riki_backstab']
  },
  {
    hero: 'bounty_hunter',
    name: 'БХ',
    distance: 'в одном треке, сучара, от вас',
    fields: [
      ['Ищу', 'ту, за чью голову хорошо платят'],
      ['В постели', 'шлёпну по жопе, кончу и спизжу золото из кармана'],
      ['Красный флаг', 'вешаю на тебя метку и вижу везде']
    ],
    abilities: ['bounty_hunter_shuriken_toss', 'bounty_hunter_jinada', 'bounty_hunter_wind_walk', 'bounty_hunter_track']
  },
  {
    hero: 'alchemist',
    name: 'Алхимик',
    distance: 'в одной банке с хуйнёй от вас',
    fields: [
      ['Ищу', 'ту, что потерпит огра. Он тоже в отношениях'],
      ['В постели', 'передержу, как банку, — и взорвусь прямо в штаны'],
      ['Цель знакомства', 'бабки. Даже руны мне платят больше']
    ],
    abilities: [
      'alchemist_acid_spray',
      'alchemist_unstable_concoction',
      'alchemist_goblins_greed',
      'alchemist_chemical_rage'
    ]
  },
  {
    hero: 'tinker',
    name: 'Тинкер',
    distance: 'в одной перезарядке, бля, от вас',
    fields: [
      ['Ищу', 'ту, что не тронет мой лес. Иначе роботами нахуй'],
      ['В постели', 'кончил, перезарядился, ещё раз. И ещё'],
      ['Красный флаг', 'сделал дело — и телепортом домой. Даже не обниму']
    ],
    abilities: ['tinker_laser', 'tinker_march_of_the_machines', 'tinker_keen_teleport', 'tinker_rearm']
  },
  {
    hero: 'medusa',
    name: 'Дуза',
    distance: 'в трёх стрелах, мать вашу, от вас',
    fields: [
      ['Ищу', 'того, кто подождёт до шестидесятой минуты'],
      ['В постели', 'глянешь на сиськи — каменеешь. Весь, не только хуй'],
      ['Не пишите, если', 'ты АМ. Сожжёшь мне всю ману, мудак']
    ],
    abilities: ['medusa_split_shot', 'medusa_mystic_snake', 'medusa_mana_shield', 'medusa_stone_gaze']
  },
  {
    hero: 'spectre',
    name: 'Спектра',
    distance: 'в одной ульте, хули, от вас',
    fields: [
      ['Ищу', 'одиночку. Одиноких ебашу вдвое больнее'],
      ['В постели', 'шлёпнешь по булкам — отлетит тебе же в ебало'],
      ['Красный флаг', 'прихожу без приглашения. Везде и сразу']
    ],
    abilities: ['spectre_spectral_dagger', 'spectre_dispersion', 'spectre_desolate', 'spectre_haunt']
  },
  {
    hero: 'skeleton_king',
    name: 'ВК',
    distance: 'в двух жизнях, ёбана, от вас',
    fields: [
      ['Ищу', 'ту, что не против скелетов. Друзья придут тоже'],
      ['В постели', 'дрын упал? Подожди три секунды, воскреснет'],
      ['Вредные привычки', 'каждым ударом сосу из тебя жизнь']
    ],
    abilities: [
      'skeleton_king_hellfire_blast',
      'skeleton_king_bone_guard',
      'skeleton_king_vampiric_spirit',
      'skeleton_king_reincarnation'
    ]
  },
  {
    hero: 'necrolyte',
    name: 'Некр',
    distance: 'в одной косе, хуепутало, от вас',
    fields: [
      ['Ищу', 'того, кто не боится стоять рядом. Аура убивает'],
      ['В постели', 'коса у меня длинная. Чем тебе хуёвее, тем глубже'],
      ['Вредные привычки', 'чуть что — становлюсь призраком и съёбываю']
    ],
    abilities: [
      'necrolyte_death_pulse',
      'necrolyte_ghost_shroud',
      'necrolyte_heartstopper_aura',
      'necrolyte_reapers_scythe'
    ]
  },
  {
    hero: 'nevermore',
    name: 'СФ',
    distance: 'в трёх ебучих койлах от вас',
    fields: [
      ['Ищу', 'душу. Твою. Собираю коллекцию'],
      ['В постели', 'три койла, и все мимо дырки'],
      ['Красный флаг', 'не дали мид — ною всю катку']
    ],
    abilities: ['nevermore_shadowraze1', 'nevermore_necromastery', 'nevermore_dark_lord', 'nevermore_requiem']
  },
  {
    hero: 'legion_commander',
    name: 'Легионка',
    distance: 'в одной дуэли, блядский рот, от вас',
    fields: [
      ['Ищу', 'того, кто выдержит дуэль. Пока ни один не выдержал'],
      ['В постели', 'зажму ляжками, как в дуэли. Не кончишь — не выйдешь'],
      ['Не пишите, если', 'у тебя Блейдмейл. Я всё равно нажму']
    ],
    abilities: [
      'legion_commander_overwhelming_odds',
      'legion_commander_press_the_attack',
      'legion_commander_moment_of_courage',
      'legion_commander_duel'
    ]
  },
  {
    hero: 'windrunner',
    name: 'ВРка',
    distance: 'в одном ветерке, мудила, от вас',
    fields: [
      ['Ищу', 'того, кого можно привязать к дереву. Дальше сама'],
      ['В постели', 'по заднице хуй попадёшь. Уворачиваюсь от всего'],
      ['Вредные привычки', 'долго натягиваю, потом стреляю через весь лес']
    ],
    abilities: ['windrunner_shackleshot', 'windrunner_powershot', 'windrunner_windrun', 'windrunner_focusfire']
  },
  {
    hero: 'drow_ranger',
    name: 'Дровка',
    distance: 'в одной ледяной стреле, сука, от вас',
    fields: [
      ['Ищу', 'того, кто встанет между мной и Сларком'],
      ['В постели', 'сяду на лицо — и ты замолчишь, как от Волны'],
      ['Красный флаг', 'подойдёшь вплотную — я беспомощна']
    ],
    abilities: [
      'drow_ranger_frost_arrows',
      'drow_ranger_wave_of_silence',
      'drow_ranger_multishot',
      'drow_ranger_marksmanship'
    ]
  },
  {
    hero: 'bane',
    name: 'Бейн',
    distance: 'в одном кошмаре от вас',
    fields: [
      ['Ищу', 'ту, что уснёт и не будет пиздеть'],
      ['В постели', 'держу руками, пока не задохнёшься, и не отпускаю'],
      ['Красный флаг', 'снюсь тебе каждую ночь, и это пиздец']
    ],
    abilities: ['bane_enfeeble', 'bane_brain_sap', 'bane_nightmare', 'bane_fiends_grip']
  },
  {
    hero: 'bloodseeker',
    name: 'Сикер',
    distance: 'в одной луже крови от вас',
    fields: [
      ['Ищу', 'ту, что истекает. Чую за километр'],
      ['В постели', 'чем меньше у тебя здоровья, тем быстрее я кончаю'],
      ['Не пишите, если', 'боитесь бегать. Побежите — сдохнете']
    ],
    abilities: ['bloodseeker_bloodrage', 'bloodseeker_blood_bath', 'bloodseeker_thirst', 'bloodseeker_rupture']
  },
  {
    hero: 'mirana',
    name: 'Мирана',
    distance: 'в одной стреле через всю карту от вас',
    fields: [
      ['Ищу', 'того, кто постоит на месте пять секунд'],
      ['В постели', 'прыгаю сверху, а свет выключаю, чтоб ты не видел мою рожу'],
      ['Вредные привычки', 'стреляю через полкарты и мажу']
    ],
    abilities: ['mirana_starfall', 'mirana_arrow', 'mirana_leap', 'mirana_invis']
  },
  {
    hero: 'phantom_lancer',
    name: 'ПЛ',
    distance: 'в толпе одинаковых уёбков от вас',
    fields: [
      ['Ищу', 'ту, что отличит настоящего от копий'],
      ['В постели', 'нас тридцать, и все хотят тебя'],
      ['Красный флаг', 'найдёшь меня — уже поздно']
    ],
    abilities: [
      'phantom_lancer_spirit_lance',
      'phantom_lancer_doppelwalk',
      'phantom_lancer_juxtapose',
      'phantom_lancer_phantom_edge'
    ]
  },
  {
    hero: 'puck',
    name: 'Пак',
    distance: 'в одном светящемся шарике от вас',
    fields: [
      ['Ищу', 'ту, что не устанет за мной гоняться'],
      ['В постели', 'кончаю, телепортируюсь и делаю вид, что меня не было'],
      ['Цель знакомства', 'связать всех и съебаться']
    ],
    abilities: ['puck_illusory_orb', 'puck_waning_rift', 'puck_phase_shift', 'puck_dream_coil']
  },
  {
    hero: 'razor',
    name: 'Разор',
    distance: 'в одной молнии на поводке от вас',
    fields: [
      ['Ищу', 'ту, что не убежит дальше поводка'],
      ['В постели', 'высасываю урон и бью тебя твоим же'],
      ['Красный флаг', 'привязываюсь сразу и намертво']
    ],
    abilities: ['razor_plasma_field', 'razor_static_link', 'razor_storm_surge', 'razor_eye_of_the_storm']
  },
  {
    hero: 'sand_king',
    name: 'СК',
    distance: 'в одном песчаном пиздеце от вас',
    fields: [
      ['Ищу', 'толпу на песке. Одна — не интересно'],
      ['В постели', 'две секунды трясусь, потом всех накрывает'],
      ['Вредные привычки', 'вылезаю из-под земли в самый ебучий момент']
    ],
    abilities: ['sandking_burrowstrike', 'sandking_sand_storm', 'sandking_scorpion_strike', 'sandking_epicenter']
  },
  {
    hero: 'storm_spirit',
    name: 'Шторм',
    distance: 'в одной молнии и без маны от вас',
    fields: [
      ['Ищу', 'ту, у которой много маны. Моя кончается'],
      ['В постели', 'залетаю быстро, кончаю ещё быстрее'],
      ['Не пишите, если', 'у вас Орчид. Иди нахуй']
    ],
    abilities: [
      'storm_spirit_static_remnant',
      'storm_spirit_electric_vortex',
      'storm_spirit_overload',
      'storm_spirit_ball_lightning'
    ]
  },
  {
    hero: 'sven',
    name: 'Свен',
    distance: 'в одном молоте в ебало от вас',
    fields: [
      ['Ищу', 'толпу, чтоб всех одним махом'],
      ['В постели', 'меч огромный, рублю всех, кто стоит за тобой'],
      ['Красный флаг', 'без ГС я ноль']
    ],
    abilities: ['sven_storm_bolt', 'sven_great_cleave', 'sven_warcry', 'sven_gods_strength']
  },
  {
    hero: 'tiny',
    name: 'Тини',
    distance: 'в одном швырке через полкарты от вас',
    fields: [
      ['Ищу', 'ту, что не боится летать'],
      ['В постели', 'беру и швыряю, куда хочу'],
      ['Вредные привычки', 'кидаю тебя прямо к вражеской пятёрке']
    ],
    abilities: ['tiny_avalanche', 'tiny_toss', 'tiny_grow', 'tiny_tree_grab']
  },
  {
    hero: 'vengefulspirit',
    name: 'Венга',
    distance: 'в одном свапе от вас',
    fields: [
      ['Ищу', 'того, кого можно поменять местами с проблемой'],
      ['В постели', 'меняемся местами в самый неожиданный момент'],
      ['Красный флаг', 'мщу даже после смерти']
    ],
    abilities: [
      'vengefulspirit_magic_missile',
      'vengefulspirit_wave_of_terror',
      'vengefulspirit_command_aura',
      'vengefulspirit_nether_swap'
    ]
  },
  {
    hero: 'kunkka',
    name: 'Кунка',
    distance: 'в одном корабле рома от вас',
    fields: [
      ['Ищу', 'ту, что вернётся туда, где я её отметил'],
      ['В постели', 'сначала метка, потом струя, потом корабль'],
      ['Вредные привычки', 'бухаю с первой минуты']
    ],
    abilities: ['kunkka_torrent', 'kunkka_tidebringer', 'kunkka_x_marks_the_spot', 'kunkka_ghostship']
  },
  {
    hero: 'shadow_shaman',
    name: 'Шаман',
    distance: 'в куче змей от вас',
    fields: [
      ['Ищу', 'ту, что постоит связанная, пока змеи работают'],
      ['В постели', 'связываю и не отпускаю, сам ни шагу'],
      ['Не пишите, если', 'боитесь лягушек']
    ],
    abilities: [
      'shadow_shaman_ether_shock',
      'shadow_shaman_voodoo',
      'shadow_shaman_shackles',
      'shadow_shaman_mass_serpent_ward'
    ]
  },
  {
    hero: 'slardar',
    name: 'Селёдка',
    distance: 'в одной луже от вас',
    fields: [
      ['Ищу', 'ту, что не спрячется. Я вижу всё'],
      ['В постели', 'бью, бью, а на четвёртый раз ты в отключке'],
      ['Красный флаг', 'вешаю метку и все знают, где ты']
    ],
    abilities: ['slardar_sprint', 'slardar_slithereen_crush', 'slardar_bash', 'slardar_amplify_damage']
  },
  {
    hero: 'tidehunter',
    name: 'Тайд',
    distance: 'в одном якоре в лоб от вас',
    fields: [
      ['Ищу', 'толпу, чтоб всех разом положить'],
      ['В постели', 'один раз ударю щупальцами — лежат все'],
      ['Вредные привычки', 'жму ульту, когда все уже съебались']
    ],
    abilities: ['tidehunter_gush', 'tidehunter_kraken_shell', 'tidehunter_anchor_smash', 'tidehunter_ravage']
  },
  {
    hero: 'witch_doctor',
    name: 'Доктор',
    distance: 'в одной бочке от вас',
    fields: [
      ['Ищу', 'ту, что постоит на месте, пока я стреляю'],
      ['В постели', 'ставлю вард и стою не двигаясь, иначе всё кончится'],
      ['Красный флаг', 'проклинаю, и чем больнее, тем сильнее']
    ],
    abilities: [
      'witch_doctor_paralyzing_cask',
      'witch_doctor_voodoo_restoration',
      'witch_doctor_maledict',
      'witch_doctor_death_ward'
    ]
  },
  {
    hero: 'lich',
    name: 'Лич',
    distance: 'в одном холодном шаре от вас',
    fields: [
      ['Ищу', 'толпу. Чем больше вас рядом, тем мне веселее'],
      ['В постели', 'шарик прыгает по всем и с каждым разом больнее'],
      ['Не пишите, если', 'вы Антимаг. Отразишь — пиздец моей команде']
    ],
    abilities: ['lich_frost_nova', 'lich_frost_shield', 'lich_sinister_gaze', 'lich_chain_frost']
  },
  {
    hero: 'enigma',
    name: 'Энигма',
    distance: 'в одной чёрной дыре от вас',
    fields: [
      ['Ищу', 'толпу, которая не умеет стоять отдельно'],
      ['В постели', 'затягиваю в дыру, и никто не может пошевелиться'],
      ['Цель знакомства', 'четыре секунды, но запомнишь навсегда']
    ],
    abilities: ['enigma_malefice', 'enigma_demonic_conversion', 'enigma_midnight_pulse', 'enigma_black_hole']
  },
  {
    hero: 'warlock',
    name: 'Варлок',
    distance: 'в одном падающем големе от вас',
    fields: [
      ['Ищу', 'компанию: бью одного — больно всем'],
      ['В постели', 'связываю всех, лечу своих, сверху падает голем'],
      ['Вредные привычки', 'лечу только тех, кто мне нравится']
    ],
    abilities: ['warlock_fatal_bonds', 'warlock_shadow_word', 'warlock_upheaval', 'warlock_rain_of_chaos']
  },
  {
    hero: 'beastmaster',
    name: 'Бистмастер',
    distance: 'в одном кабане от вас',
    fields: [
      ['Ищу', 'ту, что любит зоопарк'],
      ['В постели', 'рычу так, что ты обоссываешься и не можешь пошевелиться'],
      ['Красный флаг', 'всегда прихожу со зверьём']
    ],
    abilities: [
      'beastmaster_wild_axes',
      'beastmaster_summon_razorback',
      'beastmaster_summon_raptor',
      'beastmaster_primal_roar'
    ]
  },
  {
    hero: 'queenofpain',
    name: 'Квопа',
    distance: 'в одном блинке от вас',
    fields: [
      ['Ищу', 'того, кто любит боль'],
      ['В постели', 'ору так, что больно всем рядом'],
      ['Не пишите, если', 'вы Бара. Найдёте везде']
    ],
    abilities: [
      'queenofpain_shadow_strike',
      'queenofpain_blink',
      'queenofpain_scream_of_pain',
      'queenofpain_sonic_wave'
    ]
  },
  {
    hero: 'venomancer',
    name: 'Веник',
    distance: 'в одной ядовитой плевке от вас',
    fields: [
      ['Ищу', 'ту, что выдержит мою заразу'],
      ['В постели', 'заражаю тебя, а потом всех твоих подруг'],
      ['Вредные привычки', 'расставляю варды по всему дому']
    ],
    abilities: [
      'venomancer_venomous_gale',
      'venomancer_snakebite',
      'venomancer_plague_ward',
      'venomancer_noxious_plague'
    ]
  },
  {
    hero: 'death_prophet',
    name: 'ДП',
    distance: 'в куче духов от вас',
    fields: [
      ['Ищу', 'того, кто не боится, что я вернусь'],
      ['В постели', 'выпускаю духов, и они вылизывают всех вокруг'],
      ['Красный флаг', 'молчание в ответ на любые вопросы']
    ],
    abilities: [
      'death_prophet_carrion_swarm',
      'death_prophet_silence',
      'death_prophet_spirit_siphon',
      'death_prophet_exorcism'
    ]
  },
  {
    hero: 'pugna',
    name: 'Пугна',
    distance: 'в одном дрейне от вас',
    fields: [
      ['Ищу', 'ту, у которой много здоровья'],
      ['В постели', 'присасываюсь и не отпускаю, пока не высосу'],
      ['Не пишите, если', 'у вас стан. Обломаете весь процесс']
    ],
    abilities: ['pugna_nether_blast', 'pugna_decrepify', 'pugna_nether_ward', 'pugna_life_drain']
  },
  {
    hero: 'templar_assassin',
    name: 'Темпларка',
    distance: 'в одном ударе из невидимости от вас',
    fields: [
      ['Ищу', 'ту, что не заметит, как я подошла'],
      ['В постели', 'прячусь, жду и кончаю тебе прямо в броню'],
      ['Красный флаг', 'ставлю ловушки по всей квартире']
    ],
    abilities: [
      'templar_assassin_refraction',
      'templar_assassin_meld',
      'templar_assassin_psi_blades',
      'templar_assassin_psionic_trap'
    ]
  },
  {
    hero: 'viper',
    name: 'Вайпер',
    distance: 'в одной луже яда от вас',
    fields: [
      ['Ищу', 'ту, что не убежит. С ядом и не убежишь'],
      ['В постели', 'плююсь, и ты становишься медленнее'],
      ['Вредные привычки', 'на линии ебу всех, после сорока — никого']
    ],
    abilities: ['viper_poison_attack', 'viper_nethertoxin', 'viper_corrosive_skin', 'viper_viper_strike']
  },
  {
    hero: 'luna',
    name: 'Луна',
    distance: 'в одном лунном луче от вас',
    fields: [
      ['Ищу', 'компанию. Мои атаки отскакивают на всех'],
      ['В постели', 'ночью сверху падают лучи — кончаю на всех, кто рядом'],
      ['Не пишите, если', 'вы стоите вокруг крипов. Лучи кончатся зря']
    ],
    abilities: ['luna_lucent_beam', 'luna_lunar_orbit', 'luna_moon_glaive', 'luna_eclipse']
  },
  {
    hero: 'dragon_knight',
    name: 'ДК',
    distance: 'в одном драконьем выхлопе от вас',
    fields: [
      ['Ищу', 'ту, что не боится огня и жара'],
      ['В постели', 'превращаюсь в дракона, и от меня горит всё, даже простыня'],
      ['Красный флаг', 'ломаю вышки на первом свидании']
    ],
    abilities: [
      'dragon_knight_breathe_fire',
      'dragon_knight_dragon_tail',
      'dragon_knight_wyrms_wrath',
      'dragon_knight_elder_dragon_form'
    ]
  },
  {
    hero: 'dazzle',
    name: 'Даззл',
    distance: 'в одном кресте от вас',
    fields: [
      ['Ищу', 'того, кого надо спасать. Ставлю крест — не сдохнешь'],
      ['В постели', 'лечу волной, а потом трахаю всех, кто рядом стоял'],
      ['Вредные привычки', 'ставлю крест слишком рано, и всё']
    ],
    abilities: ['dazzle_poison_touch', 'dazzle_shallow_grave', 'dazzle_shadow_wave', 'dazzle_nothl_projection']
  },
  {
    hero: 'rattletrap',
    name: 'Клок',
    distance: 'в одном хукшоте от вас',
    fields: [
      ['Ищу', 'ту, что посидит со мной в клетке из шестерёнок'],
      ['В постели', 'прилетаю на крюке и запираю — не выйдешь, пока не кончу'],
      ['Не пишите, если', 'вы ненавидите шум']
    ],
    abilities: ['rattletrap_battery_assault', 'rattletrap_power_cogs', 'rattletrap_rocket_flare', 'rattletrap_hookshot']
  },
  {
    hero: 'leshrac',
    name: 'Леший',
    distance: 'в одной молнии от вас',
    fields: [
      ['Ищу', 'толпу, по которой можно жарить молниями'],
      ['В постели', 'бегаю кругом и долблю всех без перерыва, как отбойный молоток'],
      ['Красный флаг', 'жру ману как не в себя']
    ],
    abilities: ['leshrac_split_earth', 'leshrac_diabolic_edict', 'leshrac_lightning_storm', 'leshrac_pulse_nova']
  },
  {
    hero: 'furion',
    name: 'Фурион',
    distance: 'в одном телепорте куда угодно от вас',
    fields: [
      ['Ищу', 'ту, что не устанет от того, что я везде'],
      ['В постели', 'запираю в деревьях и ухожу пушить'],
      ['Вредные привычки', 'ломаю твою базу, пока ты на свидании']
    ],
    abilities: ['furion_sprout', 'furion_teleportation', 'furion_force_of_nature', 'furion_wrath_of_nature']
  },
  {
    hero: 'life_stealer',
    name: 'Гуля',
    distance: 'внутри твоего тиммейта от вас',
    fields: [
      ['Ищу', 'ту, у которой много здоровья. Жру проценты'],
      ['В постели', 'залезаю внутрь и сижу, пока не вылезу в нужный момент'],
      ['Красный флаг', 'на мне не работает магия, когда я злой']
    ],
    abilities: ['life_stealer_rage', 'life_stealer_open_wounds', 'life_stealer_feast', 'life_stealer_infest']
  },
  {
    hero: 'clinkz',
    name: 'Клинз',
    distance: 'в одной горящей стреле от вас',
    fields: [
      ['Ищу', 'ту, что не заметит скелета в углу'],
      ['В постели', 'невидимо подкрадываюсь и стреляю огнём'],
      ['Не пишите, если', 'у вас сентри. Испортите всё']
    ],
    abilities: ['clinkz_strafe', 'clinkz_searing_arrows', 'clinkz_death_pact', 'clinkz_wind_walk']
  },
  {
    hero: 'omniknight',
    name: 'Омник',
    distance: 'в одном ангеле-хранителе от вас',
    fields: [
      ['Ищу', 'ту, что дерётся рядом со мной'],
      ['В постели', 'лечу тебя и бью всех вокруг тем же'],
      ['Цель знакомства', 'пять секунд вас нельзя ударить с руки']
    ],
    abilities: [
      'omniknight_purification',
      'omniknight_martyr',
      'omniknight_hammer_of_purity',
      'omniknight_guardian_angel'
    ]
  },
  {
    hero: 'enchantress',
    name: 'Энча',
    distance: 'в одном копье через всю карту от вас',
    fields: [
      ['Ищу', 'крипов в подруги. Всех себе заберу'],
      ['В постели', 'чем дальше ты стоишь, тем больнее моё копьё'],
      ['Красный флаг', 'забираю чужих крипов и называю своими']
    ],
    abilities: [
      'enchantress_impetus',
      'enchantress_enchant',
      'enchantress_untouchable',
      'enchantress_natures_attendants'
    ]
  },
  {
    hero: 'huskar',
    name: 'Хускар',
    distance: 'в одной горящей копейке от вас',
    fields: [
      ['Ищу', 'ту, которая не испугается, что я почти мёртв'],
      ['В постели', 'чем меньше у меня хп, тем быстрее я долблю'],
      ['Вредные привычки', 'сжигаю своё здоровье, лишь бы бить']
    ],
    abilities: ['huskar_inner_fire', 'huskar_burning_spear', 'huskar_berserkers_blood', 'huskar_life_break']
  },
  {
    hero: 'night_stalker',
    name: 'Сталкер',
    distance: 'в одной ночи от вас',
    fields: [
      ['Ищу', 'ту, что не спит ночью'],
      ['В постели', 'ночью я быстрее, злее и вижу всё'],
      ['Не пишите, если', 'днём. Днём у меня не стоит']
    ],
    abilities: [
      'night_stalker_void',
      'night_stalker_crippling_fear',
      'night_stalker_midnight_feast',
      'night_stalker_darkness'
    ]
  },
  {
    hero: 'broodmother',
    name: 'Бруда',
    distance: 'в одной паутине от вас',
    fields: [
      ['Ищу', 'того, кто заблудится в моём лесу'],
      ['В постели', 'налипаешь в паутине, а вокруг сотня моих детей'],
      ['Красный флаг', 'тебя ебут паучки, пока я пушу']
    ],
    abilities: [
      'broodmother_insatiable_hunger',
      'broodmother_spin_web',
      'broodmother_incapacitating_bite',
      'broodmother_spawn_spiderlings'
    ]
  },
  {
    hero: 'weaver',
    name: 'Вивер',
    distance: 'в одном рое жуков от вас',
    fields: [
      ['Ищу', 'ту, что не заметит, как я исчез'],
      ['В постели', 'бью дважды, а если обосрался — откатываюсь назад'],
      ['Вредные привычки', 'удаляю последние пять секунд позора']
    ],
    abilities: ['weaver_the_swarm', 'weaver_shukuchi', 'weaver_geminate_attack', 'weaver_time_lapse']
  },
  {
    hero: 'jakiro',
    name: 'Джакиро',
    distance: 'в двух головах от вас',
    fields: [
      ['Ищу', 'двоих. Голов у меня тоже две'],
      ['В постели', 'одна голова морозит, другая жжёт'],
      ['Цель знакомства', 'заморозить и поджечь одновременно']
    ],
    abilities: ['jakiro_dual_breath', 'jakiro_ice_path', 'jakiro_liquid_fire', 'jakiro_macropyre']
  },
  {
    hero: 'batrider',
    name: 'Бэтрайдер',
    distance: 'в одном лассо от вас',
    fields: [
      ['Ищу', 'ту, что не против, когда её тащат'],
      ['В постели', 'обливаю маслом, ловлю и тащу к своим'],
      ['Красный флаг', 'увожу на первом свидании прямо к друзьям']
    ],
    abilities: ['batrider_sticky_napalm', 'batrider_flamebreak', 'batrider_firefly', 'batrider_flaming_lasso']
  },
  {
    hero: 'ancient_apparition',
    name: 'Аппарат',
    distance: 'в одном ледяном снаряде через всю карту от вас',
    fields: [
      ['Ищу', 'ту, что не лечится'],
      ['В постели', 'пока я рядом, ты не сможешь отхилиться'],
      ['Не пишите, если', 'вы Гуля. Сожру твой отхил']
    ],
    abilities: [
      'ancient_apparition_cold_feet',
      'ancient_apparition_ice_vortex',
      'ancient_apparition_chilling_touch',
      'ancient_apparition_ice_blast'
    ]
  },
  {
    hero: 'doom_bringer',
    name: 'Дум',
    distance: 'в одном ебучем проклятии от вас',
    fields: [
      ['Ищу', 'ту, что заткнётся надолго'],
      ['В постели', 'жру крипов целиком, а тебе затыкаю рот'],
      ['Красный флаг', 'проклинаю, и ты не можешь ничего']
    ],
    abilities: [
      'doom_bringer_devour',
      'doom_bringer_scorched_earth',
      'doom_bringer_infernal_blade',
      'doom_bringer_doom'
    ]
  },
  {
    hero: 'ursa',
    name: 'Урса',
    distance: 'в одном прыжке от вас',
    fields: [
      ['Ищу', 'ту, что не убегает. Я бью одну и ту же'],
      ['В постели', 'каждый удар больнее предыдущего, и ты сама просишь ещё'],
      ['Вредные привычки', 'ем Рошана на восьмой минуте']
    ],
    abilities: ['ursa_earthshock', 'ursa_overpower', 'ursa_fury_swipes', 'ursa_enrage']
  },
  {
    hero: 'spirit_breaker',
    name: 'Баратрум',
    distance: 'через всю карту от вас',
    fields: [
      ['Ищу', 'ту, что стоит одна и не ждёт меня'],
      ['В постели', 'разгоняюсь через всю карту и врезаюсь без предупреждения'],
      ['Красный флаг', 'прихожу без звонка']
    ],
    abilities: [
      'spirit_breaker_charge_of_darkness',
      'spirit_breaker_bulldoze',
      'spirit_breaker_greater_bash',
      'spirit_breaker_nether_strike'
    ]
  },
  {
    hero: 'gyrocopter',
    name: 'Гирокоптер',
    distance: 'в одной ракете от вас',
    fields: [
      ['Ищу', 'толпу, по которой стреляет вертолёт'],
      ['В постели', 'стреляю очередями по всем вокруг, никто не уйдёт сухим'],
      ['Не пишите, если', 'вы стоите кучей. Я люблю кучи']
    ],
    abilities: [
      'gyrocopter_rocket_barrage',
      'gyrocopter_homing_missile',
      'gyrocopter_flak_cannon',
      'gyrocopter_call_down'
    ]
  },
  {
    hero: 'silencer',
    name: 'Сайленсер',
    distance: 'в одной тишине на всю карту от вас',
    fields: [
      ['Ищу', 'ту, что умеет молчать'],
      ['В постели', 'затыкаю всех на шесть секунд, а потом ебу по мозгам'],
      ['Цель знакомства', 'наконец тишина']
    ],
    abilities: [
      'silencer_curse_of_the_silent',
      'silencer_glaives_of_wisdom',
      'silencer_last_word',
      'silencer_global_silence'
    ]
  },
  {
    hero: 'obsidian_destroyer',
    name: 'ОД',
    distance: 'в одном астрале от вас',
    fields: [
      ['Ищу', 'ту, у которой мало маны'],
      ['В постели', 'прячу тебя в астрал, а потом вытаскиваю, когда захочу'],
      ['Красный флаг', 'чем ты тупее меня, тем больнее, сука']
    ],
    abilities: [
      'obsidian_destroyer_arcane_orb',
      'obsidian_destroyer_astral_imprisonment',
      'obsidian_destroyer_objurgation',
      'obsidian_destroyer_sanity_eclipse'
    ]
  },
  {
    hero: 'chaos_knight',
    name: 'ЦК',
    distance: 'на одном коне и трёх копиях от вас',
    fields: [
      ['Ищу', 'ту, что выдержит четверых сразу'],
      ['В постели', 'то как сосиска, то так, что ты летишь в стену'],
      ['Вредные привычки', 'не знаю, сколько урона сделаю — сам в шоке']
    ],
    abilities: [
      'chaos_knight_chaos_bolt',
      'chaos_knight_reality_rift',
      'chaos_knight_chaos_strike',
      'chaos_knight_phantasm'
    ]
  },
  {
    hero: 'treant',
    name: 'Трент',
    distance: 'в одном корне от вас',
    fields: [
      ['Ищу', 'ту, что будет стоять на месте долго'],
      ['В постели', 'связываю корнями, и у всех встаёт'],
      ['Не пишите, если', 'у вас лесоруб. Нахуй Тимбера']
    ],
    abilities: ['treant_natures_grasp', 'treant_leech_seed', 'treant_living_armor', 'treant_overgrowth']
  },
  {
    hero: 'ogre_magi',
    name: 'Огр',
    distance: 'в двух головах и ни одном мозге от вас',
    fields: [
      ['Ищу', 'ту, что не умнее меня'],
      ['В постели', 'бью раз, а может, четыре — как повезёт'],
      ['Красный флаг', 'не думаю, просто жму']
    ],
    abilities: ['ogre_magi_fireblast', 'ogre_magi_ignite', 'ogre_magi_multicast', 'ogre_magi_bloodlust']
  },
  {
    hero: 'undying',
    name: 'Зомби',
    distance: 'в одном надгробии от вас',
    fields: [
      ['Ищу', 'толпу. Ворую силу у всех'],
      ['В постели', 'ставлю надгробие, и вокруг лезут голодные зомби, ебать'],
      ['Вредные привычки', 'превращаюсь в огромную гниль']
    ],
    abilities: ['undying_decay', 'undying_soul_rip', 'undying_tombstone', 'undying_flesh_golem']
  },
  {
    hero: 'rubick',
    name: 'Рубик',
    distance: 'в одной спизженной ульте от вас',
    fields: [
      ['Ищу', 'ту, у которой есть что украсть'],
      ['В постели', 'ворую твою ульту и делаю ей тебе'],
      ['Красный флаг', 'спизжу всё, что у тебя лучшее']
    ],
    abilities: ['rubick_telekinesis', 'rubick_fade_bolt', 'rubick_arcane_supremacy', 'rubick_spell_steal']
  },
  {
    hero: 'disruptor',
    name: 'Дизраптор',
    distance: 'в одном кольце от вас',
    fields: [
      ['Ищу', 'ту, что вернётся туда, где была четыре секунды назад'],
      ['В постели', 'запираю в кольце и бью током по яйцам'],
      ['Не пишите, если', 'любите свободу. Из кольца не выйдешь']
    ],
    abilities: ['disruptor_thunder_strike', 'disruptor_glimpse', 'disruptor_kinetic_field', 'disruptor_static_storm']
  },
  {
    hero: 'nyx_assassin',
    name: 'Никс',
    distance: 'в одном панцире от вас',
    fields: [
      ['Ищу', 'ту, что не будет бить первой'],
      ['В постели', 'ударишь меня — сама в стане'],
      ['Красный флаг', 'подкрадываюсь невидимым и ебашу в спину']
    ],
    abilities: ['nyx_assassin_impale', 'nyx_assassin_jolt', 'nyx_assassin_spiked_carapace', 'nyx_assassin_vendetta']
  },
  {
    hero: 'naga_siren',
    name: 'Нага',
    distance: 'в одной песне от вас',
    fields: [
      ['Ищу', 'ту, что заснёт под мою песню'],
      ['В постели', 'пою, все засыпают, а мои копии лезут к тебе в штаны'],
      ['Цель знакомства', 'усыпить всех и сбежать']
    ],
    abilities: ['naga_siren_mirror_image', 'naga_siren_ensnare', 'naga_siren_rip_tide', 'naga_siren_song_of_the_siren']
  },
  {
    hero: 'centaur',
    name: 'Кентавр',
    distance: 'в одном разгоне от вас',
    fields: [
      ['Ищу', 'всю команду, чтобы бежать вместе'],
      ['В постели', 'топчу так, что все лежат и просят ещё'],
      ['Вредные привычки', 'бью себя, лишь бы ударить тебя']
    ],
    abilities: ['centaur_hoof_stomp', 'centaur_double_edge', 'centaur_return', 'centaur_stampede']
  },
  {
    hero: 'magnataur',
    name: 'Магнус',
    distance: 'в одной ульте, что стянет всех к центру, от вас',
    fields: [
      ['Ищу', 'толпу, чтоб стянуть всех в одну кучу'],
      ['В постели', 'стягиваю всех в кучу — дальше групповуха'],
      ['Красный флаг', 'тащу тебя к своим на рогах']
    ],
    abilities: ['magnataur_shockwave', 'magnataur_empower', 'magnataur_skewer', 'magnataur_reverse_polarity']
  },
  {
    hero: 'shredder',
    name: 'Тимбер',
    distance: 'в одной пиле от вас',
    fields: [
      ['Ищу', 'ту, что любит деревья. Я их ненавижу'],
      ['В постели', 'цепью на дерево и кручусь вокруг тебя'],
      ['Не пишите, если', 'вы Трент. Распилю']
    ],
    abilities: ['shredder_whirling_death', 'shredder_timber_chain', 'shredder_reactive_armor', 'shredder_chakram']
  },
  {
    hero: 'bristleback',
    name: 'Бристалбэк',
    distance: 'в одной сопле от вас',
    fields: [
      ['Ищу', 'ту, что любит бить сзади. Мне не больно'],
      ['В постели', 'стою жопой, а в ответ лечу иглами'],
      ['Красный флаг', 'сморкаюсь в лицо на первом свидании']
    ],
    abilities: [
      'bristleback_viscous_nasal_goo',
      'bristleback_bristleback',
      'bristleback_warpath',
      'bristleback_quill_spray'
    ]
  },
  {
    hero: 'tusk',
    name: 'Таск',
    distance: 'в одном снежке от вас',
    fields: [
      ['Ищу', 'компанию, чтобы скатиться в снежке вместе'],
      ['В постели', 'закатываю в снежок, а потом пунч — и ты на орбите'],
      ['Вредные привычки', 'ору «ПУНЧ!» на каждом ударе']
    ],
    abilities: ['tusk_ice_shards', 'tusk_snowball', 'tusk_tag_team', 'tusk_walrus_punch']
  },
  {
    hero: 'skywrath_mage',
    name: 'Скаймаг',
    distance: 'в одной вспышке от вас',
    fields: [
      ['Ищу', 'ту, что не умеет бегать'],
      ['В постели', 'пока ты в печати, тебе пиздец от моей магии'],
      ['Не пишите, если', 'вы в БКБ. Пиздец мне']
    ],
    abilities: [
      'skywrath_mage_arcane_bolt',
      'skywrath_mage_concussive_shot',
      'skywrath_mage_ancient_seal',
      'skywrath_mage_mystic_flare'
    ]
  },
  {
    hero: 'abaddon',
    name: 'Абадон',
    distance: 'в одном щите от вас',
    fields: [
      ['Ищу', 'ту, что меня бьёт. Мне это только в радость'],
      ['В постели', 'чем больше ты бьёшь, тем мне лучше'],
      ['Красный флаг', 'нажимаю ульту, и ты меня лечишь']
    ],
    abilities: ['abaddon_death_coil', 'abaddon_aphotic_shield', 'abaddon_frostmourne', 'abaddon_borrowed_time']
  },
  {
    hero: 'abyssal_underlord',
    name: 'Андерлорд',
    distance: 'в одном портале от вас',
    fields: [
      ['Ищу', 'ту, что прыгнет со мной через весь мир'],
      ['В постели', 'сажаю в яму и жгу жопу огнём'],
      ['Цель знакомства', 'привести всю команду через портал']
    ],
    abilities: [
      'abyssal_underlord_firestorm',
      'abyssal_underlord_pit_of_malice',
      'abyssal_underlord_atrophy_aura',
      'abyssal_underlord_dark_portal'
    ]
  },
  {
    hero: 'terrorblade',
    name: 'ТБ',
    distance: 'в одной смене здоровья от вас',
    fields: [
      ['Ищу', 'ту, у которой здоровья больше'],
      ['В постели', 'обмениваюсь с тобой здоровьем, и ты на трёх хп'],
      ['Красный флаг', 'у меня куча своих копий']
    ],
    abilities: [
      'terrorblade_reflection',
      'terrorblade_conjure_image',
      'terrorblade_metamorphosis',
      'terrorblade_sunder'
    ]
  },
  {
    hero: 'phoenix',
    name: 'Феникс',
    distance: 'в одном яйце от вас',
    fields: [
      ['Ищу', 'ту, что посидит рядом с яйцом'],
      ['В постели', 'превращаюсь в солнце, и у всех горит жопа'],
      ['Не пишите, если', 'вы сломаете яйцо. Я обижусь навсегда']
    ],
    abilities: ['phoenix_icarus_dive', 'phoenix_fire_spirits', 'phoenix_sun_ray', 'phoenix_supernova']
  },
  {
    hero: 'winter_wyvern',
    name: 'Виверна',
    distance: 'в одном проклятии от вас',
    fields: [
      ['Ищу', 'ту, что будет драться за меня'],
      ['В постели', 'проклинаю тебя, и твои же друзья тебя ебут'],
      ['Вредные привычки', 'заставляю своих же бить друг друга']
    ],
    abilities: [
      'winter_wyvern_arctic_burn',
      'winter_wyvern_splinter_blast',
      'winter_wyvern_cold_embrace',
      'winter_wyvern_winters_curse'
    ]
  },
  {
    hero: 'monkey_king',
    name: 'Обезьяна',
    distance: 'на одной верхушке дерева от вас',
    fields: [
      ['Ищу', 'ту, что не узнает меня в виде дерева'],
      ['В постели', 'прыгаю с дерева и долблю посохом до утра'],
      ['Красный флаг', 'прячусь кустом на первом свидании']
    ],
    abilities: [
      'monkey_king_boundless_strike',
      'monkey_king_tree_dance',
      'monkey_king_primal_spring',
      'monkey_king_wukongs_command'
    ]
  },
  {
    hero: 'dark_willow',
    name: 'Вилка',
    distance: 'в одном лабиринте от вас',
    fields: [
      ['Ищу', 'ту, что заблудится в моих кустах'],
      ['В постели', 'прячусь в тени и пугаю так, что ты обосрёшься'],
      ['Не пишите, если', 'боитесь темноты']
    ],
    abilities: [
      'dark_willow_bramble_maze',
      'dark_willow_shadow_realm',
      'dark_willow_cursed_crown',
      'dark_willow_terrorize'
    ]
  },
  {
    hero: 'morphling',
    name: 'Морф',
    distance: 'в одной волне от вас',
    fields: [
      ['Ищу', 'ту, которой похуй, кем я сегодня буду'],
      ['В постели', 'превращаюсь в тебя и трахаю сам себя'],
      ['Красный флаг', 'сегодня я ты, завтра твой бывший']
    ],
    abilities: ['morphling_waveform', 'morphling_adaptive_strike_agi', 'morphling_morph_agi', 'morphling_replicate']
  },
  {
    hero: 'dark_seer',
    name: 'Дарк сир',
    distance: 'в одной стене от вас',
    fields: [
      ['Ищу', 'толпу, чтобы засосать всех в кучу'],
      ['В постели', 'засасываю всех в одну точку, дальше по кругу'],
      ['Вредные привычки', 'вешаю на тебя щит, и ты бьёшь током всех вокруг']
    ],
    abilities: ['dark_seer_vacuum', 'dark_seer_ion_shell', 'dark_seer_surge', 'dark_seer_wall_of_replica']
  },
  {
    hero: 'chen',
    name: 'Чен',
    distance: 'в одной армии крипов от вас',
    fields: [
      ['Ищу', 'ту, что пойдёт за мной, как мои крипы'],
      ['В постели', 'обращаю в свою веру, и все делают, что скажу, даже в постели'],
      ['Цель знакомства', 'лечить всю команду через всю карту']
    ],
    abilities: ['chen_penitence', 'chen_holy_persuasion', 'chen_divine_favor', 'chen_hand_of_god']
  },
  {
    hero: 'lycan',
    name: 'Люкан',
    distance: 'в одной волчьей стае от вас',
    fields: [
      ['Ищу', 'ту, что любит, когда воют ночью'],
      ['В постели', 'превращаюсь в волка и ебу без остановки'],
      ['Красный флаг', 'вою по ночам под твоими окнами']
    ],
    abilities: ['lycan_summon_wolves', 'lycan_howl', 'lycan_feral_impulse', 'lycan_shapeshift']
  },
  {
    hero: 'brewmaster',
    name: 'Брюмастер',
    distance: 'в одной бочке пива от вас',
    fields: [
      ['Ищу', 'собутыльницу. Пить буду я, а ты смотри'],
      ['В постели', 'делюсь на троих, и все трое пьяные'],
      ['Вредные привычки', 'бухаю, пока не развалюсь на три панды']
    ],
    abilities: [
      'brewmaster_thunder_clap',
      'brewmaster_cinder_brew',
      'brewmaster_drunken_brawler',
      'brewmaster_primal_split'
    ]
  },
  {
    hero: 'shadow_demon',
    name: 'Шадоу демон',
    distance: 'в одном изгнании от вас',
    fields: [
      ['Ищу', 'ту, которую можно спрятать от всех'],
      ['В постели', 'прячу тебя ото всех, а потом ебашу ядом'],
      ['Не пишите, если', 'хотите, чтобы вас спасли. Я не спасаю']
    ],
    abilities: [
      'shadow_demon_disruption',
      'shadow_demon_disseminate',
      'shadow_demon_shadow_poison',
      'shadow_demon_demonic_purge'
    ]
  },
  {
    hero: 'lone_druid',
    name: 'Друид',
    distance: 'в одном медведе от вас',
    fields: [
      ['Ищу', 'ту, что полюбит моего медведя'],
      ['В постели', 'медведь делает всю работу, а я смотрю'],
      ['Красный флаг', 'медведь живёт с нами']
    ],
    abilities: ['lone_druid_entangle', 'lone_druid_spirit_link', 'lone_druid_savage_roar', 'lone_druid_true_form']
  },
  {
    hero: 'wisp',
    name: 'Висп',
    distance: 'в одной привязке от вас',
    fields: [
      ['Ищу', 'того, к кому можно привязаться и не отпускать'],
      ['В постели', 'привязываюсь и накачиваю тебя так, что ты светишься'],
      ['Цель знакомства', 'телепортировать тебя куда угодно, но потом верну']
    ],
    abilities: ['wisp_tether', 'wisp_spirits', 'wisp_overcharge', 'wisp_relocate']
  },
  {
    hero: 'visage',
    name: 'Визаж',
    distance: 'в двух птичках от вас',
    fields: [
      ['Ищу', 'ту, что не боится горгулий'],
      ['В постели', 'прилетаю с птицами, и все в стане'],
      ['Красный флаг', 'ворую у тебя скорость, пока ты стоишь рядом']
    ],
    abilities: ['visage_grave_chill', 'visage_soul_assumption', 'visage_gravekeepers_cloak', 'visage_summon_familiars']
  },
  {
    hero: 'troll_warlord',
    name: 'Тролль',
    distance: 'в одном топоре от вас',
    fields: [
      ['Ищу', 'ту, что выдержит, когда я в трансе'],
      ['В постели', 'в трансе не умираю и ебашу без остановки'],
      ['Вредные привычки', 'с каждым ударом всё быстрее']
    ],
    abilities: [
      'troll_warlord_switch_stance',
      'troll_warlord_whirling_axes_ranged',
      'troll_warlord_fervor',
      'troll_warlord_battle_trance'
    ]
  },
  {
    hero: 'elder_titan',
    name: 'Титан',
    distance: 'в одном расколе земли от вас',
    fields: [
      ['Ищу', 'ту, что не боится, когда земля трескается'],
      ['В постели', 'раскалываю землю, и все падают на колени'],
      ['Красный флаг', 'снимаю с тебя всю броню одной аурой']
    ],
    abilities: [
      'elder_titan_echo_stomp',
      'elder_titan_ancestral_spirit',
      'elder_titan_natural_order',
      'elder_titan_earth_splitter'
    ]
  },
  {
    hero: 'ember_spirit',
    name: 'Эмбер',
    distance: 'в одном огненном рывке от вас',
    fields: [
      ['Ищу', 'ту, что не моргнёт, пока я прыгаю'],
      ['В постели', 'прыгаю туда-сюда и жгу всех вокруг'],
      ['Вредные привычки', 'оставляю копии по всей карте, как бывших']
    ],
    abilities: [
      'ember_spirit_searing_chains',
      'ember_spirit_sleight_of_fist',
      'ember_spirit_flame_guard',
      'ember_spirit_fire_remnant'
    ]
  },
  {
    hero: 'earth_spirit',
    name: 'Эртспирит',
    distance: 'в одном пинке камня от вас',
    fields: [
      ['Ищу', 'ту, что не против, когда её пинают'],
      ['В постели', 'качу камень и сношу всех на пути'],
      ['Красный флаг', 'пинаю своих, хоть и случайно']
    ],
    abilities: [
      'earth_spirit_boulder_smash',
      'earth_spirit_rolling_boulder',
      'earth_spirit_geomagnetic_grip',
      'earth_spirit_magnetize'
    ]
  },
  {
    hero: 'oracle',
    name: 'Оракл',
    distance: 'в одном ложном обещании от вас',
    fields: [
      ['Ищу', 'ту, что поверит мне на слово'],
      ['В постели', 'обещаю, что не умрёшь, а потом посмотрим'],
      ['Не пишите, если', 'не любите сюрпризы. Отложенный урон — моё всё']
    ],
    abilities: ['oracle_fortunes_end', 'oracle_fates_edict', 'oracle_purifying_flames', 'oracle_false_promise']
  },
  {
    hero: 'arc_warden',
    name: 'Арк Варден',
    distance: 'в одном двойнике от вас',
    fields: [
      ['Ищу', 'ту, что выдержит меня и мою копию'],
      ['В постели', 'нас двое, и оба хотим одного'],
      ['Вредные привычки', 'моя копия делает всё лучше меня']
    ],
    abilities: ['arc_warden_flux', 'arc_warden_magnetic_field', 'arc_warden_spark_wraith', 'arc_warden_tempest_double']
  },
  {
    hero: 'pangolier',
    name: 'Панго',
    distance: 'в одном катящемся шаре от вас',
    fields: [
      ['Ищу', 'ту, что любит кататься'],
      ['В постели', 'качусь на тебя и не могу остановиться'],
      ['Красный флаг', 'рулю как пьяный']
    ],
    abilities: ['pangolier_swashbuckle', 'pangolier_shield_crash', 'pangolier_lucky_shot', 'pangolier_gyroshell']
  },
  {
    hero: 'grimstroke',
    name: 'Грим',
    distance: 'в одной чернильной связке от вас',
    fields: [
      ['Ищу', 'двоих, чтобы связать их вместе'],
      ['В постели', 'связываю двоих, и бью одного — больно обоим'],
      ['Вредные привычки', 'рисую на тебе чернилами']
    ],
    abilities: [
      'grimstroke_dark_artistry',
      'grimstroke_ink_creature',
      'grimstroke_spirit_walk',
      'grimstroke_soul_chain'
    ]
  },
  {
    hero: 'hoodwink',
    name: 'Белка',
    distance: 'в одном орехе от вас',
    fields: [
      ['Ищу', 'ту, что стоит у деревьев'],
      ['В постели', 'привязываю к дереву и делаю что хочу'],
      ['Не пишите, если', 'вы далеко от деревьев. Мне не к чему вас привязать']
    ],
    abilities: ['hoodwink_acorn_shot', 'hoodwink_bushwhack', 'hoodwink_scurry', 'hoodwink_sharpshooter']
  },
  {
    hero: 'void_spirit',
    name: 'Войд спирит',
    distance: 'в одном рывке через измерение от вас',
    fields: [
      ['Ищу', 'ту, что не догадается, где я появлюсь'],
      ['В постели', 'исчезаю и появляюсь сзади — ты даже не поймёшь, кто тебя выебал'],
      ['Красный флаг', 'режу пространство, чтобы до тебя добраться']
    ],
    abilities: [
      'void_spirit_aether_remnant',
      'void_spirit_dissimilate',
      'void_spirit_resonant_pulse',
      'void_spirit_astral_step'
    ]
  },
  {
    hero: 'mars',
    name: 'Марс',
    distance: 'на одной арене от вас',
    fields: [
      ['Ищу', 'ту, что выйдет со мной на арену и не сбежит'],
      ['В постели', 'запираю на арене, и выход только через меня'],
      ['Вредные привычки', 'прибиваю копьём к стене']
    ],
    abilities: ['mars_spear', 'mars_gods_rebuke', 'mars_bulwark', 'mars_arena_of_blood']
  },
  {
    hero: 'ringmaster',
    name: 'Ринг мастер',
    distance: 'в одном цирке от вас',
    fields: [
      ['Ищу', 'ту, что любит шоу'],
      ['В постели', 'каждую ночь новый номер, и ты главный клоун'],
      ['Красный флаг', 'в моём цирке ты остаёшься навсегда']
    ],
    abilities: ['ringmaster_tame_the_beasts', 'ringmaster_the_box', 'ringmaster_impalement', 'ringmaster_wheel']
  },
  {
    hero: 'dawnbreaker',
    name: 'ДБ',
    distance: 'в одном молоте с неба от вас',
    fields: [
      ['Ищу', 'ту, что будет ждать, когда я прилечу'],
      ['В постели', 'прилетаю через всю карту и сразу молотом по тебе'],
      ['Цель знакомства', 'спасти всех, кроме себя']
    ],
    abilities: [
      'dawnbreaker_fire_wreath',
      'dawnbreaker_celestial_hammer',
      'dawnbreaker_luminosity',
      'dawnbreaker_solar_guardian'
    ]
  },
  {
    hero: 'marci',
    name: 'Марси',
    distance: 'в одном броске через спину от вас',
    fields: [
      ['Ищу', 'ту, что не боится, когда её швыряют'],
      ['В постели', 'хватаю и кидаю через голову'],
      ['Красный флаг', 'защищаю только одну — тебя']
    ],
    abilities: ['marci_grapple', 'marci_companion_run', 'marci_bodyguard', 'marci_unleash']
  },
  {
    hero: 'primal_beast',
    name: 'Праймал',
    distance: 'в одном таране от вас',
    fields: [
      ['Ищу', 'ту, что выдержит, когда я разгонюсь'],
      ['В постели', 'несусь и сношу всё, что стоит на пути'],
      ['Вредные привычки', 'хватаю и бью тебя об землю, пока не устану']
    ],
    abilities: ['primal_beast_onslaught', 'primal_beast_trample', 'primal_beast_uproar', 'primal_beast_pulverize']
  },
  {
    hero: 'muerta',
    name: 'Муэрта',
    distance: 'в одной пуле с того света от вас',
    fields: [
      ['Ищу', 'ту, что не боится мёртвых'],
      ['В постели', 'стреляю, и пули проходят сквозь любую броню, сука'],
      ['Красный флаг', 'приглашаю мёртвых на свидание']
    ],
    abilities: ['muerta_dead_shot', 'muerta_the_calling', 'muerta_gunslinger', 'muerta_pierce_the_veil']
  },
  {
    hero: 'kez',
    name: 'Кез',
    distance: 'в одном крюке от вас',
    fields: [
      ['Ищу', 'ту, что не испугается, когда я налечу'],
      ['В постели', 'цепляюсь крюком и режу на куски, как салат'],
      ['Вредные привычки', 'меняю оружие прямо посреди процесса']
    ],
    abilities: ['kez_echo_slash', 'kez_grappling_claw', 'kez_kazurai_katana', 'kez_raptor_dance']
  },
  {
    hero: 'largo',
    name: 'Ларго',
    distance: 'в одном лягушачьем прыжке от вас',
    fields: [
      ['Ищу', 'ту, что любит, когда поют'],
      ['В постели', 'пою, и все вокруг пляшут без трусов'],
      ['Красный флаг', 'лижу тебя языком на первом свидании']
    ],
    abilities: ['largo_catchy_lick', 'largo_frogstomp', 'largo_croak_of_genius', 'largo_amphibian_rhapsody']
  }
];

const HEART =
  '<svg class="hrt" viewBox="0 0 24 24"><path d="M12 21.4 10.6 20C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.6 11.5L12 21.4Z"/></svg>';
const PIN =
  '<svg class="pin" viewBox="0 0 24 24"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';

// The board's inner box sits inside the template's stone frame; the script shrinks the name and the fields until they
// fit, so no text ever leaves the board (owner, 28.10.2026: «текст за рамку выходит»).
const CSS = `*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden}
body{position:relative;background:#140c14 var(--scene,none) 0 0/${WIDTH}px ${HEIGHT}px no-repeat;font-family:Manrope,Arial,sans-serif;color:#fff}
.board{position:absolute;left:1000px;top:236px;width:440px;height:620px;display:flex;flex-direction:column;overflow:hidden}
.nm{display:flex;align-items:center;gap:14px}
.nm span{min-width:0;font-family:Montserrat,Arial,sans-serif;font-weight:900;font-size:92px;line-height:1.05;white-space:nowrap;overflow:hidden;text-transform:uppercase;text-shadow:0 3px 0 rgba(0,0,0,.5)}
.hrt{flex:none;width:54px;height:54px;fill:#ff4f8f;filter:drop-shadow(0 0 12px rgba(255,79,143,.8))}
.dist{display:flex;align-items:center;gap:8px;font-weight:800;font-size:30px;color:#ff86b4;white-space:nowrap;overflow:hidden}
.pin{flex:none;width:28px;height:28px;fill:none;stroke:#ff5c97;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.blocks{flex:1;min-height:0;overflow:hidden;font-size:32px;line-height:1.15;font-weight:700;display:flex;flex-direction:column;justify-content:space-evenly;margin-top:12px;border-top:2px solid rgba(255,79,143,.55)}
.blk{padding:.22em 0}.blk+.blk{border-top:1.5px solid rgba(255,255,255,.13)}
.blk h3{font-family:Montserrat,Arial,sans-serif;font-weight:800;font-size:.6em;letter-spacing:.14em;text-transform:uppercase;color:#ff5c97;margin-bottom:.12em}
.ab{display:flex;gap:10px;padding-top:12px}.ab img{width:62px;height:62px;border:2px solid rgba(255,255,255,.22);border-radius:6px}`;

const FIT = `<script>(()=>{const done=()=>document.documentElement.setAttribute('data-fonts-ready','');
document.fonts.ready.then(()=>{const n=document.querySelector('.nm span');let s=parseFloat(getComputedStyle(n).fontSize);
while(n.scrollWidth>n.clientWidth&&s>40){s-=2;n.style.fontSize=s+'px'}
const d=document.querySelector('.dist');let t=parseFloat(getComputedStyle(d).fontSize);
while(d.scrollWidth>d.clientWidth&&t>18){t-=1;d.style.fontSize=t+'px'}
const r=document.querySelector('.blocks');let f=parseFloat(getComputedStyle(r).fontSize);
while(r.scrollHeight>r.clientHeight+1&&f>20){f-=1;r.style.fontSize=f+'px'}}).then(done,done);setTimeout(done,8000);})();</script>`;

function anketaPage(anketa: Anketa): string {
  const fields = anketa.fields
    .map(([title, text]) => `<section class="blk"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></section>`)
    .join('');
  const icons = anketa.abilities.map((key) => `<img src="${abilityImage(key)}" alt="">`).join('');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@700;800&amp;family=Montserrat:wght@800;900&amp;display=block&amp;subset=cyrillic" rel="stylesheet">
<style>${CSS}</style></head><body><div class="board"><div class="nm"><span>${escapeHtml(anketa.name)}</span>${HEART}</div>
<div class="dist">${PIN}${escapeHtml(anketa.distance)}</div><div class="blocks">${fields}</div><div class="ab">${icons}</div></div>${FIT}</body></html>`;
}

// Every hero once (owner, 29.10.2026: «всех героев полностью»), in a shuffled order without repeats.
export async function heroProfile(context: RubricContext): Promise<RubricSample> {
  const turn = await context.sources.turns?.next('hero_profile');
  const size = ANKETAS.length;
  const anketa =
    turn === undefined
      ? pick(ANKETAS, context.random)
      : (ANKETAS[shuffledOrder(Math.floor(turn / size), size)[turn % size] ?? 0] ?? pick(ANKETAS, context.random));
  return {
    picture: { html: anketaPage(anketa), width: WIDTH, height: HEIGHT },
    heroScene: { renderUrl: `${RENDERS}/${anketa.hero}.png`, heroName: anketa.name },
    text: '❤️ — вправо · 💔 — влево',
    ownText: true,
    poll: null
  };
}
