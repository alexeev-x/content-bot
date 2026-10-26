import type { RubricKey } from './samples';

// Each rubric's own task for the AI writer (owner, 26.10.2026: «общее все получают, а уже детали рубрики — каждая
// свою инструкцию»). The writer's general rules (modules/ai/rubric-writer.ts) hold the channel's voice and the facts;
// here is how this rubric's post is built and how it ends. A rubric not polished yet keeps the former general rules
// (STANDARD) until the owner reworks it.

const STANDARD = [
  'Строки черновика вида «Название: было → стало» (иногда со знаком ▲ или ▼ в начале) — это таблица: оставь каждую отдельной строкой, в том же порядке, с теми же знаками, названиями и цифрами; только героя в них можно назвать так, как его зовут игроки. Не пиши, усилили это или ослабили, если черновик сам этого не говорит.',
  'Концовка — живой вопрос к подписчикам, чтобы хотелось ответить в комментариях (играют ли они на этих героях, кого теперь пикать, кто страдает больше всех).',
  'Если есть опрос — не называй правильный ответ и не подсказывай его; закончи призывом проголосовать или написать в комментарии.'
].join('\n');

// «Кто теперь имба?» in words, with humour (owner, 26.10.2026: «просто словами … теперь пиздячка будет больше»), and
// no closing question: the poll under the post asks it.
const WHO_IS_IMBA = [
  'Первая строка простая, по смыслу «После 7.41f сильнее всех усилили этих героев»; сколько героев усилили всего и что есть другие — не пиши.',
  'Строки героев — не таблица: перескажи каждую одной живой смешной фразой своими словами — что герою подняли и что это значит в игре (бьёт больнее, мана почти не нужна, быстрее фармит, дольше живёт).',
  'Цифры из строки вставь в эту фразу как есть («было … стало …» не пиши), героя называй как игроки. Каждый герой — отдельной строкой.',
  'Если у героя есть «зато порезали», скажи и это, коротко и с подколкой.',
  'Без вопроса в конце и без призыва голосовать или писать в комментарии: опрос под постом спросит сам. Закончи последним героем или короткой фразой без вопроса.'
].join('\n');

export const RUBRIC_BRIEFS: Record<RubricKey, string> = {
  patch_broken: STANDARD,
  who_is_imba: WHO_IS_IMBA,
  nerf_or_buff: STANDARD,
  whose_ability: STANDARD,
  files_dont_lie: STANDARD,
  who_gets_nerfed: STANDARD,
  valve_seriously: STANDARD,
  valve_time: STANDARD,
  rate_it: STANDARD,
  who_beats_whom: STANDARD,
  guess_by_numbers: STANDARD,
  guess_winrate: STANDARD,
  ban_or_pick: STANDARD,
  rank_meta: STANDARD,
  poison_for_low: STANDARD,
  daily_record: STANDARD,
  hero_peak: STANDARD,
  anti_build: STANDARD,
  forgotten_hero: STANDARD,
  did_you_know: STANDARD,
  item_exam: STANDARD,
  tier_list: STANDARD,
  carry_on_five: STANDARD,
  combo_math: STANDARD,
  horoscope: STANDARD,
  workshop_set: STANDARD,
  rebus: STANDARD,
  guess_streak: STANDARD,
  tier_list_vote: STANDARD,
  guess_match: STANDARD,
  fake_item: STANDARD,
  whose_build: STANDARD
};
