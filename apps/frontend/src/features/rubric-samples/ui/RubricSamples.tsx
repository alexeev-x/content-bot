import type { RubricSampleKey } from '@alexeev/contracts';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { Button } from '../../../shared/ui';
import { useSendRubricSample } from '../api/rubric-samples-api';
import styles from './RubricSamples.module.css';

// All 30 approved rubrics, in the order of RUBRIC_KEYS: the owner calls any of them to look (owner, 30.10.2026).
const RUBRICS: { key: RubricSampleKey; title: string }[] = [
  { key: 'patch_broken', title: 'Кого понерфили' },
  { key: 'who_is_imba', title: 'Кто теперь имба?' },
  { key: 'nerf_or_buff', title: 'Нерф или баф?' },
  { key: 'whose_ability', title: 'Чья способность?' },
  { key: 'files_dont_lie', title: 'Утечка недели' },
  { key: 'who_gets_nerfed', title: 'Кого понерфят?' },
  { key: 'valve_seriously', title: 'Valve, ты серьёзно?' },
  { key: 'valve_time', title: 'Валв-тайм' },
  { key: 'rate_it', title: 'Оцениваем' },
  { key: 'who_beats_whom', title: 'Кто кого перебьёт?' },
  { key: 'workshop_set', title: 'Сеты из мастерской' },
  { key: 'hero_guide', title: 'Гайд на героя' },
  { key: 'confess', title: 'Признавайтесь' },
  { key: 'explain_dumb', title: 'Объясни как дебилу' },
  { key: 'toxic_translator', title: 'Переводчик с токсичного' },
  { key: 'ability_in_life', title: 'Способность в жизнь' },
  { key: 'hero_profile', title: 'Анкета' },
  { key: 'item_leaflet', title: 'Инструкция по применению' },
  { key: 'tier_list', title: 'Тир-лист' },
  { key: 'recruit_picks', title: 'Что брать рекруту' },
  { key: 'forgotten_hero', title: 'Забытый герой' },
  { key: 'horoscope', title: 'Гороскоп' },
  { key: 'hero_trial', title: 'Подозреваемый' },
  { key: 'would_you_rather', title: 'Что выберешь?' },
  { key: 'on_lane', title: 'Ты на линии' },
  { key: 'rebus', title: 'Ребус' },
  { key: 'toxic_bingo', title: 'Токсик-бинго' },
  { key: 'fake_item', title: 'Предмет, которого нет' },
  { key: 'shame_of_day', title: 'Пидорок дня' },
  { key: 'quote_of_day', title: 'Цитата дня' }
];

const REASONS: Record<string, string> = {
  BOT_NOT_CONFIGURED: 'Бот не подключён.',
  BROWSER_NOT_BOUND: 'Browser Rendering не подключён к этому серверу.',
  BROWSER_RATE: 'Бесплатный тариф рисует одну картинку в 10 секунд — подождите и нажмите снова.',
  STATS_NOT_CONFIGURED: 'Нужны ключ STRATZ и мост статистики (STATS_BRIDGE_URL).',
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
  // A queued rubric's button stays locked until the page reloads: a second press would send a second sample.
  const [sent, setSent] = useState<ReadonlySet<RubricSampleKey>>(new Set());
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
      {RUBRICS.map((rubric, index) => (
        <li key={rubric.key} className={styles.row}>
          <span className={styles.text}>
            <span className={styles.label}>
              {index + 1}. {rubric.title}
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
            isDisabled={send.isPending || sent.has(rubric.key)}
            onPress={() => {
              setLast(rubric.key);
              send.mutate(rubric.key, {
                onSuccess: () => setSent((keys) => new Set(keys).add(rubric.key))
              });
            }}
          >
            {sent.has(rubric.key) ? 'Отправлено' : 'Прислать'}
          </Button>
        </li>
      ))}
    </ul>
  );
}
