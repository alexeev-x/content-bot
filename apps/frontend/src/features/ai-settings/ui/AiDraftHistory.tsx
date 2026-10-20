import { AI_DRAFTS_PAGE, AI_WRITER_FORMATS, type AiDraftSummaryDto, type AiDraftVersionDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  type DataColumn,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  Pagination,
  Panel,
  SearchField,
  Select,
  Skeleton,
  type TableSort
} from '../../../shared/ui';
import type { AiDraftsListQuery } from '../api/ai-api';
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

/** The table's state, kept in the URL by the page (`?q&source&format&outcome&sort&dir&page&draft`). */
export type AiDraftsView = AiDraftsListQuery & { openId?: string | undefined };

type Props = {
  view?: AiDraftsView | undefined;
  onViewChange?: ((patch: Partial<AiDraftsView>) => void) | undefined;
};

const t = copy.editor.drafts;
const SEARCH_DEBOUNCE_MS = 300;
const SOURCES = [
  { id: 'bot', label: t.source.bot },
  { id: 'studio', label: t.source.studio },
  { id: 'all', label: t.source.all }
];
const FORMATS = [
  { id: 'all', label: t.allFormats },
  ...AI_WRITER_FORMATS.map((format) => ({ id: format, label: copy.quality.format[format] }))
];
const OUTCOMES = [
  { id: 'all', label: t.filters.all },
  { id: 'approved', label: t.filters.approved },
  { id: 'edited', label: t.filters.edited },
  { id: 'open', label: t.filters.open },
  { id: 'feedback', label: t.filters.feedback }
];

/** «Одобрен», «Одобрен с правками» or «Не одобрен»: text, never colour alone. */
function outcomeOf(draft: AiDraftSummaryDto): { label: string; tone: 'done' | 'edited' | 'open' } {
  if (draft.approved && draft.edited) return { label: t.outcome.edited, tone: 'edited' };
  if (draft.approved) return { label: t.outcome.approved, tone: 'done' };
  return { label: t.outcome.open, tone: 'open' };
}

/**
 * ИИ-редактор → Черновики (owner, 20.10.2026: «почему нельзя в виде таблицы, с сортировками и фильтрами, как везде»):
 * the server's search, filters, sort and pages, the bot's drafts first (on DEV 133 of 147 were studio control runs).
 * A row opens its versions, texts and verdicts in a side panel, a sheet on a phone.
 */
export function AiDraftHistory({ view: outer, onViewChange }: Props) {
  // Without a page to keep the URL (tests, embedding), the table keeps its own state.
  const [own, setOwn] = useState<AiDraftsView>({});
  const view = onViewChange ? (outer ?? {}) : own;
  const change = (patch: Partial<AiDraftsView>) =>
    onViewChange ? onViewChange(patch) : setOwn((current) => ({ ...current, ...patch }));
  const { openId, ...query } = view;
  const list = useQuery(aiDraftsQueryOptions(query));
  const [search, setSearch] = useState(view.q ?? '');
  // The URL follows the typing after a pause, so each letter is not a request.
  useEffect(() => {
    const next = search.trim() === '' ? undefined : search.trim();
    if (next === view.q) return;
    const timer = window.setTimeout(() => change({ q: next, page: undefined }), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // `change` is a new function each render; the pause restarts only when the text or the URL changes.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [search, view.q]);

  const sort: TableSort = {
    column: view.sort ?? 'date',
    direction: view.dir === 'asc' ? 'ascending' : 'descending'
  };
  const columns = useMemo<DataColumn<AiDraftSummaryDto>[]>(
    () => [
      {
        id: 'task',
        header: t.columns.task,
        isRowHeader: true,
        cell: (draft) => (
          <span className={styles.taskCell}>
            <span className={styles.taskText} title={draft.task}>
              {draft.task}
            </span>
            <span className={styles.taskMeta}>
              {copy.quality.format[draft.format]} · {copy.drafts.source[draft.source]}
            </span>
          </span>
        )
      },
      {
        id: 'date',
        header: t.columns.date,
        width: 132,
        allowsSorting: true,
        cell: (draft) => <span className={styles.nowrap}>{when(draft.createdAt)}</span>
      },
      {
        id: 'versions',
        header: t.columns.versions,
        width: 96,
        align: 'end',
        allowsSorting: true,
        cell: (draft) => <span className={styles.num}>{draft.versions}</span>
      },
      {
        id: 'outcome',
        header: t.columns.outcome,
        width: 176,
        compactSlot: 'trailing',
        cell: (draft) => {
          const outcome = outcomeOf(draft);
          return (
            <span className={styles.outcome} data-tone={outcome.tone}>
              {outcome.label}
              {draft.feedbackCount > 0 ? ` · ${copy.drafts.feedback(draft.feedbackCount)}` : ''}
            </span>
          );
        }
      },
      {
        id: 'cost',
        header: t.columns.cost,
        width: 92,
        align: 'end',
        allowsSorting: true,
        cell: (draft) => <span className={styles.num}>{cost(draft.costUsd) ?? '—'}</span>
      }
    ],
    []
  );

  const data = list.data;
  const opened = data?.items.find((draft) => draft.id === openId);
  const filtered = Boolean(view.q || view.format || view.outcome);
  return (
    <Panel
      title={copy.drafts.title}
      headingLevel={2}
      quiet
      note={data ? t.count(data.totalCount) : undefined}
      action={
        <div className={styles.tools}>
          <SearchField
            label={t.search}
            placeholder={t.searchHint}
            maxLength={100}
            value={search}
            onChange={setSearch}
          />
          <Select
            label={t.sourceLabel}
            inlineLabel
            options={SOURCES}
            value={view.source ?? 'bot'}
            onChange={(id) => change({ source: id === 'bot' ? undefined : (id as 'studio' | 'all'), page: undefined })}
          />
          <Select
            label={t.formatLabel}
            inlineLabel
            options={FORMATS}
            value={view.format ?? 'all'}
            onChange={(id) =>
              change({ format: id === 'all' ? undefined : (id as AiDraftsView['format']), page: undefined })
            }
          />
          <Select
            label={t.outcomeLabel}
            inlineLabel
            options={OUTCOMES}
            value={view.outcome ?? 'all'}
            onChange={(id) =>
              change({ outcome: id === 'all' ? undefined : (id as AiDraftsView['outcome']), page: undefined })
            }
          />
        </div>
      }
      footer={
        <Pagination
          page={data?.page ?? 1}
          pageSize={AI_DRAFTS_PAGE}
          totalCount={data?.totalCount ?? 0}
          onPageChange={(page) => change({ page: page === 1 ? undefined : page })}
          isLoading={list.isPending}
        />
      }
    >
      {list.isError && data === undefined ? (
        <ErrorState message={copy.drafts.loadError} onRetry={() => void list.refetch()} />
      ) : (
        <div className={styles.tableInset}>
          {data?.capped ? <p className={styles.hint}>{t.capped}</p> : null}
          <DataTable
            aria-label={copy.drafts.title}
            columns={columns}
            rows={data?.items ?? []}
            getRowId={(draft) => draft.id}
            getRowText={(draft) => draft.task}
            sort={sort}
            onSortChange={(next) =>
              change({
                sort: next.column === 'date' ? undefined : (next.column as 'cost' | 'versions'),
                dir: next.direction === 'ascending' ? 'asc' : undefined,
                page: undefined
              })
            }
            onRowAction={(id) => change({ openId: id })}
            activeId={openId}
            isLoading={list.isPending}
            loadingRows={10}
            density="compact"
            flush
            emptyState={
              <EmptyState
                icon="file"
                title={filtered ? t.noMatch : copy.drafts.empty}
                description={view.source === undefined && !filtered ? t.botHint : undefined}
              />
            }
          />
        </div>
      )}
      <Drawer
        isOpen={openId !== undefined}
        onOpenChange={(isOpen) => {
          if (!isOpen) change({ openId: undefined });
        }}
        title={opened?.task ?? copy.drafts.title}
        size="wide"
      >
        {opened ? <p className={styles.meta}>{summaryLine(opened)}</p> : null}
        {openId !== undefined ? <Chain id={openId} /> : null}
      </Drawer>
    </Panel>
  );
}
