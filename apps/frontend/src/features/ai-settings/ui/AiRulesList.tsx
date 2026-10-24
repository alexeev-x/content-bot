import type { AiRuleDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../../../shared/api/http-client';
import { Button, Disclosure, DisclosureGroup, ErrorState, Skeleton, Switch } from '../../../shared/ui';
import { aiRulesQueryOptions, useChangeAiRule, useRemoveAiRuleEvidence } from '../api/ai-queries';
import { copy } from './copy';
import styles from './AiRulesList.module.css';

const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short' });

function errorText(error: unknown, max: number): string {
  if (error instanceof ApiError && error.reason === 'LIMIT') return copy.rules.limit(max);
  if (error instanceof ApiError && (error.reason === 'STATE' || error.code === 'NOT_FOUND')) return copy.rules.stale;
  return copy.rules.saveFailed;
}

function statusText(rule: AiRuleDto): string {
  if (rule.source === 'analysis' && rule.inUse) return copy.rules.status['inUse'] ?? '';
  return copy.rules.status[rule.status] ?? '';
}

/** The videos behind an analysis rule; a wrong one can be taken out, and the rule is counted again (MEM-13). */
function EvidenceList({ rule, max }: { rule: AiRuleDto; max: number }) {
  const removal = useRemoveAiRuleEvidence();
  return (
    <DisclosureGroup>
      <Disclosure id={`evidence-${rule.id}`} title={copy.rules.evidenceTitle(rule.evidence.length)}>
        <ul className={styles.evidence}>
          {rule.evidence.map((row) => (
            <li key={row.key} className={styles.evidenceRow}>
              <div className={styles.text}>
                <p className={styles.meta}>
                  <span data-polarity={row.polarity} className={styles.polarity}>
                    {row.polarity === 'support' ? copy.rules.above : copy.rules.below}
                  </span>
                  {row.origin ? ` · ${copy.rules.origin}` : ''} · {when(row.createdAt)}
                </p>
                <p className={styles.excerpt}>{row.scriptExcerpt ?? copy.rules.noScript}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label={copy.rules.removeEvidenceLabel}
                isLoading={removal.isPending && removal.variables.key === row.key}
                onPress={() => removal.mutate({ id: rule.id, key: row.key })}
              >
                {copy.rules.removeEvidence}
              </Button>
            </li>
          ))}
        </ul>
        {removal.isError ? (
          <p className={styles.error} role="alert">
            {errorText(removal.error, max)}
          </p>
        ) : null}
      </Disclosure>
    </DisclosureGroup>
  );
}

/** One rule: its own mutation, so only its controls are locked while the request runs. */
function RuleRow({ rule, max }: { rule: AiRuleDto; max: number }) {
  const mutation = useChangeAiRule();
  const closed = rule.status === 'disabled' || rule.status === 'deprecated';
  const awaiting =
    rule.source === 'analysis' && !rule.inUse && (rule.status === 'supported' || rule.status === 'strong');
  // While the request runs the switch shows the asked state; the cache changes only on the server's answer.
  const on = mutation.isPending ? mutation.variables.action === 'enable' : rule.inUse;
  return (
    <li className={styles.row} data-closed={closed || undefined}>
      <div className={styles.text}>
        <p className={styles.ruleText}>{rule.text}</p>
        <p className={styles.meta}>
          {copy.rules.scope[rule.scope]} · {rule.source === 'owner' ? copy.rules.owner : copy.rules.analysis} ·{' '}
          {statusText(rule)}
        </p>
        {rule.source === 'analysis' ? (
          <p className={styles.meta}>{copy.rules.counts(rule.supports, rule.contradicts)}</p>
        ) : null}
        {mutation.isError ? (
          <p className={styles.error} role="alert">
            {errorText(mutation.error, max)}
          </p>
        ) : null}
        {rule.source === 'analysis' && rule.evidence.length > 0 ? <EvidenceList rule={rule} max={max} /> : null}
      </div>
      <div className={styles.actions}>
        {rule.source === 'owner' ? (
          <Switch
            isSelected={on}
            isDisabled={mutation.isPending}
            onChange={(selected) => mutation.mutate({ id: rule.id, action: selected ? 'enable' : 'disable' })}
          >
            {copy.rules.use}
          </Switch>
        ) : awaiting ? (
          <>
            <Button
              size="sm"
              isLoading={mutation.isPending && mutation.variables.action === 'approve'}
              onPress={() => mutation.mutate({ id: rule.id, action: 'approve' })}
            >
              {copy.rules.approve}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              isLoading={mutation.isPending && mutation.variables.action === 'disable'}
              onPress={() => mutation.mutate({ id: rule.id, action: 'disable' })}
            >
              {copy.rules.reject}
            </Button>
          </>
        ) : !closed ? (
          <Button
            size="sm"
            variant="secondary"
            isLoading={mutation.isPending}
            onPress={() => mutation.mutate({ id: rule.id, action: 'disable' })}
          >
            {copy.rules.disable}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/** The writer's rules (AI plan P8, §6.1): the same rows the bot changes. Loads when opened. */
export function AiRulesList() {
  const query = useQuery(aiRulesQueryOptions());

  if (query.isPending)
    return (
      <div className={styles.body} aria-busy="true">
        <Skeleton lines={3} height={20} />
      </div>
    );
  if (query.isError) return <ErrorState message={copy.rules.loadError} onRetry={() => void query.refetch()} />;

  const { items, inUseMax } = query.data;
  return (
    <div className={styles.body}>
      <p className={styles.hint}>{copy.rules.hint(inUseMax)}</p>
      {items.length === 0 ? (
        <p className={styles.hint}>{copy.rules.empty}</p>
      ) : (
        <ul className={styles.list}>
          {items.map((rule) => (
            <RuleRow key={rule.id} rule={rule} max={inUseMax} />
          ))}
        </ul>
      )}
    </div>
  );
}
