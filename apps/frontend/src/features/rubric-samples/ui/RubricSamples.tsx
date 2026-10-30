import type { RubricSampleKey } from '@alexeev/contracts';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { Button } from '../../../shared/ui';
import { useSendRubricSample } from '../api/rubric-samples-api';
import styles from './RubricSamples.module.css';

type Need = 'ready' | 'stratz' | 'stats' | 'later';
// Rubrics the owner approved leave the list (owner, 26.10.2026: «убирай те рубрики, которые мы утвердили»); numbered
// 1–30 in the order of RUBRIC_KEYS (renumbered 30.10.2026). Approved and gone from here: 1–20, 22.
const RUBRICS: { key: RubricSampleKey; label: string; note: string; need: Need }[] = [
  { key: 'forgotten_hero', label: '21. Забытый герой', note: 'картинка ИИ + текст', need: 'stratz' },
  { key: 'hero_trial', label: '23. Подозреваемый', note: 'картинка ИИ + опрос «Приговор»', need: 'ready' },
  { key: 'would_you_rather', label: '24. Что выберешь?', note: 'опрос: два наказания и выход', need: 'ready' },
  { key: 'on_lane', label: '25. Ты на линии', note: 'викторина, цифры из данных Valve', need: 'ready' },
  { key: 'rebus', label: '26. Ребус', note: 'викторина-ребус 18+', need: 'ready' },
  { key: 'toxic_bingo', label: '27. Токсик-бинго', note: 'бинго 5×5 / тир-лист хуйни по очереди', need: 'ready' },
  { key: 'fake_item', label: '28. Предмет, которого нет', note: 'подсказка предмета + своя иконка', need: 'ready' },
  {
    key: 'shame_of_day',
    label: '29. Пидорок дня — худшая игра вчера из базы',
    note: 'картинка с героем + текст, счёт или сборка по очереди',
    need: 'stats'
  },
  { key: 'quote_of_day', label: '30. Цитата дня', note: 'цитата Стетхема про Доту, только текст', need: 'ready' }
];
const NEED_NOTE: Record<Need, string> = {
  ready: '',
  stratz: ' · STRATZ',
  stats: ' · база статистики (только прод)',
  later: ' · пока не готово'
};

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
