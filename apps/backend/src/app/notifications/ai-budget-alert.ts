import type { BudgetEvent } from '../../modules/ai';

const usd = (value: number) => `$${value.toFixed(2)}`;

// What the bot tells the owner when AI spend crosses a threshold (owner, 15.10.2026: at once, in the bot).
export function formatAiBudgetAlert(event: BudgetEvent): string {
  switch (event.kind) {
    case 'warn':
      return [
        '⚠️ <b>ИИ: бюджет на исходе</b>',
        `Потрачено ${usd(event.spentUsd)} из ${usd(event.budgetUsd)}, осталось ${usd(event.leftUsd)}${
          event.averageUsd !== null && event.averageUsd > 0
            ? ` (≈ ${Math.floor(event.leftUsd / event.averageUsd)} запросов)`
            : ''
        }.`
      ].join('\n');
    case 'stop':
      return [
        '🛑 <b>ИИ: деньги на этот месяц кончились</b>',
        `Потрачено ${usd(event.spentUsd)} из ${usd(event.budgetUsd)}. Генерация остановлена до 1-го числа; поднять бюджет можно в настройках.`
      ].join('\n');
    case 'daily':
      return [
        '⏸ <b>ИИ: дневной лимит исчерпан</b>',
        `Сегодня потрачено ${usd(event.todayUsd)} из ${usd(event.capUsd)}. Продолжим завтра.`
      ].join('\n');
  }
}
