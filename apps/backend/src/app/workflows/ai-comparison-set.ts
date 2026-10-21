import type { SourceEventDto } from '@alexeev/contracts';
import { AppError } from '../../shared/app-error';
import type { Container } from '../container';
import { sourceEventWriter } from './source-event-ai-draft';

// The blind comparison's test set № 2 (owner, 21.10.2026; docs/ai/claude-provider.md §3): eleven writer tasks and two
// lists of ideas, each written by both models through the existing editor. The briefs are the owner's; the Dark
// Carnival facts are the texts of its dota2.com page (read 21.10.2026), so both models get exactly the same source.

export type SetFormat = 'fidit' | 'igrat' | 'standalone' | 'telegram';

export interface SetTask {
  code: string;
  label: string;
  format: SetFormat;
  /** `automatic` posts go through the fact check like the bot's source posts; the owner's tasks do not. */
  mode: 'direct' | 'automatic';
  task: string;
  /** A follow-up written after this task by the same model, with that model's text in its task. */
  after?: string;
}

const NOT_AGAIN = 'Не про Пуджа и не про Инвокера: их уже брали в прошлом тесте.';

const CARNIVAL_LINK = 'https://www.dota2.com/darkcarnival';

const CARNIVAL_HOW = `Как всё устроено: играя во время события, получаешь тематические билеты — их тип зависит от выбранного героя. Билеты прокладывают путь по поезду Магистра манежа из последнего вагона к машинному отделению, открывают сюжет и дают награды.
Основной сюжет бесплатный для всех игроков.
Комплект тайных комнат (платный): сразу даёт крипов и музыку «Тёмного карнавала» и особые билеты тайных комнат — они открывают скрытые области поезда с побочными историями и отдельными наградами.
Скидочные монеты: десять монет меняются в магазине «Тёмного карнавала» на скидку для покупки (размер скидки зависит от региона и валюты).
Конфеты: лавка конфет вернулась «по многочисленным просьбам» — конфеты меняются на наборы, варды, курьеров и не только.
Аксессуары: четыре тематических набора для Phantom Assassin, Crystal Maiden, Invoker и Magnus спрятаны в поезде, получить их можно только продвигаясь по сюжету.
Карнавальные сувениры: декорации для витрин, загрузочные экраны, граффити и смайлики.
Ещё в событии: сокровищница Treasure of Wonders с 15 наборами и пять личностей-автоматонов (о них — во втором посте).
Цены Valve на странице не называет.`;

const CARNIVAL_COSMETICS = `Сокровищница Treasure of Wonders: 15 карнавальных наборов, «по-злодейски модных и по-цирковому роскошных». Наборы: Drow Ranger — Motley Marauder, Undying — Court Fester, Queen of Pain — Mistress of Ceremonies, Arc Warden — Palms of Prophecy, Troll Warlord — Lute and Pillager, Death Prophet — Mademoiselle Macabaret, Phantom Lancer — Flim-Flam Felidae, Dawnbreaker — Bar Belle, Templar Assassin — Vaudevillain, Monkey King — Bonobo the Clown, Primal Beast — Mane Attraction, Pudge — The Woodcutter (личность прилагается), Dark Willow — Fairy Godmummer, Io — Madame Scrio, Mirana — Selemene Showgirl. На цену действуют скидочные монеты события; саму цену Valve на странице не называет.
Личности-автоматоны (пять героев «разобраны по кусочкам и собраны обратно в заводных автоматонов»; у каждой новые анимации, уникальные эффекты и иконки, изменённая обработка голоса):
— Axe: «двигатель убийственной ярости с единственной целью: убить всех и вся»; его чуть не расплавили.
— Oracle: как трагическая греческая героиня, видит будущее и не может на него влиять; его не слушают, «потому что он крайне бесит».
— Legion Commander: давит врагов каблуком роботизированного сапога и, в отличие от человеческой версии, куда менее склонна останавливаться.
— Morphling: «жидкость в метафорическом смысле», а на деле скован из настоящей стали. «До чего же техника дошла».
— Bristleback: работает на чистейших машинных маслах первого отжима, но не откажется и от отработки, «если уж наливают».`;

export const COMPARISON_SET: readonly SetTask[] = [
  {
    code: 'R01',
    label: 'Учу фидить · Earthshaker',
    format: 'fidit',
    mode: 'direct',
    task: 'Учу фидить на Earthshaker — как испортить идеальную драку и при этом считать себя гением. Полноценный юмористический сценарий с одной развивающейся комедийной идеей.'
  },
  {
    code: 'R02',
    label: 'Учу фидить · тема на выбор модели',
    format: 'fidit',
    mode: 'direct',
    task: `Учу фидить. Тему выбери сам: героя, ситуацию и центральную шутку — и напиши сценарий. Не про Earthshaker. ${NOT_AGAIN}`
  },
  {
    code: 'R03',
    label: 'Учусь играть · Рубик',
    format: 'igrat',
    mode: 'direct',
    task: `Учусь играть на Рубике — украл не ту способность и не понял, что с ней делать.
Тестовые факты для сценария (это учебная ситуация теста, не реальный матч автора): мид, 14-я минута, драка у Рошана. Хотел украсть Чёрную дыру у Энигмы, но первым прожал заклинание их Огр-маг — украл Огненный взрыв. Пока думал, куда его кинуть, Энигма прожал Чёрную дыру, и команда проиграла драку. Огненный взрыв я в итоге кинул в крипа.
Хук сразу с ошибки или провала: без приветствий, без названия рубрики и без заставок.`
  },
  {
    code: 'R04',
    label: 'Учусь играть · тема на выбор модели',
    format: 'igrat',
    mode: 'direct',
    task: `Учусь играть. Предложи сам интересную игровую ситуацию для ролика. Не выдумывай реальные матчи, воспоминания или действия автора: если для сценария не хватает фактов, предложи идею и задай уточняющие вопросы. ${NOT_AGAIN}`
  },
  {
    code: 'R05',
    label: 'Рилс без рубрики · кто виноват',
    format: 'standalone',
    mode: 'direct',
    task: 'Рилс без рубрики: когда пять игроков в команде точно знают, кто виноват в поражении, но никто не знает, что делать дальше. Нужны узнаваемая ситуация, развитие шутки и сильный финал.'
  },
  {
    code: 'R06',
    label: 'Рилс без рубрики · тема на выбор модели',
    format: 'standalone',
    mode: 'direct',
    task: `Рилс без рубрики про Доту. Тему, хук, структуру и концовку придумай сам. Не бери идеи про Earthshaker, Рубика, фид и споры о виноватом в команде; не ограничивайся шутками про плохого керри, тупых саппортов и минус рейтинг. ${NOT_AGAIN}`
  },
  // TG01, TG02 and TG03 take their facts from «Источники» when the set starts (`buildSetTasks`).
  { code: 'TG01', label: 'Пост в Telegram · тема из источников', format: 'telegram', mode: 'automatic', task: '' },
  {
    code: 'TG02',
    label: 'Пост в Telegram · вторая тема из источников',
    format: 'telegram',
    mode: 'automatic',
    task: '',
    after: 'TG01'
  },
  { code: 'TG03', label: 'Пост в Telegram · балансный патч', format: 'telegram', mode: 'automatic', task: '' },
  {
    code: 'TG04',
    label: '«Тёмный карнавал» · пост 1/2: как участвовать',
    format: 'telegram',
    mode: 'automatic',
    task: `Повод: событие Dota 2 «Тёмный карнавал». Серия из двух постов, это пост 1/2: что практически делать игроку — билеты и продвижение по событию, что бесплатно, за что платить и что это реально даёт, какие награды стоят внимания.
Не пересказывай сюжет, персонажей и историю поезда. Подача весёлая, местами дерзкая, но полезная; шутки не подменяют факты. Пиши только по фактам ниже.
Ссылка на событие: ${CARNIVAL_LINK}
Факты со страницы события:
<<<
${CARNIVAL_HOW}
>>>`
  },
  {
    code: 'TG05',
    label: '«Тёмный карнавал» · пост 2/2: сокровищница и автоматоны',
    format: 'telegram',
    mode: 'automatic',
    after: 'TG04',
    task: `Повод: событие Dota 2 «Тёмный карнавал». Серия из двух постов, это пост 2/2: сокровищница Treasure of Wonders, новые наборы и герои-автоматоны — самая интересная косметика, что случилось с автоматонами, какие наборы выглядят смешно, нелепо или необычно, что реально может заинтересовать игрока.
Авторские оценки вроде «выглядит как кусок железного говна» можно, если это явно мнение. Не повторяй объяснение билетов и платных возможностей из первого поста. Пиши только по фактам ниже.
Ссылка на событие: ${CARNIVAL_LINK}
Факты со страницы события:
<<<
${CARNIVAL_COSMETICS}
>>>`
  },
  {
    code: 'IDEA-01',
    label: 'Идеи · 8 тем «Учу фидить»',
    format: 'fidit',
    mode: 'direct',
    task: `Это не сценарий, а список идей: придумай 8 тем для юмористических Reels «Учу фидить». Ответь черновиком (kind draft): весь список — в поле text, в hooks — три самые сильные первые фразы.
Каждая тема — оригинальная комедийная ситуация из Dota 2 на намеренно неправильной логике игрока, его ошибках или абсурдных оправданиях; её можно развить в полноценный сценарий, а не в одну шутку. Разные герои и разные комедийные приёмы; без банальностей про плохого керри, бесполезных саппортов и проигранный рейтинг. ${NOT_AGAIN} Должно быть понятно, что это юмор, а не настоящая стратегия.
Для каждой идеи коротко: 1) название; 2) игровая ситуация; 3) главная комедийная идея; 4) пример сильной первой фразы; 5) как развить шутку до финала. Весь список — до 6000 знаков.`
  },
  {
    code: 'IDEA-02',
    label: 'Идеи · 8 тем «Учусь играть»',
    format: 'igrat',
    mode: 'direct',
    task: `Это не сценарий, а список идей: придумай 8 реальных, практически применимых тем для «Учусь играть в Доту» — интересных человеку, который учится играть (например: стаки нейтралов, отводы, агро крипов, варды, TP, когда брать BKB, почему теряешь золото и опыт на линии, как выбирать предметы — это направления, а не готовый список). Ответь черновиком (kind draft): весь список — в поле text, в hooks — три самые сильные первые фразы.
Автор не профессионал и не изображает эксперта: каждая тема — будущий эксперимент новичка, а не выдуманный сыгранный матч, ошибка или вывод. Если нужны актуальные сведения о механике, напиши, что их надо проверить по игровым источникам; не придумывай тайминги, цифры и изменения патча. ${NOT_AGAIN}
Для каждой идеи коротко: 1) название; 2) какую механику изучить; 3) почему это интересно новичку; 4) какой эксперимент провести в игре; 5) вариант сильного хука; 6) как развить историю с юмором; 7) какие факты нужны от автора после игры. Весь список — до 6000 знаков.`
  }
];

/** The answer of a list of ideas is longer than a post. */
export const IDEAS_OUTPUT_TOKENS = 8000;

const SKIP_IN_DIGEST = /carnival|карнавал|trove|treasure|сокровищ/i;
/** A balance patch by its title: Steam files «7.41f Gameplay Patch» as news, not as a patch (DEV, 21.10.2026). */
const BALANCE = /gameplay patch|геймплейн|балансн|\b7\.\d+[a-z]?\b/i;
const UPDATE = /\bupdate\b|обновлени/i;

const isSteam = (event: SourceEventDto) => event.id.startsWith('steam_news:');

/** The Steam announcements of «Источники», newest first: the recent ones and those from before the watcher. */
async function events(container: Container): Promise<SourceEventDto[]> {
  const pages = await Promise.all(
    (['active', 'past'] as const).map((view) => container.sourceEvents.list({ view, page: 1, limit: 30 }))
  );
  return pages
    .flatMap((page) => page.items)
    .filter(isSteam)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function digestTask(news: readonly SourceEventDto[]): string {
  const lines = news
    .slice(0, 8)
    .map(
      (event, index) =>
        `${index + 1}. ${event.title} (${event.publishedAt.slice(0, 10)}) — ${event.summary.slice(0, 300)} Источник: ${event.sourceUrl}`
    );
  return `Обычный самостоятельный пост в Telegram. Выбери из подтверждённых новостей ниже одну актуальную и интересную тему и напиши о ней пост с авторским углом: интересная деталь обновления, механики, предмета или обсуждения. Пиши только по фактам новости и в конце укажи, какой источник взял (ссылкой). Не про патч и не про «Тёмный карнавал».
Новости из «Источников»:
<<<
${lines.join('\n')}
>>>`;
}

/** The set with its source tasks filled in from «Источники»: the same text goes to both models. */
export async function buildSetTasks(container: Container, onError: (error: unknown) => void): Promise<SetTask[]> {
  const all = await events(container);
  const news = all.filter(
    (event) =>
      event.type === 'news' &&
      !SKIP_IN_DIGEST.test(event.title) &&
      !BALANCE.test(event.title) &&
      !UPDATE.test(event.title)
  );
  if (news.length < 2) throw new AppError('CONFLICT', 'Too few news in the sources', { reason: 'NO_SOURCES' });
  const patch = all.find((event) => BALANCE.test(event.title));
  if (patch === undefined) throw new AppError('CONFLICT', 'No patch in the sources', { reason: 'NO_SOURCES' });
  const patchTask = await sourceEventWriter({ repo: container.dotaRepository, onError }).task(
    patch.id.slice('steam_news:'.length)
  );
  const digest = digestTask(news);
  const filled: Record<string, string> = {
    TG01: digest,
    TG02: digest,
    TG03: `${patchTask}
Выбери действительно интересные изменения, объясни, почему они важны игрокам, — авторский разбор, а не переписанный патчноут. Не перечисляй всё подряд, не выдумывай последствия и не объявляй героя имбой без оснований.`
  };
  return COMPARISON_SET.map((task) => ({ ...task, task: filled[task.code] ?? task.task }));
}

/** The task of a follow-up post: the same model's first post, so the second one does not repeat it. */
export function followUpTask(task: string, code: string, first: string | null): string {
  if (first === null) return task;
  const what = code === 'TG02' ? 'Возьми другую тему и другой редакторский угол.' : 'Не повторяй его.';
  return `${task}
Твой предыдущий пост этой серии уже написан (${what}):
<<<
${first.slice(0, 1500)}
>>>`;
}
