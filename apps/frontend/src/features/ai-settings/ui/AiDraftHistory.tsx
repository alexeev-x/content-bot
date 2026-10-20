import type { AiDraftSummaryDto, AiDraftVersionDto } from '@alexeev/contracts';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { Button, Drawer, ErrorState, SegmentedControl, Skeleton } from '../../../shared/ui';
import { aiDraftChainQueryOptions, aiDraftsQueryOptions } from '../api/ai-queries';
import { copy } from './copy';
import styles from './AiDraftHistory.module.css';

const when = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const cost = (usd: number | null) => (usd === null ? null : `$${usd.toFixed(4)}`);

export function summaryLine(draft: AiDraftSummaryDto): string {
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

export function Chain({ id }: { id: string }) {
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

type Filter = 'all' | 'approved' | 'edited' | 'feedback' | 'open';
const FILTERS: Record<Filter, (draft: AiDraftSummaryDto) => boolean> = {
  all: () => true,
  approved: (draft) => draft.approved,
  edited: (draft) => draft.edited,
  feedback: (draft) => draft.feedbackCount > 0,
  open: (draft) => !draft.approved
};
const t = copy.editor.drafts;

type Props = {
  /** The draft open in its panel (`?draft=` on ИИ-редактор → Черновики), so a link and Back keep it. */
  openId?: string | undefined;
  onOpenChange?: ((id: string | null) => void) | undefined;
};

/**
 * Every AI draft (AI plan P8; SYS-01) as a list of one-line rows (owner, 20.10.2026: each draft opened in full made
 * a phone screen per draft). A row opens its versions, texts and verdicts in a side panel, a sheet on a phone.
 */
export function AiDraftHistory({ openId, onOpenChange }: Props) {
  const query = useInfiniteQuery(aiDraftsQueryOptions());
  const [filter, setFilter] = useState<Filter>('all');
  // Without a URL to keep it (tests, embedding), the panel keeps its own state.
  const [ownOpen, setOwnOpen] = useState<string | null>(null);
  const open = onOpenChange ? (openId ?? null) : ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;

  if (query.isPending)
    return (
      <div className={styles.body} aria-busy="true">
        <Skeleton lines={3} height={20} />
      </div>
    );
  if (query.isError) return <ErrorState message={copy.drafts.loadError} onRetry={() => void query.refetch()} />;

  const drafts = query.data.pages.flatMap((page) => page.items);
  const shown = drafts.filter(FILTERS[filter]);
  const opened = drafts.find((draft) => draft.id === open);
  return (
    <div className={styles.body}>
      <p className={styles.hint}>{copy.drafts.hint}</p>
      {drafts.length === 0 ? (
        <p className={styles.hint}>{copy.drafts.empty}</p>
      ) : (
        <>
          <div className={styles.filters}>
            <SegmentedControl
              label={t.filtersLabel}
              options={(Object.keys(t.filters) as Filter[]).map((id) => ({ id, label: t.filters[id] }))}
              value={filter}
              onChange={(id) => setFilter(id as Filter)}
            />
          </div>
          {shown.length === 0 ? (
            <p className={styles.hint}>{t.none}</p>
          ) : (
            <ul className={styles.rows}>
              {shown.map((draft) => (
                <li key={draft.id}>
                  <AriaButton className={styles.row} onPress={() => setOpen(draft.id)}>
                    <span className={styles.task}>{draft.task}</span>
                    <span className={styles.meta}>{summaryLine(draft)}</span>
                  </AriaButton>
                </li>
              ))}
            </ul>
          )}
        </>
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
      <Drawer
        isOpen={open !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setOpen(null);
        }}
        title={opened?.task ?? copy.drafts.title}
        size="wide"
      >
        {opened ? <p className={styles.meta}>{summaryLine(opened)}</p> : null}
        {open !== null ? <Chain id={open} /> : null}
      </Drawer>
    </div>
  );
}
