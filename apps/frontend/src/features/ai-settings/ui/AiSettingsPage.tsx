import type { AiCatalogModelDto, AiOverviewDto, UpdateAiSettingsInput } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { useNow } from '../../../shared/lib/use-now';
import {
  Banner,
  Button,
  Disclosure,
  DisclosureGroup,
  ErrorState,
  Icon,
  Panel,
  ProgressBar,
  SegmentedControl,
  Select,
  Skeleton,
  StatusPill,
  Switch,
  VisuallyHidden,
  TextField,
  useToast
} from '../../../shared/ui';
import { aiOverviewQueryOptions, useCheckAiConnection, useSaveAiSettings } from '../api/ai-queries';
import { aiStatus, BUDGET_PRESETS, DAILY_PRESETS, draftCostCents, WARN_PRESETS } from '../model/ai-view';
import { copy, usd } from './copy';
import styles from './AiSettingsPage.module.css';

/** Настройки → ИИ: state and next step on top, this month's spend, models from the provider's list, budget. */
export function AiSettingsPage() {
  const overview = useQuery(aiOverviewQueryOptions());
  if (overview.isError && overview.data === undefined)
    return <ErrorState message={copy.loadError} onRetry={() => void overview.refetch()} />;
  if (overview.data === undefined) return <AiSettingsSkeleton />;
  return <AiSettings overview={overview.data} onReload={() => void overview.refetch()} />;
}

/** The page before its data exists, no request: the status block, three panels at the height they fill, the two disclosures. Also the route skeleton. */
export function AiSettingsSkeleton() {
  const now = useNow();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return (
    <div className={styles.page} aria-busy="true">
      <VisuallyHidden>
        <output>{copy.loading}</output>
      </VisuallyHidden>
      <section className={styles.status} data-tone="muted" aria-hidden="true">
        <div className={styles.statusHead}>
          <div className={styles.statusTitle}>
            <Skeleton width={96} height="1lh" />
          </div>
          <div className={styles.statusActions}>
            <Skeleton width={120} height="var(--size-button)" radius="var(--radius-2)" />
            <Skeleton width={148} height="var(--size-button)" radius="var(--radius-2)" />
          </div>
        </div>
        <p className={styles.statusText}>
          <Skeleton width="60%" height="1lh" />
        </p>
        <p className={styles.meta}>
          <Skeleton width="45%" height="1lh" />
        </p>
      </section>
      <Panel
        title={copy.spendTitle}
        icon={<Icon name="chart" />}
        action={<span className={styles.meta}>{copy.monthLabel(month)}</span>}
        reserveRows={8}
        reservePhoneRows={10}
      >
        <div className={styles.spend}>
          <Skeleton lines={4} height={24} />
        </div>
      </Panel>
      <Panel title={copy.modelsTitle} icon={<Icon name="sparkle" />} reserveRows={3} reservePhoneRows={6}>
        <div className={styles.models}>
          <Skeleton height={36} />
          <Skeleton height={36} />
        </div>
      </Panel>
      <Panel title={copy.voiceTitle} icon={<Icon name="message" />}>
        <p className={styles.voice}>{copy.voiceBody}</p>
      </Panel>
      <Panel title={copy.quality.title(30)} icon={<Icon name="check-circle" />} reserveRows={3} reservePhoneRows={4}>
        <div className={styles.spend}>
          <Skeleton lines={2} height={24} />
        </div>
      </Panel>
      <Panel title={copy.extraTitle} icon={<Icon name="settings" />}>
        <div className={styles.extra}>
          <DisclosureGroup>
            <Disclosure id="prices" title={copy.pricesTitle('OpenAI', `${month}-01`)}>
              {null}
            </Disclosure>
          </DisclosureGroup>
        </div>
      </Panel>
    </div>
  );
}

function modelOption(model: AiCatalogModelDto, role: 'draft' | 'cheap') {
  const cost = role === 'draft' ? ` · ${copy.perDraft(draftCostCents(model))}` : '';
  return { id: model.id, label: model.label, description: `${model.note}${cost}` };
}

/** A visible label beside a choice row (the control keeps its own accessible name). */
function BudgetRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.budgetRow}>
      <span className={styles.budgetLabel} aria-hidden="true">
        {label}
      </span>
      <div>{children}</div>
    </div>
  );
}

function AiSettings({ overview, onReload }: { overview: AiOverviewDto; onReload: () => void }) {
  const save = useSaveAiSettings();
  const check = useCheckAiConnection();
  const toast = useToast();
  const { settings, connection, spend, catalog } = overview;
  const [customBudget, setCustomBudget] = useState<string | null>(null);

  // Every change saves at once on the stored revision, as on «Общие»; a 409 reloads the page's data.
  const change = (patch: Partial<Omit<UpdateAiSettingsInput, 'revision'>>) => {
    const { revision, updatedAt: _updatedAt, ...current } = settings;
    save.mutate(
      { ...current, ...patch, revision },
      {
        onSuccess: () => toast.show({ tone: 'success', title: copy.saved }),
        onError: (error) => {
          const stale = error instanceof ApiError && error.reason === 'STALE_REVISION';
          toast.show({ tone: 'error', title: stale ? copy.conflict : copy.saveFailed });
          if (stale) onReload();
        }
      }
    );
  };

  const runCheck = () =>
    check.mutate(undefined, {
      onSuccess: (data) => {
        const ok = Boolean(data.connection.lastCheck?.ok);
        toast.show({ tone: ok ? 'success' : 'error', title: copy.checked(ok) });
      },
      onError: (error) =>
        toast.show({
          tone: 'error',
          title:
            (error instanceof ApiError && error.reason ? copy.checkBlocked[error.reason] : undefined) ?? copy.saveFailed
        })
    });

  const status = aiStatus(overview);
  const chosenNote = (id: string | null, role: 'draft' | 'cheap') => {
    const model = catalog.models.find((candidate) => candidate.id === id);
    return model === undefined ? null : modelOption(model, role).description;
  };
  const last = connection.lastCheck;
  const share = settings.monthlyBudgetUsd > 0 ? Math.min(100, (spend.spentUsd / settings.monthlyBudgetUsd) * 100) : 0;
  const budgetValue =
    BUDGET_PRESETS.includes(settings.monthlyBudgetUsd) && customBudget === null
      ? String(settings.monthlyBudgetUsd)
      : 'custom';
  const dailyValue = settings.dailyCapUsd >= settings.monthlyBudgetUsd ? 'all' : String(settings.dailyCapUsd);

  return (
    <div className={styles.page}>
      <section className={styles.status} aria-labelledby="ai-status-title" data-tone={status.group}>
        <div className={styles.statusHead}>
          <div className={styles.statusTitle}>
            <h2 id="ai-status-title">{catalog.providerLabel}</h2>
            <StatusPill label={status.label} group={status.group} icon={status.icon} />
          </div>
          <div className={styles.statusActions}>
            <Switch isSelected={settings.enabled} onChange={(enabled) => change({ enabled })}>
              {copy.enabled}
            </Switch>
            <Button
              variant="secondary"
              icon="zap"
              isLoading={check.isPending}
              isDisabled={!connection.keyConfigured || !settings.enabled}
              onPress={runCheck}
            >
              {copy.check}
            </Button>
          </div>
        </div>
        <p className={styles.statusText}>{status.next}</p>
        {!connection.keyConfigured ? (
          <ol className={styles.steps}>
            {copy.keySteps(connection.keyName).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        ) : null}
        {last !== null ? (
          <p className={styles.meta}>
            {copy.lastCheck(
              last.ok,
              new Date(last.at).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }),
              last.model,
              last.errorCode
            )}
          </p>
        ) : null}
      </section>

      {/* Right under the state, not after the whole page: it is why drafts stopped. */}
      {spend.blockedBy === 'monthly_budget' ? <Banner tone="warning" title={copy.blocked.monthly_budget} /> : null}

      {/* Order (owner, 16.10.2026): what the owner changes first — budget, models, voice — then the record. */}
      <Panel
        title={copy.spendTitle}
        icon={<Icon name="chart" />}
        action={<span className={styles.meta}>{copy.monthLabel(spend.month)}</span>}
      >
        <div className={styles.spend}>
          <p className={styles.spendLabel}>{copy.spentIn(spend.month)}</p>
          <div className={styles.spendMain}>
            <p className={styles.spendValue}>
              <strong>{usd(spend.spentUsd)}</strong> {copy.of} {usd(settings.monthlyBudgetUsd)}
            </p>
            <p className={styles.meta}>
              {copy.left(usd(spend.leftUsd))} · {copy.used(share)}
            </p>
          </div>
          <ProgressBar label={copy.spendBar} value={share} tone={share >= 100 ? 'failed' : 'accent'} />
        </div>
        <h3 className={styles.subhead}>{copy.budgetTitle}</h3>
        <div className={styles.budget}>
          <BudgetRow label={copy.monthly}>
            <SegmentedControl
              label={copy.monthly}
              options={[
                ...BUDGET_PRESETS.map((value) => ({ id: String(value), label: `$${value}` })),
                { id: 'custom', label: copy.custom }
              ]}
              value={budgetValue}
              onChange={(id) => {
                if (id === 'custom') setCustomBudget(String(settings.monthlyBudgetUsd));
                else {
                  setCustomBudget(null);
                  change({ monthlyBudgetUsd: Number(id) });
                }
              }}
            />
          </BudgetRow>
          {budgetValue === 'custom' ? (
            <div className={styles.custom}>
              <TextField
                label={copy.customLabel}
                inputMode="decimal"
                value={customBudget ?? String(settings.monthlyBudgetUsd)}
                onChange={setCustomBudget}
              />
              <Button
                variant="secondary"
                onPress={() => {
                  const value = Number((customBudget ?? '').replace(',', '.'));
                  if (Number.isFinite(value) && value >= 0 && value <= 10_000) change({ monthlyBudgetUsd: value });
                  else toast.show({ tone: 'error', title: copy.customInvalid });
                }}
              >
                {copy.apply}
              </Button>
            </div>
          ) : null}
          <p className={styles.meta}>{copy.monthlyHint}</p>
          <BudgetRow label={copy.daily}>
            <SegmentedControl
              label={copy.daily}
              options={[
                ...DAILY_PRESETS.map((value) => ({ id: String(value), label: `$${value}` })),
                { id: 'all', label: copy.noDaily }
              ]}
              value={DAILY_PRESETS.includes(settings.dailyCapUsd) || dailyValue === 'all' ? dailyValue : 'all'}
              onChange={(id) => change({ dailyCapUsd: id === 'all' ? settings.monthlyBudgetUsd : Number(id) })}
            />
          </BudgetRow>
          <BudgetRow label={copy.warnAt}>
            <SegmentedControl
              label={copy.warnAt}
              options={WARN_PRESETS.map((value) => ({ id: String(value), label: `${value}%` }))}
              value={String(settings.warnAtPercent)}
              onChange={(id) => change({ warnAtPercent: Number(id) })}
            />
          </BudgetRow>
        </div>
        <div className={styles.spend}>
          <dl className={styles.facts}>
            <div>
              <dt>{copy.today}</dt>
              <dd>{usd(spend.todayUsd)}</dd>
              <dd className={styles.meta}>
                {spend.byKind.length > 0
                  ? spend.byKind
                      .map((row) => `${copy.kind[row.kind]}: ${row.requests} (${usd(row.spentUsd)})`)
                      .join(', ')
                  : copy.noSpend}
              </dd>
            </div>
            <div>
              <dt>{copy.requests}</dt>
              <dd>{spend.requests}</dd>
            </div>
            <div>
              <dt>{copy.average}</dt>
              <dd>{spend.averageUsd === null ? '—' : usd(spend.averageUsd)}</dd>
            </div>
          </dl>
        </div>
      </Panel>

      <Panel title={copy.modelsTitle} icon={<Icon name="sparkle" />}>
        <p className={styles.intro}>{copy.modelsIntro(catalog.providerLabel)}</p>
        <div className={styles.models}>
          <Select
            label={copy.draftModel}
            description={chosenNote(settings.draftModel, 'draft') ?? copy.draftModelHint}
            options={catalog.models
              .filter((model) => model.roles.includes('draft'))
              .map((model) => modelOption(model, 'draft'))}
            value={settings.draftModel}
            onChange={(draftModel) => change({ draftModel })}
          />
          <Select
            label={copy.cheapModel}
            description={chosenNote(settings.cheapModel, 'cheap') ?? copy.cheapModelHint}
            options={catalog.models
              .filter((model) => model.roles.includes('cheap'))
              .map((model) => modelOption(model, 'cheap'))}
            value={settings.cheapModel}
            onChange={(cheapModel) => change({ cheapModel })}
          />
        </div>
      </Panel>

      <Panel title={copy.voiceTitle} icon={<Icon name="message" />}>
        <p className={styles.voice}>{copy.voiceBody}</p>
      </Panel>

      <QualityPanel quality={overview.quality} />

      <Panel title={copy.extraTitle} icon={<Icon name="settings" />}>
        <div className={styles.extra}>
          <DisclosureGroup>
            <Disclosure id="prices" title={copy.pricesTitle(catalog.providerLabel, catalog.pricesCheckedOn)}>
              <table className={styles.prices}>
                <thead>
                  <tr>
                    <th scope="col">{copy.model}</th>
                    <th scope="col">{copy.input}</th>
                    <th scope="col">{copy.cached}</th>
                    <th scope="col">{copy.output}</th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.models.map((model) => (
                    <tr key={model.id}>
                      <th scope="row">{model.label}</th>
                      <td>${model.inputPerMillion}</td>
                      <td>${model.cachedInputPerMillion}</td>
                      <td>${model.outputPerMillion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={styles.meta}>{copy.pricesHint}</p>
            </Disclosure>
          </DisclosureGroup>
        </div>
      </Panel>
    </div>
  );
}

/** «Качество»: how much the owner changes before approving, and what the checks and buttons say. */
function QualityPanel({ quality }: { quality: AiOverviewDto['quality'] }) {
  const ratio = quality.averageEditRatio;
  const details = copy.quality.details(quality.rewrites, quality.jokeMissed, quality.withWarnings, quality.failed);
  return (
    <Panel title={copy.quality.title(quality.days)} icon={<Icon name="check-circle" />}>
      {quality.drafts + quality.rewrites + quality.failed === 0 ? (
        <p className={styles.intro}>{copy.quality.empty}</p>
      ) : (
        <div className={styles.spend}>
          <dl className={styles.facts}>
            <div>
              <dt>{copy.quality.editRatio}</dt>
              <dd>{ratio === null ? '—' : `${Math.round(ratio * 100)}%`}</dd>
              <dd className={styles.meta}>
                {ratio === null ? copy.quality.noApprovals : copy.quality.editHint(ratio)}
              </dd>
            </div>
            <div>
              <dt>{copy.quality.approved}</dt>
              <dd>
                {quality.approved} {copy.of} {quality.drafts}
              </dd>
              <dd className={styles.meta}>{copy.quality.unchanged(quality.approvedUnchanged)}</dd>
            </div>
            <div>
              <dt>{copy.quality.draftCost}</dt>
              <dd>{quality.averageDraftUsd === null ? '—' : usd(quality.averageDraftUsd)}</dd>
            </div>
          </dl>
          {details ? <p className={styles.meta}>{details}</p> : null}
        </div>
      )}
    </Panel>
  );
}
