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
  IconBadge,
  Panel,
  ProgressBar,
  SegmentedControl,
  Select,
  Skeleton,
  StatGrid,
  StatTile,
  StatusPill,
  Switch,
  VisuallyHidden,
  TextField,
  useToast
} from '../../../shared/ui';
import { aiOverviewQueryOptions, useCheckAiConnection, useSaveAiSettings } from '../api/ai-queries';
import {
  aiStatus,
  approvalPercent,
  BUDGET_PRESETS,
  DAILY_PRESETS,
  draftCostCents,
  lowApproval,
  WARN_PRESETS
} from '../model/ai-view';
import { AiFeedbackList } from './AiFeedbackList';
import { AiLearningList } from './AiLearningList';
import { AiUnlinkedScripts } from './AiUnlinkedScripts';
import { copy, usd } from './copy';
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
  const now = useNow();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return (
    <div className={styles.page} aria-busy="true">
      <VisuallyHidden>
        <output>{copy.loading}</output>
      </VisuallyHidden>
      <section className={styles.status} aria-hidden="true">
        <IconBadge name="sparkle" size="lg" tone="muted" />
        <div className={styles.statusBody}>
          <Skeleton width={160} height="1lh" />
          <Skeleton width="60%" height="1lh" />
          <Skeleton width="40%" height="1lh" />
        </div>
        <div className={styles.statusActions}>
          <Skeleton width={120} height="var(--size-button)" radius="var(--radius-2)" />
          <Skeleton width={120} height="var(--size-button)" radius="var(--radius-2)" />
        </div>
      </section>
      <div className={styles.pair}>
        <Panel
          title={copy.spendTitle}
          icon={<Icon name="chart" />}
          action={<span className={styles.meta}>{copy.monthLabel(month)}</span>}
          reserveRows={6}
          reservePhoneRows={8}
        >
          <div className={styles.body}>
            <Skeleton lines={3} height={24} />
          </div>
        </Panel>
        <Panel title={copy.quality.title(30)} icon={<Icon name="check-circle" />} reserveRows={6} reservePhoneRows={8}>
          <div className={styles.body}>
            <Skeleton lines={3} height={24} />
          </div>
        </Panel>
      </div>
      <Panel title={copy.modelsTitle} icon={<Icon name="settings" />} reserveRows={3} reservePhoneRows={6}>
        <div className={styles.models}>
          <Skeleton height={36} />
          <Skeleton height={36} />
        </div>
      </Panel>
      <Panel title={copy.budgetTitle} icon={<Icon name="zap" />} reserveRows={3} reservePhoneRows={8}>
        <div className={styles.body}>
          <Skeleton lines={2} height={32} />
        </div>
      </Panel>
      <Panel title={copy.voiceTitle} icon={<Icon name="message" />}>
        <p className={styles.voice}>{copy.voiceBody}</p>
      </Panel>
      <div className={styles.extra}>
        <DisclosureGroup>
          <Disclosure id="prices" title={copy.pricesTitle('OpenAI', `${month}-01`)}>
            {null}
          </Disclosure>
        </DisclosureGroup>
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
  const share = settings.monthlyBudgetUsd > 0 ? Math.min(100, (spend.spentUsd / settings.monthlyBudgetUsd) * 100) : 0;
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

      <div className={styles.pair}>
        <Panel
          title={copy.spendTitle}
          icon={<Icon name="chart" />}
          action={<span className={styles.meta}>{copy.monthLabel(spend.month)}</span>}
        >
          <div className={styles.body}>
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
            <StatGrid columns="two">
              <StatTile
                label={copy.tiles.left}
                value={usd(spend.leftUsd)}
                meta={copy.tiles.leftShare(share)}
                icon="wallet"
                tone="muted"
                iconAt="start"
              />
              <StatTile
                icon="calendar"
                tone="muted"
                iconAt="start"
                label={copy.tiles.today}
                value={usd(spend.todayUsd)}
                meta={dailyValue === 'all' ? null : copy.tiles.dailyOf(usd(settings.dailyCapUsd))}
              />
              <StatTile
                icon="file"
                tone="muted"
                iconAt="start"
                label={copy.tiles.requests}
                value={spend.requests}
                meta={
                  spend.byKind.length > 0
                    ? spend.byKind.map((row) => `${copy.kind[row.kind]}: ${row.requests}`).join(', ')
                    : copy.noSpend
                }
              />
              <StatTile
                label={copy.tiles.average}
                value={spend.averageUsd === null ? '—' : usd(spend.averageUsd)}
                icon="tag"
                tone="muted"
                iconAt="start"
              />
            </StatGrid>
          </div>
        </Panel>

        <QualityPanel quality={overview.quality} />
      </div>

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

      <Panel title={copy.voiceTitle} icon={<Icon name="message" />}>
        <p className={styles.voice}>{copy.voiceBody}</p>
      </Panel>

      <div className={styles.extra}>
        <DisclosureGroup>
          <Disclosure id="prices" title={copy.pricesTitle(catalog.providerLabel, catalog.pricesCheckedOn)}>
            <div className={styles.pricesBody}>
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
            </div>
          </Disclosure>
        </DisclosureGroup>
      </div>
    </div>
  );
}

/** «Качество»: how much the owner changes before approving, and what the checks and buttons say. */
function QualityPanel({ quality }: { quality: AiOverviewDto['quality'] }) {
  const ratio = quality.averageEditRatio;
  const details = copy.quality.details(quality.questions ?? 0, quality.withWarnings, quality.failed);
  // An older server sends only the «Шутка не зашла» count.
  const verdicts =
    quality.feedback ?? (quality.jokeMissed > 0 ? [{ kind: 'joke_missed' as const, count: quality.jokeMissed }] : []);
  // The three parts changed most, from a tenth of approvals up: rarer ones are noise at this volume.
  const parts = quality.changedParts.filter((row) => row.share >= 0.1).slice(0, 3);
  const approved = approvalPercent(quality);
  // The list loads only once opened: most visits never look at it.
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const verdictCount = verdicts.reduce((total, row) => total + row.count, 0);
  const [learningOpen, setLearningOpen] = useState(false);
  const [unlinkedOpen, setUnlinkedOpen] = useState(false);
  const studioRuns = quality.studioDrafts ?? 0;
  return (
    <Panel title={copy.quality.title(quality.days)} icon={<Icon name="check-circle" />}>
      {quality.drafts + quality.rewrites + (quality.questions ?? 0) + quality.failed === 0 ? (
        <div className={styles.body}>
          <p className={styles.meta}>{copy.quality.empty}</p>
          {studioRuns > 0 ? <p className={styles.meta}>{copy.quality.studioRuns(studioRuns)}</p> : null}
        </div>
      ) : (
        <div className={styles.body}>
          <p className={styles.spendLabel}>{copy.quality.lead}</p>
          <StatGrid columns="two">
            <StatTile
              icon="file"
              tone="muted"
              iconAt="start"
              label={copy.quality.editRatio}
              value={ratio === null ? '—' : `${Math.round(ratio * 100)}%`}
              meta={ratio === null ? copy.quality.noApprovals : copy.quality.editHint(ratio)}
            />
            <StatTile
              icon="check-circle"
              tone="done"
              iconAt="start"
              label={copy.quality.approved}
              value={`${quality.approved} ${copy.of} ${quality.drafts}`}
              meta={[
                approved === null ? null : copy.quality.approvedShare(approved),
                copy.quality.unchanged(quality.approvedUnchanged)
              ]
                .filter(Boolean)
                .join(' · ')}
            />
            <StatTile
              icon="tag"
              tone="muted"
              iconAt="start"
              label={copy.quality.draftCost}
              value={quality.averageDraftUsd === null ? '—' : usd(quality.averageDraftUsd)}
              meta={copy.quality.draftCostMeta}
            />
            <StatTile
              label={copy.quality.rewrites}
              value={quality.rewrites}
              meta={copy.quality.rewritesMeta}
              icon="retry"
              tone="muted"
              iconAt="start"
            />
          </StatGrid>
          {lowApproval(quality) && approved !== null ? (
            <Banner tone="warning" size="sm" title={copy.quality.lowTitle(approved)} />
          ) : null}
          {/* The secondary counts, under a rule as one quiet footer (design-refs/ai-spend-quality). */}
          {parts.length > 0 || verdicts.length > 0 || details || studioRuns > 0 ? (
            <div className={styles.notes}>
              <Icon name="info" size={16} className={styles.notesIcon} />
              <div className={styles.notesText}>
                {parts.length > 0 ? (
                  <p className={styles.meta}>
                    {copy.quality.partsLead}
                    {parts.map((row) => `${copy.quality.part[row.part]} — ${Math.round(row.share * 100)}%`).join(' · ')}
                  </p>
                ) : null}
                {verdicts.length > 0 ? (
                  <p className={styles.meta}>
                    {copy.quality.feedbackLead}
                    {verdicts.map((row) => `${copy.quality.feedback[row.kind]} — ${row.count}`).join(' · ')}
                  </p>
                ) : null}
                {details ? <p className={styles.meta}>{details}</p> : null}
                {studioRuns > 0 ? <p className={styles.meta}>{copy.quality.studioRuns(studioRuns)}</p> : null}
              </div>
            </div>
          ) : null}
          {verdictCount > 0 ? (
            <DisclosureGroup
              expandedKeys={feedbackOpen ? ['feedback'] : []}
              onExpandedChange={(keys) => setFeedbackOpen(keys.has('feedback'))}
            >
              <Disclosure id="feedback" title={copy.quality.feedbackListTitle(verdictCount)}>
                {feedbackOpen ? <AiFeedbackList /> : null}
              </Disclosure>
            </DisclosureGroup>
          ) : null}
        </div>
      )}
      <div className={styles.body}>
        <DisclosureGroup
          expandedKeys={learningOpen ? ['learning'] : []}
          onExpandedChange={(keys) => setLearningOpen(keys.has('learning'))}
        >
          <Disclosure id="learning" title={copy.learning.title}>
            {learningOpen ? <AiLearningList /> : null}
          </Disclosure>
        </DisclosureGroup>
        <DisclosureGroup
          expandedKeys={unlinkedOpen ? ['unlinked'] : []}
          onExpandedChange={(keys) => setUnlinkedOpen(keys.has('unlinked'))}
        >
          <Disclosure id="unlinked" title={copy.unlinked.title}>
            {unlinkedOpen ? <AiUnlinkedScripts /> : null}
          </Disclosure>
        </DisclosureGroup>
      </div>
    </Panel>
  );
}
