import { shuffledOrder } from './bank-order';
import { escapeHtml } from './picture';
import { pick, type RubricContext, type RubricSample, shuffled } from './types';

// «Токсик-бинго» (owner, 30.10.2026, with the old «Тир-лист хуйни» merged in): the rubric's posts alternate between a
// 5×5 bingo card of chat lines and match moments and a tier list of one theme. Both banks go out in a shuffled order
// without repeats; the texts are final as written (no AI), the picture is code.

interface TierList {
  theme: string;
  tiers: Record<'S' | 'A' | 'B' | 'C' | 'D', string[]>;
}

const CHAT_CELLS: readonly string[] = [
  '«мид где, блять?» на 3-й минуте',
  '«гг» на 10-й при счёте 3:4',
  '«репорт мид» до первой крови',
  '«?» в общий чат после твоей смерти',
  '«изи» от врага, который сдох 12 раз',
  '«ебать ты рак»',
  '«руки из жопы, удали доту»',
  '«керри или фид» ещё на пиках',
  '«я не саппорт, сам ставь варды»',
  '«у меня пинг 300, отъебитесь»',
  '«мышка залипла» после соло-смерти',
  '«ты чё делаешь, долбоёб?»',
  '«тима дно» от игрока 1/9',
  '«где все, ебланы?» — прыгнул в пятерых',
  '«смурф ебучий, репорт»',
  '«нахуя ты это купил?»',
  '«не трогай мой лес, сука»',
  '«зачем ты прыгнул?» — тишина',
  '«мут всем» — и пишет дальше',
  '«не флеймим» — и флейм на страницу',
  '«ты в каком ранге такой умный?»',
  '«учись играть, долбоёб» от Рекрута',
  '«кто пикнул это говно?»',
  '«дайте мид или фид»',
  '«ща вернусь» — не вернулся',
  'Пинг «опасность» 40 раз подряд',
  '«отдайте шмот, я ливаю»',
  '«твою мамку ебал» в общем чате',
  '«го фф» — а вы не пятёркой',
  '«я в пати с дебилами»',
  '«я тебя запомнил, сука»',
  '«на кого ты фармишь, уёбок?»',
  '«у меня на нём 2000 игр» — он 0/8',
  '«где тп, долбоёб?»',
  '«пик говно, гг» ещё до горна',
  '«харош» после вайпа',
  '«керри ебучий, иди в файт»',
  '«мать продам, дайте мид»',
  '«у них читер» — тебя просто хукнули',
  '«я спать, бб» на 20-й минуте',
  '«пятёрка, где варды, чмо?»',
  '«го 1 на 1 на миде, сука»',
  '«где хил, сука?» — у вас нет хилера',
  '«всё, ливаю» — доиграл до трона',
  '«отдай фарм, я вывезу» — он 0/5'
];
const GAME_CELLS: readonly string[] = [
  'Саппорт купил Мидас',
  'Керри в лесу, пока вам ебут базу',
  'Тиммейт ливнул на 5-й минуте',
  'Ни одного варда к 15-й минуте',
  'Тиммейт продал шмот и стоит на фонтане',
  'Рапира упала врагу',
  'Аегис забрал саппорт',
  'Рошана спиздили, вы стояли рядом',
  'Три керри и ни одного саппорта',
  'БКБ нажал на секунду позже стана',
  'БКБ за игру не купил никто',
  'Умер с ТП в кармане',
  'Тебя добили крипы, враг пишет «?»',
  'Проебали 20 тысяч преимущества',
  'Катка на 70 минут, на работу в 7',
  'Вард стоит у своего фонтана',
  'Враг поставил паузу, когда вы пушили',
  'Сдох с полным Стиком',
  'Саппорт сдох с полным слотом вардов',
  'Мид пошёл за руной и не вернулся',
  'Трон снесли, пока ты был в лавке',
  'Смок сломали на втором шаге',
  'Блинканул не туда — прямо в пятерых',
  'Выкупился и сдох через 10 секунд',
  'Сдох, пока смотрел в лавку',
  'Тиммейт забанил твоего героя',
  'Двое пошли за Мудростью, вернулся один',
  'Победил с КДА 0/11 — керри вывез',
  'Бегал без сапог до 15-й минуты',
  'Сдох от лесных крипов на 4-й минуте',
  'Купил Шард, а что даёт — хуй знает',
  'Гем упал врагу через минуту',
  'Отошёл посрать — вернулся к «гг»',
  'Матч нашёлся, когда ты сел на толчок',
  'Пудж-мид хукает крипов',
  'Антимаг вышел из леса на 40-й',
  'Сдох на мине Течиса у своей вышки',
  'Сларк ушёл с 1 хп, вернулся с полным',
  'Войд захронил всю свою команду',
  'Энигма поймал Блэкхолом одного крипа',
  'Шейкер прыгнул, Эхо — по крипам',
  'Мипо в первый раз. В рейтинге',
  'Инвокер за 40 минут нажал 3 скилла',
  'Рики ебёт всех, гем никто не купил',
  'Снайпер бьёт из тумана, вы терпите',
  'Баратрум прилетел к тебе в пятый раз',
  'Вивер сфармил весь твой лес',
  'Фантомка кританула тебя на 1200',
  'Спектра нажала ульту — и не прыгнула',
  'Бристалбэк выиграл файт жопой к врагам',
  'Акс прыгнул, крутанулся, ты сдох',
  'Лион пальцем вылечил Абадона',
  'Огр выбил мультикаст х4 по крипу',
  'Дум ультанул саппорта, керри ушёл',
  'Аппарат промазал ультой с базы',
  'Зевс ультой забрал твоё убийство',
  'Мирана проебала стрелу пятый раз',
  'Висп увёз керри под их фонтан',
  'Цмка сдохла в ульте с Глиммером',
  'Легионка дуэльнула и проиграла',
  'Лагуна Лины прилетела в Линкен',
  'Фурион телепортнулся в пятерых',
  'Венга свапнула тебя, а не врага',
  'Тини кинул тебя под их вышку',
  'Бабка выплюнула тебя во врагов',
  'Гуля залез в тебя, сдох только ты',
  'Даззл забыл про крест — ты сдох',
  'Джаггер ультанул в крипов',
  'Марс закрылся в арене с пятерыми',
  'Диз кинул поле — враги уже ушли',
  'Убил себя об варда Пугны',
  'СФ промахнулся всеми тремя койлами',
  'Ваша Нага спела, когда вы добивали',
  'Люкан снёс базу, пока вы дрались',
  'Змеи Шамана снесли вышку за 5 секунд'
];
const TIER_LISTS: readonly TierList[] = [
  {
    theme: 'Кого винят в сливе',
    tiers: {
      S: ['Мидера'],
      A: ['Пятёрку без вардов'],
      B: ['Керри из леса'],
      C: ['Пинг', 'Того, кто пикал последним'],
      D: ['Себя']
    }
  },
  {
    theme: 'Оправдания после слива',
    tiers: {
      S: ['«Тима дно»'],
      A: ['«У них смурф»', '«Пинг»'],
      B: ['«Мышка залипла»'],
      C: ['«Герой говно, нерфьте»'],
      D: ['«Я обосрался»']
    }
  },
  {
    theme: 'Что пишут после твоей смерти',
    tiers: {
      S: ['«?»'],
      A: ['«Ебать ты рак»', '«Репорт»'],
      B: ['«Руки из жопы»'],
      C: ['«Удали доту»'],
      D: ['«Ничего, бро»']
    }
  },
  {
    theme: 'Худшие тиммейты',
    tiers: {
      S: ['Ливер'],
      A: ['Токсик в войсе', 'Пингующий всё подряд'],
      B: ['Молчун с репортом после игры'],
      C: ['Чавкающий в микрофон'],
      D: ['Нормальный (не видели)']
    }
  },
  {
    theme: 'Звуки из войса',
    tiers: {
      S: ['Чавканье'],
      A: ['Слив унитаза', 'Собака'],
      B: ['Дыхание в микрофон'],
      C: ['Телевизор'],
      D: ['Тишина (он ливнул)']
    }
  },
  {
    theme: 'Почему нет вардов',
    tiers: {
      S: ['«Я не саппорт»'],
      A: ['Купил Мидас'],
      B: ['Поставил у своего фонтана'],
      C: ['Деньги ушли на Даггер'],
      D: ['Вытащили через минуту']
    }
  },
  {
    theme: 'Куда уходит керри вместо файта',
    tiers: {
      S: ['В лес'],
      A: ['В лес врага', 'На боковую пушить'],
      B: ['В лавку'],
      C: ['На фонтан хилиться'],
      D: ['В файт, когда все сдохли']
    }
  },
  {
    theme: 'Пики тиммейтов, от которых горит',
    tiers: {
      S: ['Пудж-мид'],
      A: ['Течис', 'Свен-саппорт'],
      B: ['Мипо в первый раз'],
      C: ['Пятый керри'],
      D: ['Нормальный пик (миф)']
    }
  },
  {
    theme: 'Что покупает пятёрка',
    tiers: {
      S: ['Мидас'],
      A: ['Даэдалус', 'Рапиру'],
      B: ['Фласку себе, керри — хуй'],
      C: ['Шард, не читая'],
      D: ['Варды на последние']
    }
  },
  {
    theme: 'Где сдыхает саппорт',
    tiers: {
      S: ['В реке с вардами'],
      A: ['Под чужой вышкой'],
      B: ['В лесу один, нахуя'],
      C: ['За керри, который сбежал'],
      D: ['Нигде, он ливнул']
    }
  },
  {
    theme: 'Чем заняться, пока ты мёртвый',
    tiers: {
      S: ['Писать хуйню в чат'],
      A: ['Листать телефон'],
      B: ['Смотреть, как сливают'],
      C: ['Сходить посрать'],
      D: ['Учиться на ошибках']
    }
  },
  {
    theme: 'Что орут в войс',
    tiers: { S: ['«Блять!»'], A: ['«Ну ты чё, долбоёб?!»'], B: ['«Я же писал!»'], C: ['«Ебать»'], D: ['«Харош»'] }
  },
  {
    theme: 'Где играют в доту',
    tiers: {
      S: ['На работе'],
      A: ['На толчке с ноута', 'В клубе'],
      B: ['На кухне в 4 утра'],
      C: ['В кровати рядом с девушкой'],
      D: ['Дома, когда все спят']
    }
  },
  {
    theme: 'Что делает мидер после слитой линии',
    tiers: {
      S: ['Пишет «гг»'],
      A: ['Уходит в лес'],
      B: ['Покупает Мидас'],
      C: ['Ганкает и фидит там'],
      D: ['Отыгрывается (никогда)']
    }
  },
  {
    theme: 'Чем пахнет в компьютерном клубе',
    tiers: {
      S: ['Носками'],
      A: ['Дошираком', 'Энергетиком'],
      B: ['Жопой соседа'],
      C: ['Пивом с утра'],
      D: ['Свежим воздухом (нет)']
    }
  },
  {
    theme: 'Самые обидные смерти',
    tiers: {
      S: ['От крипов на линии'],
      A: ['Об варда Пугны, сам'],
      B: ['От Сларка с 1 хп'],
      C: ['В арене Марса'],
      D: ['В файте за трон']
    }
  },
  {
    theme: 'Ответ врагу на «изи»',
    tiers: {
      S: ['«Соси»'],
      A: ['«Репорт»', '«Ты кто, долбоёб?»'],
      B: ['Мут всем'],
      C: ['«Гг вп» сквозь зубы'],
      D: ['Удаление доты']
    }
  },
  {
    theme: 'Худшие покупки за катку',
    tiers: {
      S: ['Рапира, упала врагу'],
      A: ['Мидас на 30-й'],
      B: ['Аганим, не прочитав'],
      C: ['Даггер, ни разу не нажатый'],
      D: ['Вард у своего фонтана']
    }
  },
  {
    theme: 'Что слышат соседи за ночь доты',
    tiers: {
      S: ['«Сука, блять!»'],
      A: ['Удар по столу', '«Мид, ебаный в рот»'],
      B: ['Клавиатура об стену'],
      C: ['«Ещё одну»'],
      D: ['Тишина — ты выиграл']
    }
  },
  {
    theme: 'Чем кончается «последняя катка»',
    tiers: {
      S: ['Ещё пятью катками'],
      A: ['Рассветом', 'Сломанной мышью'],
      B: ['Опозданием на работу'],
      C: ['Удалением доты'],
      D: ['Сном (такого не было)']
    }
  }
];

const CHAT_PER_CARD = 10;
const GAME_PER_CARD = 14;
const SIZE = { width: 1536, height: 768 } as const;
const REACTIONS = {
  bingo: ['🔥 — собрал линию', '🏆 — закрыл всю карточку', '🤡 — половину клеток сделал я сам'],
  tier: ['👍 — всё по факту', '🤬 — S не то, пиши своё в комменты', '🤡 — у меня все пять тиров за одну катку']
} as const;
const TIERS = [
  ['S', '#d63a22', false],
  ['A', '#e08a2c', false],
  ['B', '#d6b84a', false],
  ['C', '#5e6a78', true],
  ['D', '#3d4450', true]
] as const;

/** Short words and numbers stick to the next word, so no line of a cell ends on «к», «и» or «3». */
const glue = (text: string) => text.replace(/(?<=^|\s)([^\s]{1,2}|\d+)\s/gu, '$1\u00a0');

/** `count` entries of the bank for card `card`: the bank's rounds follow each other, so no entry repeats before all went. */
function drawn<T>(bank: readonly T[], card: number, count: number): T[] {
  const result: T[] = [];
  // A card that straddles two rounds may meet the same cell twice: the repeat is skipped and the next one taken, so the
  // card stays full (the bank is far bigger than a card).
  for (let at = card * count; result.length < count && at < card * count + count * 2; at += 1) {
    const entry = bank[shuffledOrder(Math.floor(at / bank.length), bank.length)[at % bank.length] ?? 0];
    if (entry !== undefined && !result.includes(entry)) result.push(entry);
  }
  return result;
}

const CSS = `*{box-sizing:border-box;margin:0;padding:0}html,body{width:${SIZE.width}px;height:${SIZE.height}px;overflow:hidden}
body{background:#101216;color:#f1ebe0;font-family:Manrope,sans-serif;position:relative}
.mark{position:absolute;top:34px;left:56px;font-weight:800;font-size:15px;letter-spacing:7px;color:#8a929e}
.left{position:absolute;left:72px;top:44px;width:400px;height:680px;display:flex;flex-direction:column;justify-content:center;gap:28px}
.title{font-family:Oswald,sans-serif;font-weight:700;font-size:110px;line-height:1.02;text-transform:uppercase;letter-spacing:-.005em}
.title b{color:#d63a22}.sub{font-weight:700;font-size:24px;line-height:1.35;color:#8a929e}
.grid{position:absolute;left:512px;top:44px;width:952px;height:680px;display:grid;grid-template-columns:repeat(5,1fr);grid-template-rows:repeat(5,1fr);gap:8px}
.cell{background:#1b1f26;border:1px solid rgba(255,255,255,.07);border-radius:8px;display:flex;align-items:center;justify-content:center;text-align:center;
padding:10px 14px;font-weight:700;font-size:20px;line-height:1.25;color:#e6e0d6;hyphens:manual;overflow:hidden}
.cell.free{background:#d63a22;border-color:#d63a22;flex-direction:column;gap:4px;color:#101216}
.cell.free span{font-family:Oswald,sans-serif;font-size:44px;line-height:1;text-transform:uppercase;color:#fff}
.cell.free small{font-weight:800;font-size:18px;color:#101216}
.rows{position:absolute;left:512px;top:44px;width:952px;height:680px;display:flex;flex-direction:column;gap:10px}
.row{flex:1 1 0;display:flex;gap:10px;min-height:0}
.tab{width:110px;flex:none;border-radius:8px;display:flex;align-items:center;justify-content:center;font-family:Oswald,sans-serif;font-size:64px;line-height:1;color:#101216}
.tab.light{color:#f1ebe0}
.chips{flex:1;background:#1b1f26;border:1px solid rgba(255,255,255,.07);border-radius:8px;display:flex;flex-wrap:wrap;align-items:center;align-content:center;gap:4px 18px;padding:0 32px;overflow:hidden}
.chip{font-weight:800;font-size:40px;line-height:1.15;color:#f1ebe0}
.chip+.chip::before{content:'/';color:#5e6a78;margin-right:14px;font-weight:700}`;

// The page marks <html data-fonts-ready> once the fonts are in (or after 8 s), as every picture page does. Then no text
// ever leaves its box: the title, every cell and every tier row shrink until what they hold fits inside.
const FIT = `<script>(()=>{const done=()=>document.documentElement.setAttribute('data-fonts-ready','');
const inside=(box,padX,padY)=>{const b=box.getBoundingClientRect();return [...box.children].every((c)=>{const r=c.getBoundingClientRect();
return r.left>=b.left+padX-1&&r.right<=b.right-padX+1&&r.top>=b.top+padY-1&&r.bottom<=b.bottom-padY+1})};
const shrink=(fits,size,min,set)=>{let s=size;set(s);while(!fits()&&s>min){s-=1;set(s)}};
Promise.all(['700 60px Oswald','700 20px Manrope','800 20px Manrope'].map((f)=>document.fonts.load(f,'Ёа')))
.then(()=>document.fonts.ready).then(()=>{
const t=document.querySelector('.title');
shrink(()=>t.scrollWidth<=400&&t.getBoundingClientRect().height<=520,130,48,(s)=>{t.style.fontSize=s+'px'});
document.querySelectorAll('.cell:not(.free)').forEach((c)=>{const n=c.firstElementChild;
shrink(()=>n.scrollWidth<=n.clientWidth&&n.getBoundingClientRect().height<=c.clientHeight-20,20,10,(s)=>{n.style.fontSize=s+'px'})});
document.querySelectorAll('.chips').forEach((box)=>{const chips=[...box.children];
shrink(()=>inside(box,32,4),40,14,(s)=>chips.forEach((c)=>{c.style.fontSize=s+'px'}))});
}).then(done,done);setTimeout(done,8000);})();</script>`;

const page = (body: string) =>
  `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@700&amp;family=Manrope:wght@700;800&amp;display=block&amp;subset=cyrillic" rel="stylesheet">
<style>${CSS}</style></head><body><div class="mark">ALEXEEV</div>${body}${FIT}</body></html>`;

const caption = (lead: string, kind: keyof typeof REACTIONS) => [lead, '', ...REACTIONS[kind]].join('\n');

function bingo(card: number | undefined, context: RubricContext): RubricSample {
  const cells =
    card === undefined
      ? [
          ...shuffled(CHAT_CELLS, context.random).slice(0, CHAT_PER_CARD),
          ...shuffled(GAME_CELLS, context.random).slice(0, GAME_PER_CARD)
        ]
      : [...drawn(CHAT_CELLS, card, CHAT_PER_CARD), ...drawn(GAME_CELLS, card, GAME_PER_CARD)];
  const html = shuffled(cells, context.random).map(
    (cell) => `<div class="cell"><span>${escapeHtml(glue(cell))}</span></div>`
  );
  html.splice(12, 0, '<div class="cell free"><span>Тильт</span><small>клетка даром</small></div>');
  const body = `<div class="left"><div class="title">Токсик-<br><b>бинго</b></div><div class="sub">Отмечай всё, что было<br>в сегодняшней катке</div></div><div class="grid">${html.join('')}</div>`;
  return {
    picture: { html: page(body), ...SIZE },
    text: caption('Токсик-бинго на сегодня. Собрал линию — пиши в комменты, какую.', 'bingo'),
    ownText: true,
    poll: null
  };
}

function tierPage(list: TierList): string {
  const words = list.theme.split(' ');
  const last = words.pop() ?? '';
  const head = words.length === 0 ? '' : `${escapeHtml(words.join(' '))} `;
  const rows = TIERS.map(([tier, color, light]) => {
    const chips = list.tiers[tier].map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join('');
    return `<div class="row"><div class="tab${light ? ' light' : ''}" style="background:${color}">${tier}</div><div class="chips">${chips}</div></div>`;
  }).join('');
  return page(
    `<div class="left"><div class="title">${head}<b>${escapeHtml(last)}</b></div><div class="sub">Тир-лист хуйни</div></div><div class="rows">${rows}</div>`
  );
}

function tierList(card: number | undefined, context: RubricContext): RubricSample {
  const size = TIER_LISTS.length;
  const chosen =
    (card === undefined ? undefined : TIER_LISTS[shuffledOrder(Math.floor(card / size), size)[card % size] ?? 0]) ??
    pick(TIER_LISTS, context.random);
  const theme = chosen.theme.charAt(0).toLowerCase() + chosen.theme.slice(1);
  return {
    picture: { html: tierPage(chosen), ...SIZE },
    text: caption(`Тир-лист хуйни: ${theme}.`, 'tier'),
    ownText: true,
    poll: null
  };
}

export async function toxicBingo(context: RubricContext): Promise<RubricSample> {
  const turn = await context.sources.turns?.next('toxic_bingo', TIER_LISTS.length * 2);
  if (turn === undefined) return context.random() < 0.5 ? bingo(undefined, context) : tierList(undefined, context);
  const card = Math.floor(turn / 2);
  return turn % 2 === 0 ? bingo(card, context) : tierList(card, context);
}
