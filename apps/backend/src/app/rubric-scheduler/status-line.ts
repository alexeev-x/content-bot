import { RUBRIC_TITLES, type RubricSchedulerStatusDto } from '@alexeev/contracts';

// The rubric scheduler's line in the bot's /status (MASTER-PLAN stage 4): running with the next rubric, switched off,
// or stopped with its first lock; nothing where it only forecasts.

const LOCKS: Record<RubricSchedulerStatusDto['locks'][number]['code'], string> = {
  NOT_HERE: 'не работают здесь',
  NOT_BUILT: 'не работают здесь',
  SCHEMA: 'нет миграции 0119',
  SWITCHED_OFF: 'выключены',
  LAB_OFF: 'выключены в фоновых задачах',
  NO_DESTINATION: 'не выбран канал',
  DESTINATION_DISABLED: 'канал выключен',
  PUBLISHING_OFF: 'публикация выключена'
};

const mskTime = (iso: string) => new Date(Date.parse(iso) + 3 * 3_600_000).toISOString().slice(11, 16);

export function rubricStatusLine(status: RubricSchedulerStatusDto): string | null {
  if (status.mode === 'forecast_only' || status.mode === 'unavailable') return null;
  const prefix = status.mode === 'rehearsal' ? 'Рубрики (репетиция)' : 'Рубрики';
  if (status.effective === 'running')
    return status.next === null
      ? `${prefix}: работают, ближайших слотов нет`
      : `${prefix}: работают, следующая «${RUBRIC_TITLES[status.next.rubricKey]}» в ${mskTime(status.next.at)} МСК`;
  const lock = status.locks[0];
  return `${prefix}: ${lock === undefined ? 'остановлены' : LOCKS[lock.code]}`;
}
