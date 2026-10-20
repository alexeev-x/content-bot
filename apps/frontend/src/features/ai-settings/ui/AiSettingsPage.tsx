import type { AiCatalogModelDto, AiOverviewDto, UpdateAiSettingsInput } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import {
  Banner,
  Button,
  ErrorState,
  Icon,
  IconBadge,
  Panel,
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
import { AiMoneyPanel } from './AiMoneyPanel';
import { copy } from './copy';
import styles from './AiSettingsPage.module.css';

/**
 * Настройки → ИИ (design-refs/ai-settings): the state and the next step on top, then spend beside quality,
 * the models, the budget beside the voice, and the price list folded at the end.
 */
export function AiSettingsPage() {
  const overview = useQuery(aiOverviewQueryOptions());
  if (overview.isError && overview.data === undefined)
    return <ErrorState message={copy.loadError} onRetry={() => void overview.refetch()} />;
  if (overview.data === undefined) return <AiSettingsSkeleton />;
  return <AiSettings overview={overview.data} onReload={() => void overview.refetch()} />;
}

/** The page before its data exists, no request: the same blocks at the height they fill. Also the route skeleton. */
export function AiSettingsSkeleton() {
  return (
    <div className={styles.page} aria-busy="true">
      <VisuallyHidden>
        <output>{copy.loading}</output>
      </VisuallyHidden>
      {/* Disabled look-alike controls: hidden from assistive technology, which hears only the loading status. */}
      <div className={styles.contents} aria-hidden="true">
        <section className={styles.status} aria-hidden="true">
          <IconBadge name="sparkle" size="lg" tone="muted" />
          <div className={styles.statusBody}>
            <div className={styles.statusTitle}>
              <h2>OpenAI</h2>
              <Skeleton width={96} height="1lh" radius="var(--radius-pill)" />
            </div>
            <p className={styles.statusText}>
              <Skeleton width="60%" height="1lh" />
            </p>
            <p className={styles.meta}>
              <Skeleton lines={2} width="70%" height="1lh" />
            </p>
          </div>
          <div className={styles.statusActions}>
            <Switch isDisabled isSelected={false}>
              {copy.enabled}
            </Switch>
            <Button variant="secondary" icon="zap" isDisabled>
              {copy.check}
            </Button>
          </div>
        </section>
        <AiMoneyPanel overview={undefined} />
        <Panel title={copy.modelsTitle} icon={<Icon name="settings" />}>
          <p className={styles.intro}>{copy.modelsIntro('OpenAI')}</p>
          <div className={styles.models}>
            <Select
              label={copy.draftModel}
              description={copy.draftModelHint}
              options={[]}
              value={null}
              isDisabled
              onChange={() => {}}
            />
            <Select
              label={copy.cheapModel}
              description={copy.cheapModelHint}
              options={[]}
              value={null}
              isDisabled
              onChange={() => {}}
            />
          </div>
          <div className={styles.reviewSwitch}>
            <Switch variant="row" description={copy.videoReviewsHint} isDisabled isSelected={false}>
              {copy.videoReviews}
            </Switch>
          </div>
        </Panel>
        <Panel title={copy.budgetTitle} icon={<Icon name="zap" />}>
          <div className={styles.body}>
            <div className={styles.budget}>
              <BudgetColumn label={copy.monthly}>
                <SegmentedControl
                  label={copy.monthly}
                  options={[
                    ...BUDGET_PRESETS.map((value) => ({ id: String(value), label: `$${value}` })),
                    { id: 'custom', label: copy.custom }
                  ]}
                  value=""
                  isDisabled
                  onChange={() => {}}
                />
              </BudgetColumn>
              <BudgetColumn label={copy.daily}>
                <SegmentedControl
                  label={copy.daily}
                  options={[
                    ...DAILY_PRESETS.map((value) => ({ id: String(value), label: `$${value}` })),
                    { id: 'all', label: copy.noDaily }
                  ]}
                  value=""
                  isDisabled
                  onChange={() => {}}
                />
              </BudgetColumn>
              <BudgetColumn label={copy.warnAt}>
                <SegmentedControl
                  label={copy.warnAt}
                  options={WARN_PRESETS.map((value) => ({ id: String(value), label: `${value}%` }))}
                  value=""
                  isDisabled
                  onChange={() => {}}
                />
              </BudgetColumn>
            </div>
            <p className={styles.meta}>{copy.monthlyHint}</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function modelOption(model: AiCatalogModelDto, role: 'draft' | 'cheap') {
  const cost = role === 'draft' ? ` · ${copy.perDraft(draftCostCents(model))}` : '';
  return { id: model.id, label: model.label, description: `${model.note}${cost}` };
}

/** A visible label above a choice row (the control keeps its own accessible name). */
function BudgetColumn({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.budgetColumn}>
      <span className={styles.budgetLabel} aria-hidden="true">
        {label}
      </span>
      {children}
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
  const budgetValue =
    BUDGET_PRESETS.includes(settings.monthlyBudgetUsd) && customBudget === null
      ? String(settings.monthlyBudgetUsd)
      : 'custom';
  const dailyValue = settings.dailyCapUsd >= settings.monthlyBudgetUsd ? 'all' : String(settings.dailyCapUsd);

  return (
    <div className={styles.page}>
      <section className={styles.status} aria-labelledby="ai-status-title" data-tone={status.group}>
        <IconBadge name="sparkle" size="lg" tone={status.group === 'done' ? 'accent' : status.group} />
        <div className={styles.statusBody}>
          <div className={styles.statusTitle}>
            <h2 id="ai-status-title">{catalog.providerLabel}</h2>
            <StatusPill label={status.label} group={status.group} icon={status.icon} />
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
      </section>

      {/* Right under the state, not after the whole page: it is why drafts stopped. */}
      {spend.blockedBy === 'monthly_budget' ? <Banner tone="warning" title={copy.blocked.monthly_budget} /> : null}

      {/* The month's money beside the budget it is set against (owner, 20.10.2026). */}
      <AiMoneyPanel overview={overview} />

      <Panel title={copy.modelsTitle} icon={<Icon name="settings" />}>
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
        <div className={styles.reviewSwitch}>
          <Switch
            variant="row"
            description={copy.videoReviewsHint}
            isSelected={settings.videoReviews}
            onChange={(videoReviews) => change({ videoReviews })}
          >
            {copy.videoReviews}
          </Switch>
        </div>
      </Panel>

      <Panel title={copy.budgetTitle} icon={<Icon name="zap" />}>
        <div className={styles.body}>
          <div className={styles.budget}>
            <BudgetColumn label={copy.monthly}>
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
            </BudgetColumn>
            <BudgetColumn label={copy.daily}>
              <SegmentedControl
                label={copy.daily}
                options={[
                  ...DAILY_PRESETS.map((value) => ({ id: String(value), label: `$${value}` })),
                  { id: 'all', label: copy.noDaily }
                ]}
                value={DAILY_PRESETS.includes(settings.dailyCapUsd) || dailyValue === 'all' ? dailyValue : 'all'}
                onChange={(id) => change({ dailyCapUsd: id === 'all' ? settings.monthlyBudgetUsd : Number(id) })}
              />
            </BudgetColumn>
            <BudgetColumn label={copy.warnAt}>
              <SegmentedControl
                label={copy.warnAt}
                options={WARN_PRESETS.map((value) => ({ id: String(value), label: `${value}%` }))}
                value={String(settings.warnAtPercent)}
                onChange={(id) => change({ warnAtPercent: Number(id) })}
              />
            </BudgetColumn>
          </div>
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
        </div>
      </Panel>
    </div>
  );
}
