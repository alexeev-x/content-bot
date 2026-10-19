import { type Bot, InlineKeyboard } from 'grammy';
import { type RuleRow, type RuleScope, type RulesRepository, RULES_IN_USE_MAX } from '../../modules/ai';
import type { Clock } from '../../platform/clock';
import { escapeHtml } from '../notifications/notice-template';

// The owner's rules for the AI writer in the bot (AI plan P7, §6.1 A; plan TG-15): «/rule <текст>» asks for the
// scope with buttons and remembers the rule once; «/rules» lists the rules in use, each with «Отключить». A rule
// changes the writer's future prompts only; old texts stay as they were.

const RULE_MIN = 3;
const RULE_MAX = 300;
/** A listed rule is cut to this many characters: 15 lines stay under Telegram's 4096 (review 19.10.2026). */
const LINE_TEXT_MAX = 180;
const SCOPES: readonly [RuleScope, string][] = [
  ['all', 'Все тексты'],
  ['igrat', '«Учусь играть»'],
  ['fidit', '«Учу фидить»'],
  ['telegram', 'Посты'],
  ['standalone', 'Рилсы вне рубрик']
];
const SCOPE_LABEL = Object.fromEntries(SCOPES) as Record<RuleScope, string>;
const CODE: Record<RuleScope, string> = { all: 'a', igrat: 'i', fidit: 'f', telegram: 't', standalone: 's' };
const BY_CODE = Object.fromEntries(Object.entries(CODE).map(([scope, code]) => [code, scope])) as Record<
  string,
  RuleScope
>;
export const RULE_CALLBACK = /^rl:([0-9a-f-]{36}):([aifts]|x|off|ok|no)$/;

const USAGE_TEXT =
  'Напишите правило после команды, например: <code>/rule в «Учусь играть» не начинай с описания героя</code>';

export interface AiRulesRuntime {
  clock: Clock;
  newId: () => string;
  rules: () => Promise<RulesRepository>;
  onError: (error: unknown) => void;
}

function cut(text: string): string {
  const letters = Array.from(text);
  return letters.length > LINE_TEXT_MAX ? `${letters.slice(0, LINE_TEXT_MAX - 1).join('')}…` : text;
}

function listHtml(rules: readonly RuleRow[]): { html: string; keyboard: InlineKeyboard } {
  const keyboard = new InlineKeyboard();
  if (rules.length === 0) return { html: 'Правил пока нет. Добавить: <code>/rule текст правила</code>', keyboard };
  const lines = rules.map(
    (rule, index) =>
      `${index + 1}. ${escapeHtml(cut(rule.text))} — <i>${SCOPE_LABEL[rule.scope]}${rule.source === 'analysis' ? ', из аналитики' : ''}</i>`
  );
  rules.forEach((rule, index) => keyboard.text(`Отключить ${index + 1}`, `rl:${rule.id}:off`).row());
  return { html: ['<b>Правила редактора</b>', ...lines].join('\n'), keyboard };
}

export function registerAiRules(bot: Bot, runtime: AiRulesRuntime): void {
  bot.command('rule', async (ctx) => {
    const text = ctx.match.replace(/\s+/g, ' ').trim();
    if (Array.from(text).length < RULE_MIN || Array.from(text).length > RULE_MAX) {
      await ctx.reply(USAGE_TEXT, { parse_mode: 'HTML' });
      return;
    }
    const id = runtime.newId();
    await (await runtime.rules()).createOwnerRule({ id, text, now: runtime.clock.now() });
    const keyboard = new InlineKeyboard();
    SCOPES.forEach(([scope, label], index) => {
      keyboard.text(label, `rl:${id}:${CODE[scope]}`);
      if (index % 2 === 1) keyboard.row();
    });
    keyboard.row().text('Отмена', `rl:${id}:x`);
    await ctx.reply(`Запомнить правило:\n«${escapeHtml(text)}»\n\nДля каких текстов?`, {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
  });

  bot.command('rules', async (ctx) => {
    const { html, keyboard } = listHtml(await (await runtime.rules()).inUse(RULES_IN_USE_MAX));
    await ctx.reply(html, { parse_mode: 'HTML', reply_markup: keyboard });
  });

  bot.callbackQuery(RULE_CALLBACK, async (ctx) => {
    const [, id = '', action = ''] = ctx.match;
    const rules = await runtime.rules();
    const now = runtime.clock.now();
    const rule = await rules.find(id);
    if (rule === null) {
      await ctx.answerCallbackQuery({ text: 'Эта кнопка устарела.' });
      return;
    }
    if (action === 'ok') {
      // An analysis rule the evidence supports (app/workflows/rule-consolidation.ts): in use only after this «Да».
      const approved = await rules.approve({ id, now });
      const full = !approved && rule.approvedAt === null && rule.status !== 'disabled' && rule.status !== 'deprecated';
      await ctx.answerCallbackQuery({
        text: approved
          ? 'Учту в новых сценариях.'
          : full && rule.status !== 'candidate'
            ? `Уже ${RULES_IN_USE_MAX} правил. Отключите лишнее в /rules и нажмите снова.`
            : 'Эта кнопка устарела.'
      });
      if (approved)
        await ctx
          .editMessageText(
            `💡 Учитываю в новых сценариях:
«${escapeHtml(rule.text)}»

Отключить — /rules.`,
            {
              parse_mode: 'HTML'
            }
          )
          .catch(runtime.onError);
      return;
    }
    if (action === 'no') {
      // Turned down: never used and never proposed again (MEM-07).
      const done = rule.source === 'analysis' && rule.approvedAt === null && (await rules.disable({ id, now }));
      await ctx.answerCallbackQuery({ text: done ? 'Не буду учитывать.' : 'Эта кнопка устарела.' });
      if (done)
        await ctx
          .editMessageText(
            `Не учитываю:
«${escapeHtml(rule.text)}»`,
            { parse_mode: 'HTML' }
          )
          .catch(runtime.onError);
      return;
    }
    if (action === 'off' || action === 'x') {
      const done = action === 'x' ? await rules.cancel({ id, now }) : await rules.disable({ id, now });
      await ctx.answerCallbackQuery({
        text: done
          ? action === 'x'
            ? 'Не запомнил.'
            : 'Отключил. В новых текстах его не будет.'
          : 'Эта кнопка устарела.'
      });
      if (done && action === 'x') await ctx.editMessageText('Правило не запомнил.').catch(runtime.onError);
      if (done && action === 'off') {
        const { html, keyboard } = listHtml(await rules.inUse(RULES_IN_USE_MAX));
        await ctx.editMessageText(html, { parse_mode: 'HTML', reply_markup: keyboard }).catch(runtime.onError);
      }
      return;
    }
    const scope = BY_CODE[action];
    if (scope === undefined || !(await rules.activate({ id, scope, now }))) {
      const full = scope !== undefined && (await rules.find(id))?.status === 'pending_scope';
      await ctx.answerCallbackQuery({
        text: full
          ? `Уже ${RULES_IN_USE_MAX} правил. Отключите лишнее в /rules и нажмите снова.`
          : 'Эта кнопка устарела.'
      });
      return;
    }
    await ctx.answerCallbackQuery({ text: 'Запомнил.' });
    await ctx
      .editMessageText(
        `Запомнил для «${SCOPE_LABEL[scope]}»:\n«${escapeHtml(rule.text)}»\n\nРедактор учтёт его в новых текстах. Список и отключение — /rules.`,
        { parse_mode: 'HTML' }
      )
      .catch((error: unknown) => runtime.onError(error));
  });
}
