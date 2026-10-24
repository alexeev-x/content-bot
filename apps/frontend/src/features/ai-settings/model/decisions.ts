import type { AiHypothesisDto, AiOverviewDto, AiRuleDto } from '@alexeev/contracts';
import { pluralRu } from '../../../shared/lib/ru-format';
import { approvalPercent, lowApproval } from './ai-view';

// «Нужно ваше решение» (owner, 20.10.2026): what the editor did by itself and cannot take further without the owner.
// It used to sit in six folded lists at the bottom of Настройки → ИИ, invisible until opened.

/** Where the owner acts on a decision: a tab of «ИИ-редактор» or the AI settings. */
export type DecisionTarget = 'learning' | 'drafts' | 'settings';

export type Decision = {
  id: string;
  tone: 'warning' | 'info';
  title: string;
  detail: string;
  target: DecisionTarget;
  action: string;
};

const WAITING_RULES = new Set<AiRuleDto['status']>(['supported', 'strong', 'pending_scope']);

export function pendingDecisions(input: {
  overview: AiOverviewDto | undefined;
  rules: readonly AiRuleDto[] | undefined;
  hypotheses: readonly AiHypothesisDto[] | undefined;
  unlinked: number | undefined;
}): Decision[] {
  const { overview, rules, hypotheses, unlinked } = input;
  const decisions: Decision[] = [];

  // Nothing else matters while the editor cannot write.
  if (overview && (!overview.connection.keyConfigured || !overview.settings.enabled)) {
    decisions.push({
      id: 'off',
      tone: 'warning',
      title: overview.connection.keyConfigured ? 'ИИ выключен' : 'Нет ключа OpenAI',
      detail: 'Черновики не пишутся, пока ИИ не включён в настройках.',
      target: 'settings',
      action: 'Открыть настройки'
    });
  }
  if (overview && overview.spend.blockedBy !== null) {
    decisions.push({
      id: 'blocked',
      tone: 'warning',
      title: 'ИИ остановлен лимитом',
      detail: 'Бюджет месяца или дня исчерпан: поднимите лимит или подождите.',
      target: 'settings',
      action: 'Изменить бюджет'
    });
  } else if (overview && overview.settings.monthlyBudgetUsd > 0) {
    const used = Math.round((overview.spend.spentUsd / overview.settings.monthlyBudgetUsd) * 100);
    if (used >= overview.settings.warnAtPercent) {
      decisions.push({
        id: 'budget',
        tone: 'warning',
        title: `Бюджет месяца израсходован на ${used}%`,
        detail: 'Когда он кончится, ИИ остановится до 1-го числа.',
        target: 'settings',
        action: 'Изменить бюджет'
      });
    }
  }

  const waiting = (rules ?? []).filter((rule) => WAITING_RULES.has(rule.status));
  if (waiting.length > 0) {
    decisions.push({
      id: 'rules',
      tone: 'info',
      title: `${waiting.length} ${pluralRu(waiting.length, 'правило ждёт', 'правила ждут', 'правил ждут')} решения`,
      detail: `Аналитика подтвердила: «${waiting[0]!.text}»${waiting.length > 1 ? ' и другие' : ''}. В тексты правило попадёт только после «Учитывать».`,
      target: 'learning',
      action: 'Решить'
    });
  }

  const asked = (hypotheses ?? []).filter((hypothesis) => hypothesis.asked && hypothesis.status === 'supported');
  if (asked.length > 0) {
    decisions.push({
      id: 'hypotheses',
      tone: 'info',
      title: `Бот спросил про ${asked.length} ${pluralRu(asked.length, 'гипотезу', 'гипотезы', 'гипотез')}`,
      detail: `H${asked[0]!.code}. ${asked[0]!.text} Ответьте в боте «Учитывать?» или посмотрите здесь.`,
      target: 'learning',
      action: 'Посмотреть'
    });
  }

  if (unlinked !== undefined && unlinked > 0) {
    decisions.push({
      id: 'unlinked',
      tone: 'info',
      title: `${unlinked} ${pluralRu(unlinked, 'сценарий', 'сценария', 'сценариев')} без видео`,
      detail: 'Привяжите вышедший ролик к сценарию: иначе ИИ не узнает, сработал ли он, и не научится на нём.',
      target: 'learning',
      action: 'Привязать'
    });
  }

  if (overview && lowApproval(overview.quality)) {
    decisions.push({
      id: 'approval',
      tone: 'warning',
      title: `Одобряете только ${approvalPercent(overview.quality)}% черновиков`,
      detail: 'Посмотрите, что не так в последних: нажмите «Что не так?» в боте, ИИ учтёт это в следующих.',
      target: 'drafts',
      action: 'Черновики'
    });
  }
  return decisions;
}
