import type { RubricSampleKey } from '@alexeev/contracts';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { Button, Dialog } from '../../../shared/ui';
import { useSendRubricSample } from '../api/rubric-samples-api';
import styles from './RubricSamples.module.css';

const RUBRICS: { key: RubricSampleKey; label: string; note: string }[] = [
  { key: 'rank_meta', label: 'Мета по рангам', note: 'картинка: медаль и топ-5 героев' },
  { key: 'who_beats_whom', label: 'Кто кого перебьёт?', note: 'картинка: 2 героя по 6 предметов + опрос' },
  { key: 'anti_build', label: 'Антисборка', note: 'картинка: зачёркнутый предмет и проценты' },
  { key: 'guess_winrate', label: 'Угадай винрейт', note: 'картинка: герой и медаль + викторина' },
  { key: 'daily_record', label: 'Рекорд суток', note: 'без картинки' },
  { key: 'whose_ability', label: 'Чья способность?', note: 'без картинки, викторина по цифрам' }
];

const REASONS: Record<string, string> = {
  RUBRIC_SAMPLES_OFF: 'Образцы рубрик есть только на DEV.',
  BOT_NOT_CONFIGURED: 'Бот не подключён.',
  BROWSER_NOT_BOUND: 'Browser Rendering не подключён к этому серверу.'
};

/**
 * DEV only (owner, 25.10.2026): each press builds a rubric's post from live data — the picture from Valve's real icons,
 * the text and the poll — and the bot sends it to the owner's chat, the way subscribers would see it.
 */
export function RubricSamplesButton() {
  const [open, setOpen] = useState(false);
  const send = useSendRubricSample();
  const [last, setLast] = useState<RubricSampleKey | null>(null);
  const failure =
    send.error === null
      ? null
      : send.error instanceof ApiError && send.error.reason !== undefined
        ? (REASONS[send.error.reason] ?? `${send.error.message} (${send.error.reason})`)
        : send.error.message;
  return (
    <>
      <Button variant="secondary" icon="send" onPress={() => setOpen(true)}>
        Рубрики (DEV)
      </Button>
      <Dialog
        isOpen={open}
        onOpenChange={setOpen}
        title="Рубрики (DEV)"
        description="Пост из живых данных придёт вам в чат с ботом — как его увидят подписчики. В канал ничего не уходит."
      >
        <ul className={styles.list}>
          {RUBRICS.map((rubric) => (
            <li key={rubric.key} className={styles.row}>
              <span className={styles.text}>
                <span className={styles.label}>{rubric.label}</span>
                <span className={styles.note}>{rubric.note}</span>
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
        <output className={styles.status}>
          {send.isPending
            ? 'Собираю пост…'
            : failure !== null
              ? `Не отправлено: ${failure}`
              : send.data
                ? `Отправлено: ${RUBRICS.find((each) => each.key === send.data.rubric)?.label ?? send.data.rubric} — смотрите чат с ботом.`
                : ''}
        </output>
      </Dialog>
    </>
  );
}
