import {
  AI_USAGE_KINDS,
  type AiModelPriceDto,
  type AiOverviewDto,
  type AiSettingsDto,
  type AiSpendDto,
  type AiUsageKind,
  aiSettingsSchema,
  type UpdateAiSettingsInput
} from '@alexeev/contracts';
import type { Clock } from '../../platform/clock';
import { AppError } from '../../shared/app-error';
import type { AiRepository } from './d1-ai-repository';
import { AI_CATALOG } from './catalog';
import { type AiTextProvider, type AiUsage, AiProviderError } from './ports';

// Defaults: AI off until the owner turns it on; the recommended models of the catalog (catalog.ts), whose
// prices apply unless the owner sets his own.
const DEFAULTS: Omit<AiSettingsDto, 'revision' | 'updatedAt'> = {
  provider: 'openai',
  enabled: false,
  draftModel: 'gpt-6.1-sol',
  cheapModel: 'gpt-6-luna',
  prices: [],
  monthlyBudgetUsd: 5,
  dailyCapUsd: 1,
  warnAtPercent: 80
};
/** OpenAI bills input written to the prompt cache at 1.25x the input price. */
const CACHE_WRITE_FACTOR = 1.25;
const CHECK_TIMEOUT_MS = 20_000;

export const AI_KEY_NAME: Record<AiSettingsDto['provider'], string> = { openai: 'OPENAI_API_KEY' };

function toUsd(micro: number): number {
  return Math.round(micro) / 1_000_000;
}

/** Owner-zone parts of an instant. */
function zonedParts(at: number, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(at));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    seconds: get('hour') * 3600 + get('minute') * 60 + get('second')
  };
}

/** The owner-zone start of today and of this month (a DST change inside the month shifts it by an hour at most). */
export function spendWindows(
  now: number,
  timezone: string
): { dayStart: number; monthStart: number; month: string; day: string } {
  const parts = zonedParts(now, timezone);
  const dayStart = now - parts.seconds * 1000 - (now % 1000);
  const monthStart = dayStart - (parts.day - 1) * 24 * 60 * 60 * 1000;
  const month = `${parts.year}-${String(parts.month).padStart(2, '0')}`;
  return { dayStart, monthStart, month, day: `${month}-${String(parts.day).padStart(2, '0')}` };
}

/**
 * The price of the model that answered: its own row, or for a dated snapshot («gpt-6-luna-2026-09-01») its
 * base model's. Never a prefix match (gpt-5 must not price gpt-5-pro).
 */
export function priceFor(prices: readonly AiModelPriceDto[], model: string): AiModelPriceDto | undefined {
  return (
    prices.find((candidate) => candidate.model === model) ??
    prices.find(
      (candidate) =>
        model.startsWith(candidate.model) && /^-\d{4}-\d{2}-\d{2}$/.test(model.slice(candidate.model.length))
    )
  );
}

/** The owner's own prices first, then the provider catalog's. */
export function effectivePrices(settings: Pick<AiSettingsDto, 'provider' | 'prices'>): AiModelPriceDto[] {
  const own = new Set(settings.prices.map((price) => price.model));
  return [
    ...settings.prices,
    ...AI_CATALOG[settings.provider].models
      .filter((model) => !own.has(model.id))
      .map(({ id, inputPerMillion, cachedInputPerMillion, outputPerMillion }) => ({
        model: id,
        inputPerMillion,
        cachedInputPerMillion,
        outputPerMillion
      }))
  ];
}

/** Cost in micro-USD from the model's price, or null when the model has none. */
export function costMicroUsd(usage: AiUsage, price: AiModelPriceDto | undefined): number | null {
  if (price === undefined) return null;
  const cached = Math.min(usage.cachedInputTokens, usage.inputTokens);
  const written = Math.min(usage.cacheWriteTokens, usage.inputTokens - cached);
  const plain = usage.inputTokens - cached - written;
  // USD per 1M tokens is micro-USD per token.
  return Math.round(
    plain * price.inputPerMillion +
      written * price.inputPerMillion * CACHE_WRITE_FACTOR +
      cached * price.cachedInputPerMillion +
      usage.outputTokens * price.outputPerMillion
  );
}

export async function readAiSettings(repo: AiRepository): Promise<AiSettingsDto> {
  const stored = await repo.readSettings();
  if (stored === null) return { ...DEFAULTS, revision: 0, updatedAt: null };
  const parsed = aiSettingsSchema.safeParse({
    ...DEFAULTS,
    ...(JSON.parse(stored.document) as object),
    revision: stored.revision,
    updatedAt: new Date(stored.updatedAt).toISOString()
  });
  // A document this code cannot read is never guessed at: AI stays off until the owner saves again.
  return parsed.success
    ? parsed.data
    : { ...DEFAULTS, enabled: false, revision: stored.revision, updatedAt: new Date(stored.updatedAt).toISOString() };
}

export async function updateAiSettings(
  deps: { repo: AiRepository; clock: Clock },
  input: UpdateAiSettingsInput
): Promise<void> {
  const { revision, ...document } = input;
  const prices = effectivePrices(document);
  // Spend is counted from prices: a chosen model without one would never count against the budget.
  if (
    [document.draftModel, document.cheapModel].some((model) => model !== null && priceFor(prices, model) === undefined)
  )
    throw new AppError('VALIDATION_ERROR', 'Every chosen model needs a price', { reason: 'NO_PRICE' });
  const saved = await deps.repo.saveSettings({
    document: JSON.stringify(document),
    expectedRevision: revision,
    now: deps.clock.now()
  });
  if (!saved) throw new AppError('CONFLICT', 'AI settings changed elsewhere', { reason: 'STALE_REVISION' });
}

async function readSpend(
  deps: { repo: AiRepository; clock: Clock; timezone: string },
  settings: AiSettingsDto,
  keyConfigured: boolean
): Promise<AiSpendDto> {
  const window = spendWindows(deps.clock.now(), deps.timezone);
  const rows = await deps.repo.readSpend({ monthStart: window.monthStart, dayStart: window.dayStart });
  const spentMicro = rows.byKind.reduce((sum, row) => sum + row.costMicroUsd, 0);
  const requests = rows.byKind.reduce((sum, row) => sum + row.requests, 0);
  const unpriced = rows.byKind.reduce((sum, row) => sum + row.unpriced, 0);
  const priced = requests - unpriced;
  const spentUsd = toUsd(spentMicro);
  const todayUsd = toUsd(rows.todayMicroUsd);
  const blockedBy: AiSpendDto['blockedBy'] = !settings.enabled
    ? 'disabled'
    : !keyConfigured
      ? 'no_key'
      : settings.draftModel === null && settings.cheapModel === null
        ? 'no_model'
        : [settings.draftModel, settings.cheapModel].some(
              (model) => model !== null && priceFor(effectivePrices(settings), model) === undefined
            )
          ? 'no_price'
          : spentUsd >= settings.monthlyBudgetUsd
            ? 'monthly_budget'
            : todayUsd >= settings.dailyCapUsd
              ? 'daily_cap'
              : null;
  return {
    month: window.month,
    spentUsd,
    todayUsd,
    leftUsd: Math.max(0, Math.round((settings.monthlyBudgetUsd - spentUsd) * 1_000_000) / 1_000_000),
    requests,
    averageUsd: priced > 0 ? toUsd(spentMicro / priced) : null,
    unpricedRequests: unpriced,
    byKind: AI_USAGE_KINDS.map((kind) => {
      const row = rows.byKind.find((candidate) => candidate.kind === kind);
      return { kind, requests: row?.requests ?? 0, spentUsd: toUsd(row?.costMicroUsd ?? 0) };
    }).filter((row) => row.requests > 0),
    blockedBy
  };
}

export async function readAiOverview(deps: {
  repo: AiRepository;
  clock: Clock;
  timezone: string;
  keyConfigured: boolean;
}): Promise<AiOverviewDto> {
  const settings = await readAiSettings(deps.repo);
  const [spend, lastCheck] = await Promise.all([
    readSpend(deps, settings, deps.keyConfigured),
    deps.repo.readLastCheck()
  ]);
  return {
    settings,
    connection: {
      provider: settings.provider,
      keyConfigured: deps.keyConfigured,
      keyName: AI_KEY_NAME[settings.provider],
      lastCheck:
        lastCheck === null
          ? null
          : {
              at: new Date(lastCheck.at).toISOString(),
              ok: lastCheck.ok,
              model: lastCheck.model,
              errorCode: lastCheck.errorCode
            }
    },
    spend,
    catalog: AI_CATALOG[settings.provider]
  };
}

/** A budget threshold crossed by a recorded request; each is reported once per period. */
export type BudgetEvent =
  | { kind: 'warn'; spentUsd: number; budgetUsd: number; leftUsd: number; averageUsd: number | null }
  | { kind: 'stop'; spentUsd: number; budgetUsd: number }
  | { kind: 'daily'; todayUsd: number; capUsd: number };

/**
 * Records one request's usage with its cost and returns the budget thresholds this request crossed for the
 * first time in the period (80 % of the month, the month's budget, the day's cap). The caller tells the owner.
 */
export async function recordAiUsage(
  deps: { repo: AiRepository; clock: Clock; timezone: string; newId: () => string },
  input: { kind: AiUsageKind; provider: string; model: string; usage: AiUsage; settings: AiSettingsDto }
): Promise<BudgetEvent[]> {
  const now = deps.clock.now();
  const price = priceFor(effectivePrices(input.settings), input.model);
  await deps.repo.recordUsage({
    id: deps.newId(),
    at: now,
    kind: input.kind,
    provider: input.provider,
    // A provider name longer than the column must not lose a paid request's record.
    model: input.model.slice(0, 80),
    usage: input.usage,
    costMicroUsd: costMicroUsd(input.usage, price)
  });
  const settings = input.settings;
  const spend = await readSpend(deps, settings, true);
  const window = spendWindows(now, deps.timezone);
  const events: BudgetEvent[] = [];
  if (settings.monthlyBudgetUsd > 0 && spend.spentUsd >= settings.monthlyBudgetUsd) {
    if (await deps.repo.claimBudgetAlert(`stop:${window.month}`, now))
      events.push({ kind: 'stop', spentUsd: spend.spentUsd, budgetUsd: settings.monthlyBudgetUsd });
  } else if (
    settings.monthlyBudgetUsd > 0 &&
    spend.spentUsd >= (settings.monthlyBudgetUsd * settings.warnAtPercent) / 100 &&
    (await deps.repo.claimBudgetAlert(`warn:${window.month}`, now))
  ) {
    events.push({
      kind: 'warn',
      spentUsd: spend.spentUsd,
      budgetUsd: settings.monthlyBudgetUsd,
      leftUsd: spend.leftUsd,
      averageUsd: spend.averageUsd
    });
  }
  if (
    settings.dailyCapUsd > 0 &&
    spend.todayUsd >= settings.dailyCapUsd &&
    (await deps.repo.claimBudgetAlert(`day:${window.day}`, now))
  )
    events.push({ kind: 'daily', todayUsd: spend.todayUsd, capUsd: settings.dailyCapUsd });
  return events;
}

/**
 * «Проверить подключение»: one tiny request to the cheap model (or the draft model). A provider failure is the
 * check's result, not an API error; it is stored for the page. Refused before any request when AI is off, the
 * key or a model is missing, or the budget is spent.
 */
export async function checkAiConnection(deps: {
  repo: AiRepository;
  clock: Clock;
  timezone: string;
  newId: () => string;
  provider: AiTextProvider | null;
}): Promise<BudgetEvent[]> {
  const settings = await readAiSettings(deps.repo);
  const spend = await readSpend(deps, settings, deps.provider !== null);
  const model = settings.cheapModel ?? settings.draftModel;
  if (deps.provider === null) throw new AppError('UNAVAILABLE', 'The AI key is not set', { reason: 'NO_KEY' });
  if (!settings.enabled) throw new AppError('UNAVAILABLE', 'AI is turned off', { reason: 'DISABLED' });
  if (model === null) throw new AppError('UNAVAILABLE', 'No model is chosen', { reason: 'NO_MODEL' });
  // A request without a price would never count against the budget: refused, not run for free.
  if (spend.blockedBy === 'no_price')
    throw new AppError('UNAVAILABLE', 'The chosen model has no price', { reason: 'NO_PRICE' });
  if (spend.blockedBy === 'monthly_budget' || spend.blockedBy === 'daily_cap')
    throw new AppError('UNAVAILABLE', 'The AI budget is spent', { reason: 'BUDGET' });
  try {
    const result = await deps.provider.complete({
      model,
      instructions: 'Ответь одним словом.',
      input: 'Скажи «работает».',
      // Room for a reasoning model's thinking before the one word.
      maxOutputTokens: 1000,
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS)
    });
    await deps.repo.saveCheck({
      at: deps.clock.now(),
      ok: result.text !== '',
      model: result.model,
      errorCode: result.text === '' ? 'AI_EMPTY_ANSWER' : null
    });
    return await recordAiUsage(deps, {
      kind: 'check',
      provider: deps.provider.provider,
      model: result.model,
      usage: result.usage,
      settings
    });
  } catch (error) {
    if (!(error instanceof AiProviderError)) throw error;
    await deps.repo.saveCheck({ at: deps.clock.now(), ok: false, model, errorCode: error.code });
    return [];
  }
}
