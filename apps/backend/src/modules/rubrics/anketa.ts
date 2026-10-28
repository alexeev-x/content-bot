import { abilityImage, escapeHtml } from './picture';
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
    name: 'АМ',
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
    name: 'Кристалка',
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
    name: 'ПА',
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
    name: 'Джагер',
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
    name: 'Виндра',
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

export function heroProfile(context: RubricContext): Promise<RubricSample> {
  const anketa = pick(ANKETAS, context.random);
  return Promise.resolve({
    picture: { html: anketaPage(anketa), width: WIDTH, height: HEIGHT },
    heroScene: { renderUrl: `${RENDERS}/${anketa.hero}.png`, heroName: anketa.name },
    text: '❤️ — вправо · 💔 — влево',
    ownText: true,
    poll: null
  });
}
