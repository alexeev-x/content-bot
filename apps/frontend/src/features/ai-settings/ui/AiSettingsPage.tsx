import { type AiOverviewDto, type AiSettingsDto, updateAiSettingsInputSchema } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { Banner, Button, ErrorState, Panel, Skeleton, Switch, TextField, useToast } from '../../../shared/ui';
import { aiOverviewQueryOptions, useCheckAiConnection, useSaveAiSettings } from '../api/ai-queries';
import { copy, usd } from './copy';
import styles from './AiSettingsPage.module.css';

type PriceDraft = { model: string; input: string; cached: string; output: string };
type Draft = {
  enabled: boolean;
  draftModel: string;
  cheapModel: string;
  prices: PriceDraft[];
  monthly: string;
  daily: string;
  warnAt: string;
};

const num = (value: string) => Number(value.replace(',', '.').trim());

function toDraft(settings: AiSettingsDto): Draft {
  return {
    enabled: settings.enabled,
    draftModel: settings.draftModel ?? '',
    cheapModel: settings.cheapModel ?? '',
    prices: settings.prices.map((price) => ({
      model: price.model,
      input: String(price.inputPerMillion),
      cached: String(price.cachedInputPerMillion),
      output: String(price.outputPerMillion)
    })),
    monthly: String(settings.monthlyBudgetUsd),
    daily: String(settings.dailyCapUsd),
    warnAt: String(settings.warnAtPercent)
  };
}

/** Настройки → ИИ: connection, models, prices, budget, this month's spend and the voice data. */
export function AiSettingsPage() {
  const overview = useQuery(aiOverviewQueryOptions());
  if (overview.isError && overview.data === undefined)
    return <ErrorState message={copy.loadError} onRetry={() => void overview.refetch()} />;
  if (overview.data === undefined) return <Skeleton height={420} radius="var(--radius-2)" />;
  return <AiSettingsForm key={overview.data.settings.revision} overview={overview.data} />;
}

function AiSettingsForm({ overview }: { overview: AiOverviewDto }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(overview.settings));
  const [invalid, setInvalid] = useState(false);
  const save = useSaveAiSettings();
  const check = useCheckAiConnection();
  const toast = useToast();
  const patch = (next: Partial<Draft>) => setDraft((current) => ({ ...current, ...next }));
  const setPrice = (index: number, next: Partial<PriceDraft>) =>
    patch({ prices: draft.prices.map((price, at) => (at === index ? { ...price, ...next } : price)) });

  const submit = () => {
    const parsed = updateAiSettingsInputSchema.safeParse({
      revision: overview.settings.revision,
      provider: overview.settings.provider,
      enabled: draft.enabled,
      draftModel: draft.draftModel.trim() || null,
      cheapModel: draft.cheapModel.trim() || null,
      prices: draft.prices
        .filter((price) => price.model.trim() !== '')
        .map((price) => ({
          model: price.model.trim(),
          inputPerMillion: num(price.input),
          cachedInputPerMillion: num(price.cached),
          outputPerMillion: num(price.output)
        })),
      monthlyBudgetUsd: num(draft.monthly),
      dailyCapUsd: num(draft.daily),
      warnAtPercent: num(draft.warnAt)
    });
    setInvalid(!parsed.success);
    if (!parsed.success) return;
    save.mutate(parsed.data, {
      onSuccess: () => toast.show({ tone: 'success', title: copy.saved }),
      onError: (error) =>
        toast.show({
          tone: 'error',
          title: error instanceof ApiError && error.reason === 'STALE_REVISION' ? copy.conflict : copy.saveFailed
        })
    });
  };

  const runCheck = () =>
    check.mutate(undefined, {
      onSuccess: (data) =>
        toast.show({
          tone: data.connection.lastCheck?.ok ? 'success' : 'error',
          title: copy.checked(Boolean(data.connection.lastCheck?.ok))
        }),
      onError: (error) =>
        toast.show({
          tone: 'error',
          title:
            (error instanceof ApiError && error.reason ? copy.checkBlocked[error.reason] : undefined) ?? copy.saveFailed
        })
    });

  const { connection, spend } = overview;
  const last = connection.lastCheck;
  return (
    <div className={styles.page}>
      <Panel title={copy.connectionTitle} note={`${copy.provider}: ${copy.providerName}`}>
        <div className={styles.body}>
          {connection.keyConfigured ? (
            <Banner tone="info" title={copy.keyOk} />
          ) : (
            <Banner tone="warning" title={copy.keyMissing(connection.keyName)} />
          )}
          <Switch
            variant="row"
            isSelected={draft.enabled}
            onChange={(enabled) => patch({ enabled })}
            description={copy.enabledHint}
          >
            {copy.enabled}
          </Switch>
          <div className={styles.row}>
            <Button variant="secondary" icon="zap" isLoading={check.isPending} onPress={runCheck}>
              {copy.check}
            </Button>
            <span className={styles.note}>
              {last === null
                ? copy.never
                : copy.lastCheck(last.ok, new Date(last.at).toLocaleString('ru-RU'), last.model, last.errorCode)}
            </span>
          </div>
          <p className={styles.note}>{copy.checkHint}</p>
        </div>
      </Panel>

      <Panel title={copy.modelsTitle} note={copy.modelsNote}>
        <div className={styles.grid}>
          <TextField
            label={copy.draftModel}
            description={copy.draftModelHint}
            value={draft.draftModel}
            onChange={(draftModel) => patch({ draftModel })}
          />
          <TextField
            label={copy.cheapModel}
            description={copy.cheapModelHint}
            value={draft.cheapModel}
            onChange={(cheapModel) => patch({ cheapModel })}
          />
        </div>
      </Panel>

      <Panel title={copy.pricesTitle} note={copy.pricesNote}>
        <div className={styles.body}>
          <p className={styles.note}>{copy.pricesHint}</p>
          {draft.prices.map((price, index) => (
            // The row's position is its identity while the owner types a new model name into it.
            // oxlint-disable-next-line react/no-array-index-key
            <div key={index} className={styles.priceRow}>
              <TextField label={copy.model} value={price.model} onChange={(model) => setPrice(index, { model })} />
              <TextField
                label={copy.input}
                inputMode="decimal"
                value={price.input}
                onChange={(input) => setPrice(index, { input })}
              />
              <TextField
                label={copy.cached}
                inputMode="decimal"
                value={price.cached}
                onChange={(cached) => setPrice(index, { cached })}
              />
              <TextField
                label={copy.output}
                inputMode="decimal"
                value={price.output}
                onChange={(output) => setPrice(index, { output })}
              />
              <Button
                variant="ghost"
                size="sm"
                onPress={() => patch({ prices: draft.prices.filter((_, at) => at !== index) })}
              >
                {copy.removePrice}
              </Button>
            </div>
          ))}
          {draft.prices.length < 10 ? (
            <div>
              <Button
                variant="secondary"
                size="sm"
                icon="plus"
                onPress={() =>
                  patch({ prices: [...draft.prices, { model: '', input: '0', cached: '0', output: '0' }] })
                }
              >
                {copy.addPrice}
              </Button>
            </div>
          ) : null}
        </div>
      </Panel>

      <Panel title={copy.budgetTitle}>
        <div className={styles.grid}>
          <TextField
            label={copy.monthly}
            description={copy.monthlyHint}
            inputMode="decimal"
            value={draft.monthly}
            onChange={(monthly) => patch({ monthly })}
          />
          <TextField
            label={copy.daily}
            description={copy.dailyHint}
            inputMode="decimal"
            value={draft.daily}
            onChange={(daily) => patch({ daily })}
          />
          <TextField
            label={copy.warnAt}
            description={copy.warnAtHint}
            inputMode="numeric"
            value={draft.warnAt}
            onChange={(warnAt) => patch({ warnAt })}
          />
        </div>
      </Panel>

      <div className={styles.actions}>
        {invalid ? <span className={styles.error}>{copy.invalid}</span> : null}
        <Button isLoading={save.isPending} onPress={submit}>
          {copy.save}
        </Button>
      </div>

      <Panel title={copy.spendTitle} note={copy.spendNote(spend.month)}>
        <div className={styles.body}>
          {spend.blockedBy ? <Banner tone="warning" title={copy.blocked[spend.blockedBy]} /> : null}
          <dl className={styles.stats}>
            <div>
              <dt>{copy.spent}</dt>
              <dd>
                {usd(spend.spentUsd)} / {usd(overview.settings.monthlyBudgetUsd)}
              </dd>
            </div>
            <div>
              <dt>{copy.left}</dt>
              <dd>{usd(spend.leftUsd)}</dd>
            </div>
            <div>
              <dt>{copy.today}</dt>
              <dd>
                {usd(spend.todayUsd)} / {usd(overview.settings.dailyCapUsd)}
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
            <ul className={styles.kinds}>
              {spend.byKind.map((row) => (
                <li key={row.kind}>
                  {copy.kind[row.kind]}: {row.requests} · {usd(row.spentUsd)}
                </li>
              ))}
            </ul>
          ) : null}
          {spend.unpricedRequests > 0 ? <p className={styles.note}>{copy.unpriced(spend.unpricedRequests)}</p> : null}
        </div>
      </Panel>

      <Panel title={copy.voiceTitle}>
        <p className={`${styles.body} ${styles.note}`}>{copy.voiceBody}</p>
      </Panel>
    </div>
  );
}
