import type { AiDraftSummaryDto, AiDraftVersionDto } from '@alexeev/contracts';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Disclosure, DisclosureGroup, ErrorState, Skeleton } from '../../../shared/ui';
import { aiDraftChainQueryOptions, aiDraftsQueryOptions } from '../api/ai-queries';
import { copy } from './copy';
import styles from './AiDraftHistory.module.css';

const when = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const cost = (usd: number | null) => (usd === null ? null : `$${usd.toFixed(4)}`);

function summaryLine(draft: AiDraftSummaryDto): string {
  return [
    copy.quality.format[draft.format],
    copy.drafts.source[draft.source],
    when(draft.createdAt),
    copy.drafts.versions(draft.versions),
    draft.approved ? copy.drafts.approved : null,
    draft.edited ? copy.drafts.edited : null,
    draft.feedbackCount > 0 ? copy.drafts.feedback(draft.feedbackCount) : null,
    cost(draft.costUsd)
  ]
    .filter(Boolean)
    .join(' · ');
}

function Version({ version }: { version: AiDraftVersionDto }) {
  const head = [
    copy.drafts.kind[version.kind],
    when(version.createdAt),
    version.status === 'ready' ? null : copy.drafts.status[version.status],
    version.errorCode,
    version.model,
    cost(version.costUsd)
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <li className={styles.version}>
      <p className={styles.meta}>{head}</p>
      {version.result === 'needs_facts' && version.question !== null ? (
        <p className={styles.text}>
          <span className={styles.label}>{copy.drafts.question}: </span>
          {version.question}
        </p>
      ) : null}
      {version.texts.map((text) => (
        <div key={text.id} className={styles.revision} data-provenance={text.provenance}>
          <p className={styles.label}>
            {copy.drafts.provenance[text.provenance]}
            {text.editRatio === null ? '' : ` · ${copy.drafts.editRatio(Math.round(text.editRatio * 100))}`}
          </p>
          <p className={styles.text}>{text.text}</p>
        </div>
      ))}
      {version.feedback.map((row) => (
        <p key={`${row.kind}:${row.createdAt}`} className={styles.meta}>
          {copy.quality.feedback[row.kind as keyof typeof copy.quality.feedback] ?? row.kind}
          {row.note === null ? '' : `: «${row.note}»`}
        </p>
      ))}
    </li>
  );
}

function Chain({ id }: { id: string }) {
  const query = useQuery(aiDraftChainQueryOptions(id));
  if (query.isPending) return <Skeleton lines={3} height={18} />;
  if (query.isError) return <ErrorState message={copy.drafts.chainError} onRetry={() => void query.refetch()} />;
  return (
    <div className={styles.chain}>
      <ol className={styles.versions}>
        {query.data.versions.map((version) => (
          <Version key={version.id} version={version} />
        ))}
      </ol>
      {query.data.truncated ? <p className={styles.meta}>{copy.drafts.truncated}</p> : null}
    </div>
  );
}

/** Every AI draft with its versions (AI plan P8; SYS-01). Loads when opened; a draft loads its chain when opened. */
export function AiDraftHistory() {
  const query = useInfiniteQuery(aiDraftsQueryOptions());
  const [open, setOpen] = useState<Set<string>>(new Set());

  if (query.isPending)
    return (
      <div className={styles.body} aria-busy="true">
        <Skeleton lines={3} height={20} />
      </div>
    );
  if (query.isError) return <ErrorState message={copy.drafts.loadError} onRetry={() => void query.refetch()} />;

  const drafts = query.data.pages.flatMap((page) => page.items);
  return (
    <div className={styles.body}>
      <p className={styles.hint}>{copy.drafts.hint}</p>
      {drafts.length === 0 ? (
        <p className={styles.hint}>{copy.drafts.empty}</p>
      ) : (
        <DisclosureGroup expandedKeys={open} onExpandedChange={setOpen}>
          {drafts.map((draft) => (
            <Disclosure
              key={draft.id}
              id={draft.id}
              title={
                <span className={styles.heading}>
                  <span className={styles.task}>{draft.task}</span>
                  <span className={styles.meta}>{summaryLine(draft)}</span>
                </span>
              }
            >
              {open.has(draft.id) ? <Chain id={draft.id} /> : null}
            </Disclosure>
          ))}
        </DisclosureGroup>
      )}
      {query.hasNextPage ? (
        <Button
          variant="secondary"
          size="sm"
          isLoading={query.isFetchingNextPage}
          onPress={() => void query.fetchNextPage()}
        >
          {copy.drafts.more}
        </Button>
      ) : null}
    </div>
  );
}
