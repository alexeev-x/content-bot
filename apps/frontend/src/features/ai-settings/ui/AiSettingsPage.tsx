import type { AiCatalogModelDto, AiOverviewDto, UpdateAiSettingsInput } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import {
  Banner,
  Button,
  Disclosure,
  DisclosureGroup,
  ErrorState,
  Panel,
  ProgressBar,
  SegmentedControl,
  Select,
  Skeleton,
  StatusPill,
  Switch,
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
  if (overview.data === undefined) return <Skeleton height={420} radius="var(--radius-2)" />;
  return <AiSettings overview={overview.data} onReload={() => void overview.refetch()} />;
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

      <Panel title={copy.spendTitle(spend.month)}>
        <div className={styles.spend}>
          <div className={styles.spendMain}>
            <p className={styles.spendValue}>
              <strong>{usd(spend.spentUsd)}</strong> {copy.of} {usd(settings.monthlyBudgetUsd)}
            </p>
            <p className={styles.meta}>{copy.left(usd(spend.leftUsd))}</p>
          </div>
          <ProgressBar label={copy.spendBar} value={share} tone={share >= 100 ? 'failed' : 'accent'} />
          <dl className={styles.facts}>
            <div>
              <dt>{copy.today}</dt>
              <dd>
                {usd(spend.todayUsd)} {copy.of} {usd(settings.dailyCapUsd)}
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
          {spend.byKind.length > 0 ? (
            <p className={styles.meta}>
              {spend.byKind.map((row) => `${copy.kind[row.kind]}: ${row.requests} (${usd(row.spentUsd)})`).join(', ')}
            </p>
          ) : (
            <p className={styles.meta}>{copy.noSpend}</p>
          )}
        </div>
      </Panel>

      <Panel title={copy.modelsTitle} note={copy.modelsNote(catalog.providerLabel)}>
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

      <Panel title={copy.budgetTitle}>
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
      </Panel>

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
        <Disclosure id="voice" title={copy.voiceTitle}>
          <p className={styles.meta}>{copy.voiceBody}</p>
        </Disclosure>
      </DisclosureGroup>

      {spend.blockedBy === 'monthly_budget' ? <Banner tone="warning" title={copy.blocked.monthly_budget} /> : null}
    </div>
  );
}
