import { shuffledOrder } from './bank-order';
import { type RubricContext, type RubricSample, noData, quiz, shuffled } from './types';

// «Ребус» (30, owner-approved 30.10.2026): a picture of the stall wall — Valve stickers, marker doodles and spray
// letters read in order — and a Telegram quiz under it: what is written here. Bank of rebuses with their wrong readings.

type SymbolKind =
  | 'ass'
  | 'finger'
  | 'shit'
  | 'mouthLolly'
  | 'mouth'
  | 'eggs'
  | 'head'
  | 'face'
  | 'hole'
  | 'dick'
  | 'forest'
  | 'coffin'
  | 'bed'
  | 'knife';
type Part =
  | {
      kind: 'text';
      value: string;
      commasBefore?: number;
      commasAfter?: number;
      swap?: [string, string];
      cross?: string;
      add?: string;
    }
  | {
      kind: 'symbol';
      value: SymbolKind;
      commasBefore?: number;
      commasAfter?: number;
      swap?: [string, string];
      cross?: string;
      add?: string;
    }
  | {
      kind: 'hero' | 'ability' | 'item';
      value: string;
      url: string;
      commasBefore?: number;
      commasAfter?: number;
      swap?: [string, string];
      cross?: string;
      add?: string;
    };
export interface Rebus {
  id: string;
  phrase: string;
  parts: Part[];
  /** Three wrong readings of the same phrase. */
  wrong: [string, string, string];
  explanation: string;
}

export const REBUSES: Rebus[] = [
  {
    id: 'r30v2-01',
    phrase: 'АМ сосёт в лесу за БФ',
    parts: [
      {
        kind: 'hero',
        value: 'antimage',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/antimage.png'
      },
      { kind: 'symbol', value: 'mouthLolly' },
      { kind: 'text', value: 'В' },
      { kind: 'symbol', value: 'forest', add: 'У' },
      { kind: 'text', value: 'ЗА' },
      {
        kind: 'item',
        value: 'bfury',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/bfury.png'
      }
    ],
    wrong: ['АМ сосёт в деревне за БФ', 'АМ сосёт в лесу за Топор', 'АМ сосёт в лесу, а Фурион смотрит'],
    explanation:
      'АМ + рот с леденцом = сосёт + В + деревья = лес, +У = лесу + ЗА + Battle Fury = БФ. Двадцать минут в лесу ради одной железки.'
  },
  {
    id: 'r30v2-02',
    phrase: 'Пудж хукнул меня за яйца',
    parts: [
      {
        kind: 'hero',
        value: 'pudge',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/pudge.png'
      },
      {
        kind: 'ability',
        value: 'pudge_meat_hook',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/pudge_meat_hook.png'
      },
      { kind: 'text', value: 'МЕНЯ' },
      { kind: 'text', value: 'ЗА' },
      { kind: 'symbol', value: 'eggs' }
    ],
    wrong: ['Пудж хукнул меня за Феникса', 'Пудж хукнул меня в глаза', 'Пудж хукнул меня и сожрал яйца'],
    explanation:
      'Пудж + Meat Hook = хукнул + МЕНЯ ЗА + два яйца. Крюк цепляет за что попало, и попадает всегда в одно и то же.'
  },
  {
    id: 'r30v2-03',
    phrase: 'Течис заминировал мне очко',
    parts: [
      {
        kind: 'hero',
        value: 'techies',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/techies.png'
      },
      {
        kind: 'ability',
        value: 'techies_land_mines',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/techies_land_mines.png'
      },
      { kind: 'text', value: 'МНЕ' },
      { kind: 'symbol', value: 'hole' }
    ],
    wrong: ['Течис заминировал мне сортир', 'Течис заминировал мне жопу', 'Течис заминировал себе очко и сел'],
    explanation: 'Течис + Proximity Mines = заминировал + МНЕ + дыра в сортире = очко. Мину не видно, пока не сел.'
  },
  {
    id: 'r30v2-04',
    phrase: 'Рубик спиздил у меня дыру',
    parts: [
      {
        kind: 'hero',
        value: 'rubick',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/rubick.png'
      },
      {
        kind: 'ability',
        value: 'rubick_spell_steal',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/rubick_spell_steal.png'
      },
      { kind: 'text', value: 'У' },
      { kind: 'text', value: 'МЕНЯ' },
      {
        kind: 'ability',
        value: 'enigma_black_hole',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/enigma_black_hole.png',
        swap: ['А', 'У']
      }
    ],
    wrong: ['Рубик спиздил у меня ульту', 'Рубик спиздил у меня Энигму', 'Рубик расширил мне дыру'],
    explanation:
      'Рубик + Spell Steal = спиздил + У МЕНЯ + Black Hole = дыра, А→У = дыру. Энигма копил на блинк, а дыру кастанул Рубик.'
  },
  {
    id: 'r30v2-05',
    phrase: 'Палец в жопу от Лиона',
    parts: [
      {
        kind: 'ability',
        value: 'lion_finger_of_death',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/lion_finger_of_death.png'
      },
      { kind: 'text', value: 'В' },
      { kind: 'symbol', value: 'ass', swap: ['А', 'У'] },
      { kind: 'text', value: 'ОТ' },
      {
        kind: 'hero',
        value: 'lion',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/lion.png',
        add: 'А'
      }
    ],
    wrong: ['Палец в жопе у Лиона', 'Хекс в жопу от Лиона', 'Лион сунул палец и понюхал'],
    explanation:
      'Finger of Death = палец + В + жопа, А→У = жопу + ОТ + Лион +А = Лиона. Шестой уровень Лиона чувствует каждая жопа.'
  },
  {
    id: 'r30v2-06',
    phrase: 'Оракл пообещал и наебал',
    parts: [
      {
        kind: 'hero',
        value: 'oracle',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/oracle.png'
      },
      {
        kind: 'ability',
        value: 'oracle_false_promise',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/oracle_false_promise.png'
      },
      { kind: 'text', value: 'И' },
      { kind: 'text', value: 'НА' },
      { kind: 'symbol', value: 'face', commasAfter: 1 }
    ],
    wrong: ['Оракл пообещал и на ебало', 'Оракл полечил и наебал', 'Оракл пообещал жениться и наебал'],
    explanation:
      'Оракл + False Promise = пообещал + И НА + ебало без последней О = ебал → наебал. Хила пришло меньше, чем урона.'
  },
  {
    id: 'r30v2-07',
    phrase: 'Войд в хроне ебал меня в рот',
    parts: [
      {
        kind: 'hero',
        value: 'faceless_void',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/faceless_void.png'
      },
      { kind: 'text', value: 'В' },
      {
        kind: 'ability',
        value: 'faceless_void_chronosphere',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/faceless_void_chronosphere.png',
        commasAfter: 1,
        add: 'Е'
      },
      { kind: 'symbol', value: 'face', commasAfter: 1 },
      { kind: 'text', value: 'МЕНЯ' },
      { kind: 'text', value: 'В' },
      { kind: 'symbol', value: 'mouth' }
    ],
    wrong: ['Войд в сфере ебал меня в рот', 'Войд в хроне ебал меня в ебало', 'Войд в хроне, а я уже на коленях'],
    explanation:
      'Войд + В + Chronosphere = хрона, без А и +Е = хроне + ебало без О = ебал + МЕНЯ В + рот. Внутри купола ты не можешь ничего.'
  },
  {
    id: 'r30v2-08',
    phrase: 'Акс отрубил мне голову',
    parts: [
      {
        kind: 'hero',
        value: 'axe',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/axe.png'
      },
      {
        kind: 'ability',
        value: 'axe_culling_blade',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/axe_culling_blade.png'
      },
      { kind: 'text', value: 'МНЕ' },
      { kind: 'symbol', value: 'head', commasAfter: 1, add: 'У' }
    ],
    wrong: ['Акс отрубил мне ебало', 'Акс снёс мне башню', 'Акс отрубил мне голову и поцеловал'],
    explanation:
      'Акс + Culling Blade = отрубил + МНЕ + голова без А и +У = голову. Мало хп рядом с Аксом — голову не ищи.'
  },
  {
    id: 'r30v2-09',
    phrase: 'Бристалбэк обсоплил мне ебало',
    parts: [
      {
        kind: 'hero',
        value: 'bristleback',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/bristleback.png'
      },
      {
        kind: 'ability',
        value: 'bristleback_viscous_nasal_goo',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/bristleback_viscous_nasal_goo.png'
      },
      { kind: 'text', value: 'МНЕ' },
      { kind: 'symbol', value: 'face' }
    ],
    wrong: ['Бристалбэк обсоплил мне рот', 'Бристалбэк обстрелял мне ебало', 'Бристалбэк кончил мне на ебало'],
    explanation:
      'Бристалбэк + Viscous Nasal Goo = сопли → обсоплил + МНЕ + ебало. Сопли стакаются, броня тает, лицо мокрое.'
  },
  {
    id: 'r30v2-10',
    phrase: 'Бара разогнался мне в яйца',
    parts: [
      {
        kind: 'hero',
        value: 'spirit_breaker',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/spirit_breaker.png'
      },
      {
        kind: 'ability',
        value: 'spirit_breaker_charge_of_darkness',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/spirit_breaker_charge_of_darkness.png'
      },
      { kind: 'text', value: 'МНЕ' },
      { kind: 'text', value: 'В' },
      { kind: 'symbol', value: 'eggs' }
    ],
    wrong: ['Бара разогнался мне в глаза', 'Бара башнул мне в яйца', 'Бара разогнался, яйца остались в лесу'],
    explanation: 'Бара + Charge of Darkness = разгон → разогнался + МНЕ В + два яйца. Через всю карту и ровно в них.'
  },
  {
    id: 'r30v2-11',
    phrase: 'Гуля залез мне в жопу',
    parts: [
      {
        kind: 'hero',
        value: 'life_stealer',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/life_stealer.png'
      },
      {
        kind: 'ability',
        value: 'life_stealer_infest',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/life_stealer_infest.png'
      },
      { kind: 'text', value: 'МНЕ' },
      { kind: 'text', value: 'В' },
      { kind: 'symbol', value: 'ass', swap: ['А', 'У'] }
    ],
    wrong: ['Гуля залез мне в очко', 'Гуля сожрал мне жопу', 'Гуля залез мне в жопу и там живёт'],
    explanation:
      'Гуля + Infest = залез + МНЕ В + жопа, А→У = жопу. Сидит внутри, лечится и вылезает в самый неудобный момент.'
  },
  {
    id: 'r30v2-12',
    phrase: 'Тини кинул меня нахуй',
    parts: [
      {
        kind: 'hero',
        value: 'tiny',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/tiny.png'
      },
      {
        kind: 'ability',
        value: 'tiny_toss',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/tiny_toss.png'
      },
      { kind: 'text', value: 'МЕНЯ' },
      { kind: 'symbol', value: 'finger' }
    ],
    wrong: ['Тини кинул меня на палец', 'Тини кинул мне фак', 'Тини кинул меня, как батя'],
    explanation: 'Тини + Toss = кинул + МЕНЯ + средний палец = нахуй. Швырнул в пятерых врагов и ушёл фармить.'
  },
  {
    id: 'r30v2-13',
    phrase: 'Нага спела и заебала',
    parts: [
      {
        kind: 'hero',
        value: 'naga_siren',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/naga_siren.png'
      },
      {
        kind: 'ability',
        value: 'naga_siren_song_of_the_siren',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/naga_siren_song_of_the_siren.png'
      },
      { kind: 'text', value: 'И' },
      { kind: 'text', value: 'ЗА' },
      { kind: 'symbol', value: 'face', swap: ['О', 'А'] }
    ],
    wrong: ['Нага спела и заебало', 'Нага спела и наебала', 'Нага спела, и у всех встал'],
    explanation:
      'Нага + Song of the Siren = спела + И ЗА + ебало, О→А = ебала → заебала. Все спят, драка ждёт, а она поёт.'
  },
  {
    id: 'r30v2-14',
    phrase: 'Магнус насадил меня на бутылку',
    parts: [
      {
        kind: 'hero',
        value: 'magnataur',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/magnataur.png'
      },
      {
        kind: 'ability',
        value: 'magnataur_skewer',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/magnataur_skewer.png'
      },
      { kind: 'text', value: 'МЕНЯ' },
      { kind: 'text', value: 'НА' },
      {
        kind: 'item',
        value: 'bottle',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/bottle.png',
        swap: ['А', 'У']
      }
    ],
    wrong: [
      'Магнус насадил меня на фласку',
      'Магнус перевернул меня на бутылку',
      'Магнус насадил меня, и мне понравилось'
    ],
    explanation: 'Магнус + Skewer = насадил + МЕНЯ НА + Bottle = бутылка, А→У = бутылку. Тащит на роге прямо к своим.'
  },
  {
    id: 'r30v2-15',
    phrase: 'Бейн схватил меня за хуй',
    parts: [
      {
        kind: 'hero',
        value: 'bane',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/bane.png'
      },
      {
        kind: 'ability',
        value: 'bane_fiends_grip',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/bane_fiends_grip.png'
      },
      { kind: 'text', value: 'МЕНЯ' },
      { kind: 'text', value: 'ЗА' },
      { kind: 'symbol', value: 'dick' }
    ],
    wrong: ['Бейн схватил меня за палец', 'Бейн усыпил меня нахуй', 'Бейн подержался и попросил ещё'],
    explanation: "Бейн + Fiend's Grip = грип → схватил + МЕНЯ ЗА + член = хуй. Держит, пока сам не отпустит."
  },
  {
    id: 'r30v2-16',
    phrase: 'Кунка торрентом мне в очко',
    parts: [
      {
        kind: 'hero',
        value: 'kunkka',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/kunkka.png'
      },
      {
        kind: 'ability',
        value: 'kunkka_torrent',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/kunkka_torrent.png',
        add: 'ОМ'
      },
      { kind: 'text', value: 'МНЕ' },
      { kind: 'text', value: 'В' },
      { kind: 'symbol', value: 'hole' }
    ],
    wrong: ['Кунка торрентом мне в жопу', 'Кунка корабликом мне в очко', 'Кунка устроил мне биде'],
    explanation: 'Кунка + Torrent +ОМ = торрентом + МНЕ В + дыра в сортире = очко. Струя из-под земли, и ты летишь.'
  },
  {
    id: 'r30v2-17',
    phrase: 'Сларк прыгнул мне на хуй',
    parts: [
      {
        kind: 'hero',
        value: 'slark',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/slark.png'
      },
      {
        kind: 'ability',
        value: 'slark_pounce',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/slark_pounce.png'
      },
      { kind: 'text', value: 'МНЕ' },
      { kind: 'text', value: 'НА' },
      { kind: 'symbol', value: 'dick' }
    ],
    wrong: ['Сларк прыгнул мне на палец', 'Сларк спиздил мне хуй', 'Сларк прыгнул мне на хуй и спиздил статы'],
    explanation: 'Сларк + Pounce = прыжок → прыгнул + МНЕ НА + член = хуй. Привязал к себе и с каждым ударом жирнеет.'
  },
  {
    id: 'r30v2-18',
    phrase: 'Джаггер крутится на хую',
    parts: [
      {
        kind: 'hero',
        value: 'juggernaut',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/juggernaut.png'
      },
      {
        kind: 'ability',
        value: 'juggernaut_blade_fury',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/juggernaut_blade_fury.png'
      },
      { kind: 'text', value: 'НА' },
      { kind: 'symbol', value: 'dick', commasAfter: 1, add: 'Ю' }
    ],
    wrong: ['Джаггер крутится нахуй', 'Джаггер крутится нахуя', 'Джаггер крутит хуем, а крипы в шоке'],
    explanation:
      'Джаггер + Blade Fury = крутилка → крутится + НА + член = хуй, без Й и +Ю = хую. Магия не берёт, остаётся смотреть.'
  },
  {
    id: 'r30v2-19',
    phrase: 'Хускар прыгнул на БМ и в гроб',
    parts: [
      {
        kind: 'hero',
        value: 'huskar',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/huskar.png'
      },
      {
        kind: 'ability',
        value: 'huskar_life_break',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/huskar_life_break.png'
      },
      { kind: 'text', value: 'НА' },
      {
        kind: 'item',
        value: 'blade_mail',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/blade_mail.png'
      },
      { kind: 'text', value: 'И' },
      { kind: 'text', value: 'В' },
      { kind: 'symbol', value: 'coffin' }
    ],
    wrong: ['Хускар прыгнул на БКБ и в гроб', 'Хускар копьями в БМ и в гроб', 'Хускар прыгнул на БМ, долбоёб'],
    explanation:
      'Хускар + Life Break = прыжок → прыгнул + НА + Blade Mail = БМ + И В + гроб. Свой же урон прилетел обратно.'
  },
  {
    id: 'r30v2-20',
    phrase: 'Сикер порвал мне жопу',
    parts: [
      {
        kind: 'hero',
        value: 'bloodseeker',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/bloodseeker.png'
      },
      {
        kind: 'ability',
        value: 'bloodseeker_rupture',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/bloodseeker_rupture.png'
      },
      { kind: 'text', value: 'МНЕ' },
      { kind: 'symbol', value: 'ass', swap: ['А', 'У'] }
    ],
    wrong: ['Сикер порвал мне очко', 'Сикер пустил мне кровь', 'Сикер порвал мне жопу и облизал'],
    explanation: 'Сикер + Rupture = разрыв → порвал + МНЕ + жопа, А→У = жопу. Побежишь — кровь хлещет, стоишь — убьют.'
  },
  {
    id: 'r30v2-21',
    phrase: 'Цмка отморозила мне яйца',
    parts: [
      {
        kind: 'hero',
        value: 'crystal_maiden',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/crystal_maiden.png'
      },
      {
        kind: 'ability',
        value: 'crystal_maiden_frostbite',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/crystal_maiden_frostbite.png'
      },
      { kind: 'text', value: 'МНЕ' },
      { kind: 'symbol', value: 'eggs' }
    ],
    wrong: ['Цмка заморозила мне глаза', 'Цмка ультой отморозила мне яйца', 'Цмка отморозила мне яйца, а я ей ничего'],
    explanation: 'Цмка + Frostbite = обморожение → отморозила + МНЕ + два яйца. Стоишь в корнях, а сзади уже летит.'
  },
  {
    id: 'r30v2-22',
    phrase: 'Снайпер хедшотнул мне по яйцам',
    parts: [
      {
        kind: 'hero',
        value: 'sniper',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/sniper.png'
      },
      {
        kind: 'ability',
        value: 'sniper_headshot',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/sniper_headshot.png'
      },
      { kind: 'text', value: 'МНЕ' },
      { kind: 'text', value: 'ПО' },
      { kind: 'symbol', value: 'eggs', commasAfter: 1, add: 'АМ' }
    ],
    wrong: [
      'Снайпер хедшотнул мне по глазам',
      'Снайпер ассасинейтом мне по яйцам',
      'Снайпер целился в голову, но выбрал главное'
    ],
    explanation:
      'Снайпер + Headshot = хедшотнул + МНЕ ПО + два яйца, без А и +АМ = яйцам. Целился в голову, попал больнее.'
  },
  {
    id: 'r30v2-24',
    phrase: 'Кентавр затоптал меня в говно',
    parts: [
      {
        kind: 'hero',
        value: 'centaur',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/centaur.png'
      },
      {
        kind: 'ability',
        value: 'centaur_stampede',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/centaur_stampede.png'
      },
      { kind: 'text', value: 'МЕНЯ' },
      { kind: 'text', value: 'В' },
      { kind: 'symbol', value: 'shit' }
    ],
    wrong: ['Кентавр затоптал меня в грязь', 'Кентавр застанил меня в говно', 'Кентавр затоптал меня и насрал сверху'],
    explanation:
      'Кентавр + Stampede = топот → затоптал + МЕНЯ В + куча = говно. Вся вражеская пятёрка бежит прямо по тебе.'
  },
  {
    id: 'r30v2-25',
    phrase: 'Вайпер наплевал мне в рот',
    parts: [
      {
        kind: 'hero',
        value: 'viper',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/viper.png'
      },
      {
        kind: 'ability',
        value: 'viper_poison_attack',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/viper_poison_attack.png'
      },
      { kind: 'text', value: 'МНЕ' },
      { kind: 'text', value: 'В' },
      { kind: 'symbol', value: 'mouth' }
    ],
    wrong: ['Вайпер наплевал мне в ебало', 'Вайпер нагадил мне в рот', 'Вайпер наплевал мне в рот, и я проглотил'],
    explanation:
      'Вайпер + Poison Attack = плевок → наплевал + МНЕ В + рот. Каждый удар — ядовитая слюна и минус скорость.'
  },
  {
    id: 'r30v2-26',
    phrase: 'Дарк сир засосал меня в очко',
    parts: [
      {
        kind: 'hero',
        value: 'dark_seer',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/dark_seer.png'
      },
      {
        kind: 'ability',
        value: 'dark_seer_vacuum',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/dark_seer_vacuum.png'
      },
      { kind: 'text', value: 'МЕНЯ' },
      { kind: 'text', value: 'В' },
      { kind: 'symbol', value: 'hole' }
    ],
    wrong: ['Дарк сир засосал меня в сортир', 'Дарк сир запер меня в очко', 'Дарк сир засосал меня, я засосал его'],
    explanation:
      'Дарк сир + Vacuum = пылесос → засосал + МЕНЯ В + дыра в сортире = очко. Пять врагов в одной точке, и смыв.'
  },
  {
    id: 'r30v2-28',
    phrase: 'Сайленсер заткнул мне ебало',
    parts: [
      {
        kind: 'hero',
        value: 'silencer',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/silencer.png'
      },
      {
        kind: 'ability',
        value: 'silencer_global_silence',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/silencer_global_silence.png'
      },
      { kind: 'text', value: 'МНЕ' },
      { kind: 'symbol', value: 'face' }
    ],
    wrong: [
      'Сайленсер заткнул мне рот',
      'Сайленсер глефами мне в ебало',
      'Сайленсер заткнул мне ебало, и пати сказала спасибо'
    ],
    explanation:
      'Сайленсер + Global Silence = глобал → заткнул + МНЕ + ебало. Вся карта молчит, а орать хочется сильнее всего.'
  },
  {
    id: 'r30v2-29',
    phrase: 'Тинкер дагоном по голове',
    parts: [
      {
        kind: 'hero',
        value: 'tinker',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/tinker.png'
      },
      {
        kind: 'item',
        value: 'dagon',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/dagon.png',
        add: 'ОМ'
      },
      { kind: 'text', value: 'ПО' },
      { kind: 'symbol', value: 'head', commasAfter: 1, add: 'Е' }
    ],
    wrong: ['Тинкер лазером по голове', 'Тинкер дагоном по ебалу', 'Тинкер дагоном по голове, ракетами в жопу'],
    explanation: 'Тинкер + Dagon +ОМ = дагоном + ПО + голова без А и +Е = голове. Луч, реарм, ещё луч.'
  },
  {
    id: 'r30v2-30',
    phrase: 'Тролль с БКБ похуй',
    parts: [
      {
        kind: 'hero',
        value: 'troll_warlord',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/troll_warlord.png'
      },
      { kind: 'text', value: 'С' },
      {
        kind: 'item',
        value: 'black_king_bar',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/black_king_bar.png'
      },
      { kind: 'text', value: 'ПО' },
      { kind: 'symbol', value: 'dick' }
    ],
    wrong: ['Тролль с БФ похуй', 'Тролль с БКБ нахуй', 'Тролль с БКБ ебёт всех подряд'],
    explanation: 'Тролль + С + Black King Bar = БКБ + ПО + член = хуй → похуй. Транс, БКБ, и стан ему не страшен.'
  },
  {
    id: 'r30v2-31',
    phrase: 'Шаман связал меня в кровати',
    parts: [
      {
        kind: 'hero',
        value: 'shadow_shaman',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/shadow_shaman.png'
      },
      {
        kind: 'ability',
        value: 'shadow_shaman_shackles',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/shadow_shaman_shackles.png'
      },
      { kind: 'text', value: 'МЕНЯ' },
      { kind: 'text', value: 'В' },
      { kind: 'symbol', value: 'bed', commasAfter: 1, add: 'И' }
    ],
    wrong: [
      'Шаман связал меня в кровать',
      'Шаман захексил меня в кровати',
      'Шаман связал меня в кровати, стоп-слово — гг'
    ],
    explanation:
      'Шаман + Shackles = шаклы → связал + МЕНЯ В + кровать, без Ь и +И = кровати. Держит, пока сам не устанет.'
  },
  {
    id: 'r30v2-32',
    phrase: 'Фурион засадил мне в жопу',
    parts: [
      {
        kind: 'hero',
        value: 'furion',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/furion.png'
      },
      {
        kind: 'ability',
        value: 'furion_sprout',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/furion_sprout.png'
      },
      { kind: 'text', value: 'МНЕ' },
      { kind: 'text', value: 'В' },
      { kind: 'symbol', value: 'ass', swap: ['А', 'У'] }
    ],
    wrong: ['Фурион засадил мне в очко', 'Фурион запер мне жопу', 'Фурион засадил и телепортнулся'],
    explanation:
      'Фурион + Sprout = посадил деревья → засадил + МНЕ В + жопа, А→У = жопу. Сажает он лес, а засадили тебе.'
  },
  {
    id: 'r30v2-33',
    phrase: 'Легионка вызвала меня на хуй',
    parts: [
      {
        kind: 'hero',
        value: 'legion_commander',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/legion_commander.png'
      },
      {
        kind: 'ability',
        value: 'legion_commander_duel',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/legion_commander_duel.png'
      },
      { kind: 'text', value: 'МЕНЯ' },
      { kind: 'text', value: 'НА' },
      { kind: 'symbol', value: 'dick' }
    ],
    wrong: [
      'Легионка вызвала меня на дуэль',
      'Легионка позвала меня на палец',
      'Легионка вызвала меня на хуй и забрала урон'
    ],
    explanation: 'Легионка + Duel = вызвала + МЕНЯ НА + член = хуй. Дуэль выиграла — урон ей, тебе фонтан.'
  },
  {
    id: 'r30v2-34',
    phrase: 'Квопа орёт мне в ебало',
    parts: [
      {
        kind: 'hero',
        value: 'queenofpain',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/queenofpain.png'
      },
      {
        kind: 'ability',
        value: 'queenofpain_scream_of_pain',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/queenofpain_scream_of_pain.png'
      },
      { kind: 'text', value: 'МНЕ' },
      { kind: 'text', value: 'В' },
      { kind: 'symbol', value: 'face' }
    ],
    wrong: ['Квопа орёт мне в рот', 'Квопа стонет мне в ебало', 'Квопа орёт, как мачеха на отчима'],
    explanation: 'Квопа + Scream of Pain = крик → орёт + МНЕ В + ебало. Блинк в лицо, крик, и полоска хп пустая.'
  },
  {
    id: 'r30v2-35',
    phrase: 'У ВК в гробу встал',
    parts: [
      { kind: 'text', value: 'У' },
      {
        kind: 'hero',
        value: 'skeleton_king',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/skeleton_king.png'
      },
      { kind: 'text', value: 'В' },
      { kind: 'symbol', value: 'coffin', add: 'У' },
      {
        kind: 'ability',
        value: 'skeleton_king_reincarnation',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/skeleton_king_reincarnation.png'
      }
    ],
    wrong: ['У ВК в гробу воскрес', 'У ВК в гробу лёг', 'ВК в гробу дрочит на аегис'],
    explanation:
      'У + ВК + В + гроб +У = гробу + Reincarnation, вторая жизнь = встал. Короля убили, а у него снова встал.'
  },
  {
    id: 'r30v2-36',
    phrase: 'Шейкер — блинк и в гроб',
    parts: [
      {
        kind: 'hero',
        value: 'earthshaker',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/earthshaker.png'
      },
      {
        kind: 'item',
        value: 'blink',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/blink.png'
      },
      { kind: 'text', value: 'И' },
      { kind: 'text', value: 'В' },
      { kind: 'symbol', value: 'coffin' }
    ],
    wrong: ['Шейкер — форс и в гроб', 'Шейкер — блинк и в шкаф', 'Шейкер — блинк и обосрался'],
    explanation: 'Шейкер + Blink Dagger = блинк + И В + гроб. Прыгнул в пятерых, эхо нажать не успел.'
  },
  {
    id: 'r30v2-38',
    phrase: 'Рики ножом мне в очко',
    parts: [
      {
        kind: 'hero',
        value: 'riki',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/riki.png'
      },
      { kind: 'symbol', value: 'knife', add: 'ОМ' },
      { kind: 'text', value: 'МНЕ' },
      { kind: 'text', value: 'В' },
      { kind: 'symbol', value: 'hole' }
    ],
    wrong: ['Рики ножом мне в жопу', 'Рики ножом мне в сортир', 'Рики ножом мне в очко, а я его даже не видел'],
    explanation: 'Рики + нож +ОМ = ножом + МНЕ В + дыра в сортире = очко. Невидимый, сзади и сразу в цель.'
  },
  {
    id: 'r30v2-39',
    phrase: 'Мипо закопался в говно',
    parts: [
      {
        kind: 'hero',
        value: 'meepo',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/meepo.png'
      },
      {
        kind: 'ability',
        value: 'meepo_petrify',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/meepo_petrify.png'
      },
      { kind: 'text', value: 'В' },
      { kind: 'symbol', value: 'shit' }
    ],
    wrong: ['Мипо закопался в грязь', 'Мипо окаменел в говне', 'Мипо закопался в говно, все четыре'],
    explanation: 'Мипо + Dig = лопата → закопался + В + куча = говно. Спрятался под землю, а там не лучше.'
  },
  {
    id: 'r30v2-40',
    phrase: 'Бэтрайдер утащил меня нахуй',
    parts: [
      {
        kind: 'hero',
        value: 'batrider',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/batrider.png'
      },
      {
        kind: 'ability',
        value: 'batrider_flaming_lasso',
        url: 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/batrider_flaming_lasso.png'
      },
      { kind: 'text', value: 'МЕНЯ' },
      { kind: 'symbol', value: 'finger' }
    ],
    wrong: [
      'Бэтрайдер утащил меня на палец',
      'Бэтрайдер поджёг меня нахуй',
      'Бэтрайдер утащил меня в кусты, дальше без подробностей'
    ],
    explanation:
      'Бэтрайдер + Flaming Lasso = лассо → утащил + МЕНЯ + средний палец = нахуй. Прилетел, схватил и к своим.'
  }
];

const WALL = '#262b28',
  INK = '#f4f1ea',
  RED = '#ff3b2f',
  HOLE = '#0d0f0e';
const H = 260; // base height of one part before the line is scaled to fit

// Seeded random per rebus id, so a re-render keeps the same tilts and scratches.
function rng(str: string) {
  let s = 7;
  for (const c of str) s = (s * 31 + c.charCodeAt(0)) % 2147483647;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// ---------- marker doodles: one inline SVG per symbol kind, white marker on the wall ----------
// Each: [viewBox width, viewBox height, inner SVG]. `s` = marker stroke, `f` = same stroke over a wall fill.
const s = `fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"`;
const f = `fill="${WALL}" stroke="${INK}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"`;
const thin = `fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"`;
const fly = (x: number, y: number) =>
  `<g transform="translate(${x} ${y})"><circle r="6" fill="${INK}"/><path d="M-2 -4 q-10 -14 -16 -4 q4 8 16 4 M2 -4 q10 -14 16 -4 q-4 8 -16 4" ${thin} stroke-width="4"/></g>`;
const stink = (x: number, y: number) => `<path d="M${x} ${y} q-12 -14 0 -28 q12 -14 0 -28 q-12 -14 0 -28" ${thin}/>`;
// red lips (lipstick reads as a mouth at once) with an open dark hole
const lips = (cx: number, cy: number, rx: number, ry: number, hole: number) => `
<path d="M${cx - rx} ${cy} C${cx - rx * 0.7} ${cy - ry * 0.9} ${cx - rx * 0.45} ${cy - ry * 1.15} ${cx - rx * 0.2} ${cy - ry * 0.95} Q${cx} ${cy - ry * 0.8} ${cx + rx * 0.2} ${cy - ry * 0.95} C${cx + rx * 0.45} ${cy - ry * 1.15} ${cx + rx * 0.7} ${cy - ry * 0.9} ${cx + rx} ${cy} C${cx + rx * 0.7} ${cy + ry * 1.25} ${cx - rx * 0.7} ${cy + ry * 1.25} ${cx - rx} ${cy} Z" fill="${RED}" stroke="${INK}" stroke-width="11" stroke-linejoin="round"/>
<ellipse cx="${cx}" cy="${cy + ry * 0.08}" rx="${rx * hole}" ry="${ry * hole * 1.05}" fill="${HOLE}" stroke="${INK}" stroke-width="8"/>`;
// lollipop swirl: an Archimedean spiral as one path
// fir tree: three zigzag tiers over a short trunk; (cx, ground y, height, width)
const fir = (cx: number, b: number, h: number, w: number) => {
  const y = (k: number) => (b - h * k).toFixed(0),
    x = (k: number) => (cx + w * k).toFixed(0);
  return `<path d="M${cx - 9} ${b} L${cx - 9} ${y(0.12)} L${cx + 9} ${y(0.12)} L${cx + 9} ${b}" ${f}/>
<path d="M${cx} ${y(1)} L${x(0.27)} ${y(0.66)} L${x(0.13)} ${y(0.66)} L${x(0.39)} ${y(0.36)} L${x(0.21)} ${y(0.36)} L${x(0.5)} ${y(0.12)} L${x(-0.5)} ${y(0.12)} L${x(-0.21)} ${y(0.36)} L${x(-0.39)} ${y(0.36)} L${x(-0.13)} ${y(0.66)} L${x(-0.27)} ${y(0.66)} Z" ${f}/>`;
};
const spiral = (cx: number, cy: number, r: number, turns = 3) => {
  const n = 90;
  return (
    'M' +
    Array.from({ length: n + 1 }, (_, i) => {
      const a = (i / n) * turns * 2 * Math.PI,
        q = (r * i) / n;
      return `${(cx + q * Math.cos(a)).toFixed(1)} ${(cy + q * Math.sin(a)).toFixed(1)}`;
    }).join(' L')
  );
};

const SYMBOLS: Record<SymbolKind, [number, number, string]> = {
  // butt seen from behind: hips, two round cheeks, the crack, creases under the cheeks
  ass: [
    300,
    260,
    `
<path d="M52 18 C30 80 18 150 40 196 C62 248 138 252 150 200 C162 252 238 248 260 196 C282 150 270 80 248 18" ${f}/>
<path d="M150 40 L150 196" ${s}/>
<path d="M70 222 Q100 238 128 226 M172 226 Q200 238 230 222" ${thin}/>
<path d="M84 100 q10 -8 20 0 M196 100 q10 -8 20 0" ${thin} stroke-width="6"/>`
  ],
  // fist with the middle finger up
  finger: [
    200,
    260,
    `
<path d="M40 150 L40 212 Q42 252 92 252 L128 252 Q170 250 172 210 L172 170" ${f}/>
<path d="M78 146 L78 34 Q78 10 100 10 Q122 10 122 34 L122 146" ${f}/>
<path d="M88 36 Q100 26 112 36 L112 54 Q100 60 88 54 Z" ${thin} stroke-width="5"/>
<path d="M78 138 Q78 122 60 122 Q40 122 40 144 Q40 164 60 166 Q78 166 78 150" ${f}/>
<path d="M122 138 Q122 122 140 122 Q158 122 158 142 Q158 164 140 164 Q122 164 122 150" ${f}/>
<path d="M158 146 Q160 140 168 140 Q178 142 178 160 Q178 180 164 182 Q158 180 158 172" ${f}/>
<path d="M42 198 Q86 178 132 200" ${s}/>`
  ],
  // classic swirl pile, stink lines and flies
  shit: [
    280,
    270,
    `
<path d="M48 256 Q14 256 22 226 Q30 202 66 204 L214 204 Q252 204 258 228 Q262 256 230 256 Z" ${f}/>
<path d="M70 204 Q42 200 50 172 Q58 150 90 152 L190 152 Q224 152 228 176 Q232 202 206 204" ${f}/>
<path d="M98 152 Q76 140 88 116 Q100 98 124 100 Q148 92 142 62 Q182 76 184 112 Q186 144 168 152" ${f}/>
<path d="M92 226 q20 8 40 0 M150 178 q16 6 32 0" ${thin}/>
${stink(60, 120)}${stink(226, 128)}${fly(250, 40)}${fly(36, 46)}`
  ],
  // pursed open mouth with a lollipop going in
  mouthLolly: [
    430,
    260,
    `
${lips(110, 136, 104, 80, 0.34)}
<path d="M118 138 L300 130" stroke="${INK}" stroke-width="14" stroke-linecap="round"/>
<circle cx="356" cy="128" r="66" ${f}/>
<path d="${spiral(356, 128, 56, 3)}" fill="none" stroke="${RED}" stroke-width="10" stroke-linecap="round"/>`
  ],
  // open red lips alone, with suction strokes either side
  mouth: [
    300,
    260,
    `${lips(150, 134, 128, 96, 0.36)}
<path d="M14 80 q-10 -12 -2 -30 M14 190 q-10 12 -2 30 M286 80 q10 -12 2 -30 M286 190 q10 12 2 30" ${thin}/>`
  ],
  // two eggs
  eggs: [
    300,
    260,
    `
<path d="M100 30 C40 30 18 140 24 182 C30 232 70 250 100 250 C130 250 170 232 176 182 C182 140 160 30 100 30 Z" ${f}/>
<path d="M200 50 C146 50 126 150 132 188 C138 234 172 250 200 250 C228 250 262 234 268 188 C274 150 254 50 200 50 Z" ${f}/>
<path d="M66 100 Q72 76 88 66 M168 118 Q174 96 188 86" ${thin}/>`
  ],
  // cut-off head: X eyes, tongue out, jagged neck dripping blood
  head: [
    240,
    280,
    `
<path d="M120 14 C56 14 26 64 28 118 C30 168 58 200 90 206 L88 222 L104 214 L116 226 L130 214 L146 224 L152 206 C186 198 212 166 212 116 C212 62 184 14 120 14 Z" ${f}/>
<path d="M64 92 l30 30 M94 92 l-30 30 M148 92 l30 30 M178 92 l-30 30" ${s}/>
<path d="M82 166 Q120 150 160 166" ${s}/>
<path d="M112 162 Q110 196 124 196 Q138 196 134 160" fill="${RED}" stroke="${INK}" stroke-width="7"/>
<g fill="${RED}"><path d="M96 228 q-6 18 0 22 q6 -4 0 -22"/><path d="M128 232 q-7 22 0 28 q7 -6 0 -28"/><circle cx="110" cy="262" r="5"/><circle cx="148" cy="246" r="4"/><circle cx="80" cy="254" r="4"/></g>`
  ],
  // ебало: round face, tiny eyes, huge open screaming mouth with teeth
  face: [
    260,
    260,
    `
<circle cx="130" cy="130" r="118" ${f}/>
<path d="M78 74 l0 18 M182 74 l0 18" ${s}/>
<path d="M58 60 q20 -14 38 -4 M164 56 q18 -10 38 4" ${thin}/>
<path d="M56 128 Q130 110 204 128 Q206 222 130 228 Q54 222 56 128 Z" fill="${HOLE}" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>
<path d="M66 128 l10 18 l10 -20 l12 20 l12 -22 l12 22 l12 -22 l12 22 l12 -22 l12 20 l10 -20 l10 18" fill="${INK}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
<path d="M96 210 Q130 172 166 210" fill="${RED}" stroke="none"/>`
  ],
  // очко: hole in the plank seat of a wooden outhouse, seen from above
  hole: [
    360,
    270,
    `
<path d="M30 190 L330 190 L330 262 L30 262 Z" ${f}/>
<path d="M30 190 L330 190 L292 70 L68 70 Z" ${f}/>
<path d="M130 70 L118 190 M230 70 L242 190 M130 190 L130 262 M230 190 L230 262" ${thin} stroke-width="5"/>
<ellipse cx="180" cy="132" rx="70" ry="34" fill="${HOLE}" stroke="${INK}" stroke-width="10"/>
${stink(152, 102)}${stink(208, 102)}${fly(310, 24)}${fly(52, 28)}`
  ],
  // the stall-wall classic
  dick: [
    320,
    200,
    `
<circle cx="236" cy="150" r="44" ${f}/><circle cx="282" cy="128" r="40" ${f}/>
<path d="M90 56 L246 50 Q292 52 292 90 Q292 130 246 134 L90 130 Z" ${f}/>
<path d="M96 52 C42 38 20 78 26 92 C20 106 42 146 96 134 Q110 93 96 52 Z" ${f}/>
<path d="M30 92 L48 92" ${s}/>
<path d="M14 72 l-12 -8 M12 112 l-12 8 M8 92 l-8 0" ${thin}/>`
  ],
  // лес: three fir trees on one ground line, the middle one tallest (drawn last so it sits in front)
  forest: [
    400,
    270,
    `${fir(82, 254, 196, 140)}${fir(318, 254, 196, 140)}${fir(200, 254, 250, 172)}
<path d="M8 258 L392 258" ${s}/>`
  ],
  // гроб: the six-sided coffin standing up, inner lid edge and a cross
  coffin: [
    220,
    290,
    `
<path d="M70 12 L150 12 L200 84 L154 278 L66 278 L20 84 Z" ${f}/>
<path d="M80 30 L140 30 L180 88 L142 260 L78 260 L40 88 Z" ${thin} stroke-width="5"/>
<path d="M110 74 L110 206 M76 116 L144 116" ${s}/>`
  ],
  // кровать: side view, tall headboard, pillow, blanket with a wavy hem, Z-z of sleep
  bed: [
    400,
    250,
    `
<path d="M20 244 L20 44 Q20 22 42 22 L58 22 Q80 22 80 44 L80 244" ${f}/>
<path d="M328 244 L328 112 Q328 96 344 96 L364 96 Q380 96 380 112 L380 244" ${f}/>
<path d="M80 150 L328 150 L328 202 L80 202 Z" ${f}/>
<path d="M92 150 Q82 112 120 110 L166 110 Q198 112 186 150 Z" ${f}/>
<path d="M176 152 Q166 120 200 118 L314 122 Q330 124 328 150 L328 196 Q298 210 270 196 Q242 210 214 196 Q190 210 176 196 Z" ${f}/>
<path d="M118 76 l26 0 l-26 26 l26 0 M164 40 l18 0 l-18 18 l18 0" ${thin} stroke-width="6"/>`
  ],
  // нож: kitchen knife on a diagonal, riveted handle, blood dripping off the tip
  knife: [
    320,
    260,
    `<g transform="rotate(-28 162 132)">
<rect x="4" y="104" width="118" height="58" rx="24" ${f}/>
<path d="M138 90 L300 90 Q326 90 320 104 Q292 172 200 174 L138 174 Z" ${f}/>
<rect x="120" y="84" width="20" height="96" rx="5" ${f}/>
<circle cx="38" cy="133" r="8" fill="${INK}"/><circle cx="88" cy="133" r="8" fill="${INK}"/>
<path d="M164 124 L290 108" ${thin} stroke-width="5"/></g>
<g fill="${RED}"><path d="M300 70 q-9 24 0 31 q9 -7 0 -31"/><circle cx="306" cy="118" r="7"/><circle cx="288" cy="130" r="5"/></g>`
  ]
};
function doodle(kind: SymbolKind, id: number) {
  const [w, h, body] = SYMBOLS[kind];
  const ph = Math.round((H * h) / 260);
  return `<svg class="sym" viewBox="-8 -8 ${w + 16} ${h + 16}" style="height:${ph}px;width:${Math.round((ph * (w + 16)) / (h + 16))}px"><defs><filter id="r${id}"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="3.5"/></filter></defs><g filter="url(#r${id})">${body}</g></svg>`;
}

// ---------- one rebus → HTML ----------
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const sticker = (src: string, w: number, h: number) =>
  `<span class="stk"><img src="${src}" style="width:${w}px;height:${h}px"></span>`;
// A long word may stand as two rows: split at the space nearest its middle.
function rows(text: string): [string, string] | null {
  const sp = [...text].map((c, i) => (c === ' ' ? i : -1)).filter((i) => i > 0);
  if (!sp.length || text.length < 7) return null;
  const at = sp.reduce((a, b) => (Math.abs(b - text.length / 2) < Math.abs(a - text.length / 2) ? b : a));
  return [text.slice(0, at), text.slice(at + 1)];
}

// A marker comma: round blob with a tail; before the picture it is mirrored (opening comma), as in printed rebuses.
const COMMA = `<path d="M30 10 C48 10 56 24 54 42 C52 70 38 96 12 116" fill="none" stroke="${INK}" stroke-width="15" stroke-linecap="round"/><circle cx="31" cy="31" r="22" fill="${INK}"/>`;
const commas = (n: number, before: boolean) =>
  `<span class="cm${before ? ' bf' : ''}">${Array.from({ length: n }, () => `<svg viewBox="0 0 64 124" style="width:${Math.round(H * 0.26)}px;height:${Math.round(H * 0.5)}px">${COMMA}</svg>`).join('')}</span>`;
// Rebus edits around one picture, read in order: commas (drop letters), crossed letters, swap «А=У», then «+ИЙ».
function edited(p: Part, pic: string) {
  const notes: string[] = [];
  if (p.cross) notes.push(`<b class="ed"><s>${esc(p.cross)}</s></b>`);
  if (p.swap) notes.push(`<b class="ed">${esc(p.swap[0])}<i class="eq"></i>${esc(p.swap[1])}</b>`);
  if (p.add) notes.push(`<b class="ed"><i>+</i>${esc(p.add)}</b>`);
  if (!p.commasBefore && !p.commasAfter && !notes.length) return pic;
  return `<span class="grp">${p.commasBefore ? commas(p.commasBefore, true) : ''}${pic}${p.commasAfter ? commas(p.commasAfter, false) : ''}${notes.length ? `<span class="eds n${notes.length}">${notes.join('')}</span>` : ''}</span>`;
}

export function rebusPage(chosen: Rebus): string {
  const rand = rng(chosen.id);
  // Scale cap per part: Valve stickers go soft past ~2x their pixels; marker doodles and spray letters are vector.
  const CAPS: Record<string, number> = { word: 1.35, symbol: 1.6 };
  const tok = (p: Part, i: number) => {
    const html =
      p.kind === 'text'
        ? tok1(p, i)
        : tok1(p, i).replace(
            /^<span class="tok">([\s\S]*)<\/span>$/,
            (_, inner) => `<span class="tok">${edited(p, inner)}</span>`
          );
    return html.replace(
      '<span class="tok"',
      `<span class="tok" data-cap="${CAPS[p.kind === 'text' ? 'word' : p.kind] ?? 1.2}"`
    );
  };
  const tok1 = (p: Part, i: number) => {
    const rot = ((i % 2 ? 1 : -1) * (2 + rand() * 3)).toFixed(1);
    const wrap = (inner: string, cls = 'rot', r: string | number = rot) =>
      `<span class="${cls}" style="transform:rotate(${r}deg)">${inner}</span>`;
    if (p.kind === 'text') {
      const two = rows(p.value);
      // both forms are rendered; the layout script keeps two rows only when they make the picture clearly bigger
      return `<span class="tok" data-alt="${two ? 1 : 0}" data-pen="${two ? 0.12 + (Math.min(two[0].length, two[1].length) <= 2 ? 0.1 : 0) : 0}">${wrap(`<b class="w1">${esc(p.value)}</b>`, 'w', -Number(rot) / 2)}${two ? wrap(`<b class="w2">${esc(two[0])}<br>${esc(two[1])}</b>`, 'w alt', -Number(rot) / 2) : ''}</span>`;
    }
    if (p.kind === 'symbol') return `<span class="tok">${wrap(doodle(p.value, i), 'mk', Number(rot) / 2)}</span>`;
    if (p.kind === 'hero') return `<span class="tok">${wrap(sticker(p.url, 440, 248))}</span>`;
    if (p.kind === 'ability') return `<span class="tok">${wrap(sticker(p.url, 230, 230))}</span>`;
    if (p.kind === 'item') return `<span class="tok">${wrap(sticker(p.url, 224, 163))}</span>`;
    return '';
  };
  const scratches = Array.from({ length: 26 }, () => {
    const x = rand() * 1536,
      y = rand() * 768,
      l = 30 + rand() * 120,
      a = rand() * 3;
    return `<line x1="${x.toFixed(0)}" y1="${y.toFixed(0)}" x2="${(x + l * Math.cos(a)).toFixed(0)}" y2="${(y + l * Math.sin(a) * 0.3).toFixed(0)}"/>`;
  }).join('');
  const scrawl = ['мид не мой', 'репорт', 'тут был ALEXEEV', 'гг', 'саппорт не нужен'];
  const spots = [
    [640, 330],
    [1180, 350],
    [120, 400],
    [860, 700],
    [300, 40]
  ];
  const tilt = () => (-8 + rand() * 6).toFixed(1);
  return `<!doctype html><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Rubik+Spray+Paint&family=Caveat:wght@700&family=Oswald:wght@700&display=block" rel="stylesheet"><style>
*{margin:0;box-sizing:border-box}body{width:1536px;height:768px;overflow:hidden;position:relative;background:${WALL};color:${INK}}
img{display:block}
.seam{position:absolute;top:0;bottom:0;width:4px;background:#1a1e1c;box-shadow:2px 0 0 #323834}
.screw{position:absolute;width:16px;height:16px;border-radius:50%;background:#3a403c;border:2px solid #1a1e1c}
.ln{position:absolute;display:flex;align-items:center;gap:42px;white-space:nowrap}
.l1{transform-origin:left top}.l2{transform-origin:right top}
.tok{display:block;flex:none;position:relative}
.stk{display:block;background:${INK};padding:9px;border-radius:14px}.stk img{border-radius:8px}
.rot,.mk,.w{display:block}
.w b{display:block;font-weight:400;font-family:'Rubik Spray Paint';color:${INK};line-height:.86}
.w1{font-size:${Math.round(H * 0.8)}px}.w2{font-size:${Math.round(H * 0.5)}px;text-align:center}
.tok .alt,.tok.two>.w:not(.alt){display:none}.tok.two>.alt{display:block}
.sym{display:block;overflow:visible}
.grp{display:flex;align-items:center;gap:12px}
.cm{display:flex;gap:0;align-self:flex-start;margin-top:-6px}.cm svg{display:block;overflow:visible}.cm.bf svg{transform:scaleX(-1)}
.eds{display:flex;flex-direction:column;align-items:flex-start;gap:10px;margin-left:10px;transform:rotate(-4deg)}
.ed{display:block;font-weight:400;font-family:'Rubik Spray Paint';font-size:${Math.round(H * 0.44)}px;line-height:.86;color:${INK};white-space:nowrap}
.eds.n1 .ed{font-size:${Math.round(H * 0.56)}px}
.ed i{font-style:normal;color:${RED};margin:0 .04em}
.ed s{text-decoration:none;position:relative;display:inline-block}.ed s::after{content:'';position:absolute;left:-22%;right:-22%;top:42%;height:.11em;background:${RED};border-radius:.06em;transform:rotate(-42deg)}
.ed .eq{display:inline-block;width:.46em;height:.36em;border-top:.1em solid ${RED};border-bottom:.1em solid ${RED};vertical-align:.16em;margin:0 .08em;transform:rotate(-4deg)}
.sc{position:absolute;font:700 34px Caveat;color:${INK};opacity:.16}
.tag{position:absolute;left:76px;top:22px;font:700 22px Oswald;letter-spacing:.06em;color:${RED}}
.mark{position:absolute;right:76px;top:14px;font:700 40px Caveat;color:${INK};opacity:.7;transform:rotate(-3deg)}
</style>
<i class="seam" style="left:512px"></i><i class="seam" style="left:1024px"></i>
${[
  [490, 40],
  [534, 40],
  [490, 712],
  [534, 712],
  [1002, 40],
  [1046, 40],
  [1002, 712],
  [1046, 712]
]
  .map(([x, y]) => `<i class="screw" style="left:${x}px;top:${y}px"></i>`)
  .join('')}
<svg style="position:absolute;inset:0" viewBox="0 0 1536 768"><g stroke="#4a514c" stroke-width="1.5" opacity=".7">${scratches}</g></svg>
<svg style="position:absolute;inset:0;width:100%;height:100%;opacity:.18;pointer-events:none"><filter id="nz"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#nz)"/></svg>
${spots
  .slice(0, 3)
  .map(
    ([x, y], i) => `<span class="sc" style="left:${x}px;top:${y}px;transform:rotate(${tilt()}deg)">${scrawl[i]}</span>`
  )
  .join('')}
<div class="ln l1"></div><div class="ln l2"></div><div id="pool" style="position:absolute;left:0;top:900px;display:flex;gap:42px;align-items:center">${chosen.parts.map(tok).join('')}</div>
<div class="tag">РЕБУС</div><div class="mark">ALEXEEV</div>
<script>
// Fit: try every split of the parts into two lines (order kept) and every one/two-row form of each word;
// keep the one whose smaller line scale is largest, then scale each line to fill its half of the frame.
const L = 76, R = 76, TOP = 66, BOT = 30, GAP = 42, MID = 20;
function layout() {
  const toks = [...document.querySelectorAll('#pool > .tok')];
  const size = (t) => { const r = [...t.children].filter(c => getComputedStyle(c).display !== 'none').map(c => c.getBoundingClientRect()); return [Math.max(...r.map(x => x.right)) - Math.min(...r.map(x => x.left)), Math.max(...r.map(x => x.bottom)) - Math.min(...r.map(x => x.top))]; };
  const one = toks.map(size);
  toks.forEach(t => t.dataset.alt === '1' && t.classList.add('two'));
  const two = toks.map(size);
  toks.forEach(t => t.classList.remove('two'));
  const W = 1536 - L - R, HH = (768 - TOP - BOT - MID) / 2;
  const words = toks.map((t, i) => t.dataset.alt === '1' ? i : -1).filter(i => i >= 0);
  let best = null;
  for (let mask = 0; mask < 1 << words.length; mask++) {
    const dims = toks.map((t, i) => ((words.indexOf(i) >= 0 && mask >> words.indexOf(i) & 1) ? two[i] : one[i]).concat(+t.dataset.cap));
    for (let k = 1; k < toks.length; k++) {
      const wid = (a) => a.reduce((x, d) => x + d[0], 0) + GAP * (a.length - 1);
      const fit = (a) => Math.min(W / wid(a), HH / Math.max(...a.map(d => d[1])), ...a.map(d => d[2]));
      const a1 = dims.slice(0, k), a2 = dims.slice(k), s1 = fit(a1), s2 = fit(a2);
      // biggest smaller line first; among near-equal ones, the split whose two lines are closest in width (no empty half)
      const pen = words.reduce((x, i, j) => x + (mask >> j & 1) * +toks[i].dataset.pen, 0);
      // plus a small bonus for the width both lines fill, so a short line grows instead of leaving an empty band
      const score = Math.min(s1, s2) - .3 * Math.abs(wid(a1) * s1 - wid(a2) * s2) / W + .15 * (wid(a1) * s1 + wid(a2) * s2) / (2 * W) - pen;
      if (!best || score > best.score + 1e-6) best = { score, mask, k, s1, s2 };
    }
  }
  words.forEach((i, j) => best.mask >> j & 1 && toks[i].classList.add('two'));
  const l1 = document.querySelector('.l1'), l2 = document.querySelector('.l2');
  toks.forEach((t, i) => (i < best.k ? l1 : l2).appendChild(t));
  for (const [ln, sc, half] of [[l1, best.s1, 0], [l2, best.s2, 1]]) {
    const h = ln.getBoundingClientRect().height;
    const top = TOP + half * (HH + MID) + (HH - h * sc) / 2;
    ln.style.top = top + 'px';
    if (half) ln.style.right = R + 'px'; else ln.style.left = L + 'px';
    ln.style.transform = 'scale(' + sc + ')';
  }
  
}
// The renderer waits for data-fonts-ready; a font that never loads must not hang it.
const done = () => document.documentElement.setAttribute('data-fonts-ready', '');
addEventListener('load', () => document.fonts.ready.then(layout).then(done, done));
setTimeout(done, 8000);
</script>`;
}

const WIDTH = 1536;
const HEIGHT = 768;

export async function rebus(context: RubricContext): Promise<RubricSample> {
  const turn = await context.sources.turns?.next('rebus', REBUSES.length);
  const size = REBUSES.length;
  const chosen =
    turn === undefined
      ? REBUSES[Math.floor(context.random() * size)]
      : REBUSES[shuffledOrder(Math.floor(turn / size), size)[turn % size] ?? 0];
  if (chosen === undefined) throw noData('a rebus');
  const options = shuffled([chosen.phrase, ...chosen.wrong], context.random);
  return {
    picture: { html: rebusPage(chosen), width: WIDTH, height: HEIGHT },
    text: '',
    pictureInPoll: true,
    ownText: true,
    poll: quiz('Ребус. Что тут написано?', options, options.indexOf(chosen.phrase), chosen.explanation)
  };
}
