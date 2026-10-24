import { CONSOLIDATION_MAX_VIDEOS, consolidateRules, type RuleRow, type RuleVideo } from '../../modules/ai';
import type { NewContentAlert } from '../../modules/content-analytics';
import { getOwnerOperationsSettings } from '../../modules/settings';
import { AppError } from '../../shared/app-error';
import type { Container } from '../container';
import { escapeHtml } from '../notifications/notice-template';
import { sendBudgetAlerts } from './run-ai-reviews';

// After the weekly report's review (AI plan P7): the videos of the last four weeks with a measured result, one per
// approved script, go to the rule consolidation; each analysis rule the evidence now supports is put to the owner,
// and each approved one it took out of use is told, through the content alerts (one attempt, `unknown` never
// resent). Never throws: a failure keeps the rules as they were (MEM-12). A weekly report the Cron fallback
// released first (no review ran) skips that week's run.

const DAY_MS = 24 * 60 * 60 * 1000;
/** Each video is weighed in up to four weekly runs; a rule counts it once. */
const WINDOW_MS = 28 * DAY_MS;
/** Review rows read to find CONSOLIDATION_MAX_VIDEOS scripts (YouTube and TikTok share one). */
const RESULTS_READ = 2 * CONSOLIDATION_MAX_VIDEOS;
const CONSOLIDATION_TIMEOUT_MS = 120_000;
/** Retired rules first, then questions (review 19.10.2026: the whole consumer call stays inside 50 D1 statements). */
const ALERTS_PER_RUN = 4;

const SCOPE_LABEL: Record<RuleRow['scope'], string> = {
  all: 'роликах всех рубрик',
  igrat: '«Учусь играть»',
  fidit: '«Учу фидить»',
  standalone: 'рилсах вне рубрик',
  telegram: 'постах'
};

const videos = (count: number) =>
  `${count} ${count % 10 === 1 && count % 100 !== 11 ? 'ролик' : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? 'ролика' : 'роликов'}`;

/** The question about one rule; its buttons are `rl:<id>:ok` and `rl:<id>:no` (app/bot/ai-rules.ts). */
export function proposalAlert(rule: RuleRow): NewContentAlert {
  return {
    // Asked once as supported and once more if it becomes strong; new numbers alone ask nothing.
    id: `rule:${rule.id}:${rule.status}`,
    kind: 'item',
    title: 'Правило из аналитики',
    body: rule.text,
    html: [
      `💡 <b>Похоже, работает в ${SCOPE_LABEL[rule.scope]}</b>`,
      `«${escapeHtml(rule.text)}»`,
      `Выше обычного с этим приёмом: ${videos(rule.supports)}; ниже: ${videos(rule.contradicts)}. Это наблюдение, не доказательство.`,
      'Учитывать в новых сценариях?'
    ].join('\n'),
    buttons: [
      { text: '✅ Учитывать', callbackData: `rl:${rule.id}:ok` },
      { text: 'Нет', callbackData: `rl:${rule.id}:no` }
    ],
    linkPath: '/analytics'
  };
}

/**
 * The approved rule the new results took out of prompts (AI plan §6.3: the owner sees every change of what the
 * writer follows): the evidence went against it, so it is retired.
 */
export function retiredAlert(
  rule: Pick<RuleRow, 'id' | 'text' | 'scope' | 'status'>,
  reportId: string
): NewContentAlert {
  return {
    id: `rule-off:${rule.id}:${reportId}`,
    kind: 'item',
    title: 'Правило из аналитики',
    body: rule.text,
    html: [
      `💡 <b>Перестал учитывать в ${SCOPE_LABEL[rule.scope]}</b>`,
      `«${escapeHtml(rule.text)}»`,
      'Новые ролики с этим приёмом чаще ниже обычного.'
    ].join('\n'),
    buttons: [],
    linkPath: '/analytics'
  };
}

/**
 * One measured result per approved script, from one query and one contamination check (review 19.10.2026: the
 * consumer has 50 D1 queries); a script whose videos disagree (above on one platform, below on the other) is left out.
 */
async function ruleVideos(container: Container): Promise<RuleVideo[]> {
  const rows = await container.aiReviews.recentResults({
    from: container.clock.now() - WINDOW_MS,
    limit: RESULTS_READ
  });
  // The owner may have marked the numbers distorted after the review.
  const contaminated = await container.contentAnalytics.contaminatedAmong(rows.map((row) => row.itemId));
  const byScript = new Map<string, RuleVideo | null>();
  for (const row of rows) {
    if (contaminated.has(row.itemId)) continue;
    const key = `script:${row.revisionId}`;
    const seen = byScript.get(key);
    if (seen === null) continue;
    if (seen !== undefined) {
      if (seen.result !== row.result) byScript.set(key, null);
      continue;
    }
    if (byScript.size >= CONSOLIDATION_MAX_VIDEOS) continue;
    byScript.set(key, { key, format: row.format, result: row.result, measuredAt: row.measuredAt, script: row.script });
  }
  return [...byScript.values()].filter((video) => video !== null);
}

export async function runRuleConsolidation(
  reportId: string,
  container: Container,
  requestId: string,
  onError: (error: unknown) => void
): Promise<void> {
  try {
    const { timezone } = await getOwnerOperationsSettings({
      repo: container.settings,
      logger: container.logger,
      requestId
    });
    const result = await consolidateRules(
      {
        repo: container.aiRepository,
        rules: container.aiRules,
        clock: container.clock,
        timezone,
        newId: container.newId,
        provider: container.aiProvider
      },
      {
        videos: await ruleVideos(container),
        sourceRef: reportId,
        signal: AbortSignal.timeout(CONSOLIDATION_TIMEOUT_MS)
      }
    );
    container.logger.info({
      component: 'ai_rules',
      operation: 'consolidate',
      requestId,
      status: result.errorCode === null ? 'ok' : 'skipped',
      errorCode: result.errorCode ?? undefined,
      counts: {
        created: result.created,
        evidence: result.evidence,
        capped: result.capped,
        retired: result.retired.length
      }
    });
    // First: the approval is already off, so a «Перестал учитывать» lost here would never be raised again.
    const alerts = [
      ...result.retired.map((rule) => retiredAlert(rule, reportId)),
      ...result.toApprove.map(proposalAlert)
    ];
    const sent = await container.contentAlerts.existing(alerts.map((alert) => alert.id));
    await container.contentAlerts.insert(
      // One statement each, in a consumer call that also ran the weekly review: the rest wait for next week.
      alerts.filter((alert) => !sent.has(alert.id)).slice(0, ALERTS_PER_RUN),
      container.clock.now()
    );
    await sendBudgetAlerts(
      {
        messenger: container.ownerMessenger,
        ownerChatId: container.ownerChatId,
        readAppOrigin: () => container.systemState.readAppOrigin(),
        charge: () => {},
        logger: container.logger
      },
      result.budgetEvents
    );
  } catch (error) {
    // AI off or out of budget is the owner's switch, not a failure.
    if (!(error instanceof AppError && error.code === 'UNAVAILABLE')) onError(error);
  }
}
