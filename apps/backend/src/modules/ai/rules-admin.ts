import {
  AI_RULE_EVIDENCE_LIMIT,
  AI_RULES_LIST_LIMIT,
  type AiRuleDto,
  type AiRulesDto,
  type ChangeAiRuleInput
} from '@alexeev/contracts';
import type { Clock } from '../../platform/clock';
import { AppError } from '../../shared/app-error';
import { type EvidenceRow, type RuleRow, type RulesRepository, RULES_IN_USE_MAX } from './d1-rules-repository';

// The writer's rules in the studio (AI plan P8, §6.1): the same rows the bot's «/rules» and the weekly
// consolidation change, so a rule switched off here leaves the next prompt (SYS-02). Every change is the
// repository's conditional update; this file only names why one was refused.

const iso = (ms: number) => new Date(ms).toISOString();

const inUse = (rule: RuleRow) =>
  rule.status === 'active' ||
  (rule.source === 'analysis' && (rule.status === 'supported' || rule.status === 'strong') && rule.approvedAt !== null);

function toDto(rule: RuleRow, evidence: readonly EvidenceRow[]): AiRuleDto {
  return {
    id: rule.id,
    text: rule.text,
    scope: rule.scope,
    source: rule.source,
    status: rule.status,
    inUse: inUse(rule),
    approvedAt: rule.approvedAt === null ? null : iso(rule.approvedAt),
    createdAt: iso(rule.createdAt),
    supports: rule.supports,
    contradicts: rule.contradicts,
    evidence: evidence
      .filter((row) => row.ruleId === rule.id)
      .map((row) => ({
        key: row.key,
        polarity: row.polarity,
        origin: row.sourceRef === 'origin',
        scriptExcerpt: row.script,
        createdAt: iso(row.createdAt)
      }))
  };
}

export async function readRules(rules: RulesRepository): Promise<AiRulesDto> {
  const rows = await rules.studioList(AI_RULES_LIST_LIMIT);
  const evidence = await rules.evidenceOf(
    rows.filter((rule) => rule.source === 'analysis').map((rule) => rule.id),
    AI_RULE_EVIDENCE_LIMIT
  );
  return { items: rows.map((rule) => toDto(rule, evidence)), inUseMax: RULES_IN_USE_MAX };
}

async function readOne(rules: RulesRepository, id: string): Promise<AiRuleDto> {
  const rule = await rules.find(id);
  if (rule === null || rule.status === 'pending_scope') throw new AppError('NOT_FOUND', 'Rule not found');
  return toDto(rule, rule.source === 'analysis' ? await rules.evidenceOf([id], AI_RULE_EVIDENCE_LIMIT) : []);
}

/** Why a refused change was refused: the in-use cap, or a state that cannot take the action. */
async function refusal(rules: RulesRepository, rule: RuleRow): Promise<AppError> {
  const full = (await rules.inUse(RULES_IN_USE_MAX)).length >= RULES_IN_USE_MAX;
  return full
    ? new AppError('CONFLICT', 'Too many rules in use', { reason: 'LIMIT' })
    : new AppError('CONFLICT', `Rule cannot change from ${rule.status}`, { reason: 'STATE' });
}

export async function changeRule(
  deps: { rules: RulesRepository; clock: Clock },
  input: { id: string } & ChangeAiRuleInput
): Promise<AiRuleDto> {
  const { rules } = deps;
  const rule = await rules.find(input.id);
  if (rule === null || rule.status === 'pending_scope') throw new AppError('NOT_FOUND', 'Rule not found');
  const now = deps.clock.now();
  if (input.action === 'disable') {
    // Already off: the same answer, so a repeated request is a no-op.
    if (rule.status !== 'disabled' && rule.status !== 'deprecated') await rules.disable({ id: rule.id, now });
    return readOne(rules, rule.id);
  }
  if (input.action === 'enable') {
    if (rule.status === 'active') return readOne(rules, rule.id);
    if (rule.source !== 'owner' || rule.status !== 'disabled')
      throw new AppError('CONFLICT', `Rule cannot change from ${rule.status}`, { reason: 'STATE' });
    if (!(await rules.enable({ id: rule.id, now }))) throw await refusal(rules, rule);
    return readOne(rules, rule.id);
  }
  if (inUse(rule)) return readOne(rules, rule.id);
  if (rule.source !== 'analysis' || (rule.status !== 'supported' && rule.status !== 'strong'))
    throw new AppError('CONFLICT', `Rule cannot change from ${rule.status}`, { reason: 'STATE' });
  if (!(await rules.approve({ id: rule.id, now }))) throw await refusal(rules, rule);
  return readOne(rules, rule.id);
}

export async function removeRuleEvidence(
  deps: { rules: RulesRepository; clock: Clock },
  input: { id: string; key: string }
): Promise<AiRuleDto> {
  const rule = await deps.rules.find(input.id);
  if (rule === null || rule.source !== 'analysis') throw new AppError('NOT_FOUND', 'Rule not found');
  if (!(await deps.rules.removeEvidence({ ruleId: rule.id, key: input.key, now: deps.clock.now() })))
    throw new AppError('NOT_FOUND', 'Evidence not found');
  return readOne(deps.rules, rule.id);
}
