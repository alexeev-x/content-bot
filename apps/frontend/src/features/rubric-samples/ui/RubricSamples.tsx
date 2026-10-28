import type { RubricSampleKey } from '@alexeev/contracts';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { Button } from '../../../shared/ui';
import { useSendRubricSample } from '../api/rubric-samples-api';
import styles from './RubricSamples.module.css';

type Need = 'ready' | 'stratz' | 'later';
// Rubrics the owner approved leave the list (owner, 26.10.2026: «убирай те рубрики, которые мы утвердили»):
// 1 «Кого понерфили», 2 «Кто теперь имба?», 3 «Нерф или баф?», 4 «Чья способность?», 5 «Утечка недели»; 6–10
// «Кого понерфят?», «Valve, ты серьёзно?», «Валв-тайм», «Оцениваем», «Кто кого перебьёт?» (27.10.2026); 11 «Сеты из
// мастерской», 12 «Гайд на героя» (28.10.2026).
const RUBRICS: { key: RubricSampleKey; label: string; note: string; need: Need }[] = [
  { key: 'what_if', label: '13. Что если…', note: 'сценка, картинка ИИ', need: 'ready' },
  { key: 'confess', label: '14. Признавайтесь', note: 'текст, реакции', need: 'ready' },
  { key: 'explain_dumb', label: '15. Объясни как дебилу', note: 'способность через быт', need: 'ready' },
  { key: 'toxic_translator', label: '16. Переводчик с токсичного', note: 'словарная статья', need: 'ready' },
  { key: 'crime_news', label: '17. Криминальная хроника', note: 'рекорд недели заметкой', need: 'stratz' },
  { key: 'ability_in_life', label: '18. Способность в жизнь', note: 'опрос', need: 'ready' },
  { key: 'hero_profile', label: '19. Анкета', note: 'медкарта, резюме, анкета', need: 'ready' },
  { key: 'item_leaflet', label: '20. Инструкция по применению', note: 'предмет как лекарство', need: 'ready' },
  { key: 'tier_list', label: '21. Тир-лист', note: 'картинка', need: 'stratz' },
  { key: 'recruit_picks', label: '22. Что брать рекруту', note: 'текст: топ-5 на Рекрутах', need: 'stratz' },
  { key: 'forgotten_hero', label: '23. Забытый герой', note: 'текст', need: 'stratz' },
  { key: 'horoscope', label: '24. Гороскоп', note: 'текст', need: 'stratz' },
  { key: 'hero_trial', label: '25. Суд', note: 'опрос «Приговор»', need: 'stratz' },
  { key: 'would_you_rather', label: '26. Что выберешь?', note: 'текст, реакции', need: 'ready' },
  { key: 'on_lane', label: '27. Ты на линии', note: 'ситуация с решением', need: 'ready' },
  { key: 'grandpa', label: '28. Дед', note: 'правка патча ворчанием', need: 'ready' },
  { key: 'valve_fixed', label: '29. Valve исправила', note: 'правка патча и эскалация', need: 'ready' },
  { key: 'rebus', label: '30. Ребус', note: 'картинка + викторина', need: 'ready' },
  { key: 'toxic_bingo', label: '31. Токсик-бинго', note: 'бинго 3×3 текстом', need: 'ready' },
  { key: 'trash_tier', label: '32. Тир-лист хуйни', note: 'тир-лист по теме', need: 'ready' },
  { key: 'fake_item', label: '33. Предмет, которого нет', note: 'картинка', need: 'ready' },
  { key: 'confessional', label: '34. Исповедальня', note: 'признания подписчиков в личке канала', need: 'later' }
];
const NEED_NOTE: Record<Need, string> = { ready: '', stratz: ' · STRATZ', later: ' · пока не готово' };

const REASONS: Record<string, string> = {
  BOT_NOT_CONFIGURED: 'Бот не подключён.',
  BROWSER_NOT_BOUND: 'Browser Rendering не подключён к этому серверу.',
  BROWSER_RATE: 'Бесплатный тариф рисует одну картинку в 10 секунд — подождите и нажмите снова.',
  STATS_NOT_CONFIGURED: 'Нужны ключ STRATZ и мост статистики (STATS_BRIDGE_URL).',
  NOT_BUILT_YET: 'Для этой рубрики ещё нет источника данных.',
  GITHUB_NOT_CONFIGURED: 'Нужен GITHUB_TOKEN для файлов игры.'
};

/**
 * «Тестирование» → «Рубрики» (owner, 25.10.2026; in «Тестирование» since 26.10.2026): each press queues the chosen rubric — live data,
 * the AI writer's text and its picture — and the bot sends it to the owner's chat within minutes, the way subscribers
 * would see it. The press's status stays in its own row, where the owner looks after pressing.
 */
export function RubricSamplesList() {
  const send = useSendRubricSample();
  const [last, setLast] = useState<RubricSampleKey | null>(null);
  const failure =
    send.error === null
      ? null
      : send.error instanceof ApiError && send.error.reason !== undefined
        ? (REASONS[send.error.reason] ??
          `${send.error.message} (${send.error.reason}${send.error.details?.['status'] ? `, HTTP ${send.error.details['status']}` : ''})`)
        : send.error.message;
  const status = send.isPending
    ? 'Ставлю в очередь…'
    : failure !== null
      ? `Не отправлено: ${failure}`
      : send.data
        ? 'В работе — придёт в чат с ботом через 1–3 минуты.'
        : '';
  return (
    <ul className={styles.list}>
      {RUBRICS.map((rubric) => (
        <li key={rubric.key} className={styles.row}>
          <span className={styles.text}>
            <span className={styles.label}>{rubric.label}</span>
            <span className={styles.note}>
              {rubric.note}
              {NEED_NOTE[rubric.need]}
            </span>
            {/* Every row keeps its live region so a status appearing after the press is announced. */}
            <output className={failure !== null && last === rubric.key ? styles.failed : styles.status}>
              {last === rubric.key ? status : ''}
            </output>
          </span>
          <Button
            size="sm"
            variant="secondary"
            isLoading={send.isPending && last === rubric.key}
            isDisabled={send.isPending}
            onPress={() => {
              setLast(rubric.key);
              send.mutate(rubric.key);
            }}
          >
            Прислать
          </Button>
        </li>
      ))}
    </ul>
  );
}
