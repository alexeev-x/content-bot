import type { RubricSampleKey } from '@alexeev/contracts';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { Button } from '../../../shared/ui';
import { useSendRubricSample } from '../api/rubric-samples-api';
import styles from './RubricSamples.module.css';

type Need = 'ready' | 'stratz' | 'later';
const RUBRICS: { key: RubricSampleKey; label: string; note: string; need: Need }[] = [
  { key: 'patch_broken', label: '1. Что сломали в патче', note: 'картинка: герои патча', need: 'ready' },
  { key: 'who_is_imba', label: '2. Кто теперь имба?', note: 'опрос', need: 'ready' },
  { key: 'nerf_or_buff', label: '3. Нерф или баф?', note: 'картинка + викторина', need: 'ready' },
  { key: 'whose_ability', label: '4. Чья способность?', note: 'викторина по цифрам', need: 'ready' },
  { key: 'files_dont_lie', label: '5. Файлы не врут', note: 'текст, нужен GITHUB_TOKEN', need: 'ready' },
  { key: 'who_gets_nerfed', label: '6. Кого понерфят?', note: 'опрос', need: 'ready' },
  { key: 'valve_seriously', label: '7. Valve, ты серьёзно?', note: 'текст', need: 'ready' },
  { key: 'valve_time', label: '8. Валв-тайм', note: 'текст', need: 'ready' },
  { key: 'rate_it', label: '9. Оцениваем', note: 'картинка новинки', need: 'ready' },
  { key: 'who_beats_whom', label: '10. Кто кого перебьёт?', note: 'картинка + опрос', need: 'stratz' },
  { key: 'guess_by_numbers', label: '11. Угадай героя по цифрам', note: 'викторина', need: 'ready' },
  { key: 'guess_winrate', label: '12. Угадай винрейт', note: 'картинка + викторина', need: 'stratz' },
  { key: 'ban_or_pick', label: '13. Бан или пик?', note: 'картинка + опрос', need: 'stratz' },
  { key: 'rank_meta', label: '14. Мета по рангам', note: 'картинка: топ-5', need: 'stratz' },
  { key: 'poison_for_low', label: '15. Яд для низов', note: 'текст', need: 'stratz' },
  { key: 'daily_record', label: '16. Рекорд недели', note: 'текст', need: 'stratz' },
  { key: 'hero_peak', label: '17. Когда герой сильнее всего', note: 'текст', need: 'stratz' },
  { key: 'anti_build', label: '18. Антисборка', note: 'картинка', need: 'stratz' },
  { key: 'forgotten_hero', label: '19. Забытый герой', note: 'текст', need: 'stratz' },
  { key: 'did_you_know', label: '20. А вы знали?', note: 'текст', need: 'ready' },
  { key: 'item_exam', label: '21. Предметный экзамен', note: 'викторина, иногда с картинкой', need: 'ready' },
  { key: 'tier_list', label: '22. Тир-лист по-русски', note: 'картинка', need: 'stratz' },
  { key: 'carry_on_five', label: '23. Керри на пятой', note: 'текст', need: 'stratz' },
  { key: 'combo_math', label: '24. Комбо-расчёт', note: 'картинка', need: 'ready' },
  { key: 'horoscope', label: '25. Дота-гороскоп', note: 'текст', need: 'stratz' },
  { key: 'workshop_set', label: '26. Оцени сет из мастерской', note: 'картинка + ссылка', need: 'ready' },
  { key: 'rebus', label: '27. Ребус', note: 'картинка + викторина', need: 'ready' },
  { key: 'guess_streak', label: '28. Угадай-серия', note: 'викторина (без кнопок и таблицы)', need: 'ready' },
  { key: 'tier_list_vote', label: '29. Тир-лист голосованием', note: 'картинка + опрос', need: 'ready' },
  { key: 'guess_match', label: '30. Угадай матч', note: 'опрос, нет источника свежих матчей', need: 'later' },
  { key: 'fake_item', label: '31. Шемелис недели', note: 'картинка', need: 'ready' },
  { key: 'whose_build', label: '32. Чья сборка?', note: 'картинка + викторина', need: 'stratz' }
];
const NEED_NOTE: Record<Need, string> = { ready: '', stratz: ' · STRATZ', later: ' · пока не готово' };

const REASONS: Record<string, string> = {
  RUBRIC_SAMPLES_OFF: 'Образцы рубрик есть только на DEV.',
  BOT_NOT_CONFIGURED: 'Бот не подключён.',
  BROWSER_NOT_BOUND: 'Browser Rendering не подключён к этому серверу.',
  BROWSER_RATE: 'Бесплатный тариф рисует одну картинку в 10 секунд — подождите и нажмите снова.',
  STATS_NOT_CONFIGURED: 'Нужны ключ STRATZ и мост статистики (STATS_BRIDGE_URL).',
  NOT_BUILT_YET: 'Для этой рубрики ещё нет источника данных.',
  GITHUB_NOT_CONFIGURED: 'Нужен GITHUB_TOKEN для файлов игры.'
};

/**
 * DEV only (owner, 25.10.2026; a page of its own since 26.10.2026): each press queues the chosen rubric — live data,
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
