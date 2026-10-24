import { AI_LEARNING_LIST_LIMIT, type AiLearningItemDto } from '@alexeev/contracts';
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
  Switch,
  VisuallyHidden
} from '../../../shared/ui';
import type { AiLearningListQuery } from '../api/ai-api';
import { aiLearningQueryOptions, useSetAiLearningExcluded } from '../api/ai-queries';
import { copy } from './copy';
import styles from './AiLearningList.module.css';

const t = copy.learning;
const SEARCH_DEBOUNCE_MS = 300;
const STATES = [
  { id: 'all', label: t.state.all },
  { id: 'on', label: t.state.on },
  { id: 'off', label: t.state.off }
];
const SOURCES = [
  { id: 'all', label: t.source.all },
  { id: 'post', label: t.source.post },
  { id: 'revision', label: t.source.revision }
];

const when = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });

function sourceLabel(item: AiLearningItemDto) {
  if (item.source === 'post' || item.editRatio === null) return t.ownPost;
  return t.revision(Math.round(item.editRatio * 100));
}

/** One text's switch: its own mutation, so only this switch is locked while the request runs. */
function IncludeSwitch({ item, labelled = false }: { item: AiLearningItemDto; labelled?: boolean }) {
  const mutation = useSetAiLearningExcluded();
  // While the request runs the switch shows the asked state; the cache changes only on the server's answer.
  const excluded = mutation.isPending ? mutation.variables.excluded : item.excluded;
  return (
    <span className={styles.include}>
      <Switch
        isSelected={!excluded}
        isDisabled={mutation.isPending}
        onChange={(included) => mutation.mutate({ source: item.source, id: item.id, excluded: !included })}
      >
        {labelled ? t.include : <VisuallyHidden>{t.include}</VisuallyHidden>}
      </Switch>
      {mutation.isError ? (
        <span className={styles.error} role="alert">
          {t.saveFailed}
        </span>
      ) : null}
    </span>
  );
}

/** The table's state, kept in the URL by the page (`?lq&luse&lfrom&lpage`). */
export type AiLearningView = AiLearningListQuery;

type Props = {
  view?: AiLearningView | undefined;
  onViewChange?: ((patch: Partial<AiLearningView>) => void) | undefined;
};

/**
 * ИИ-редактор → Обучение → Примеры (owner, 20.10.2026: «если их станет очень много — сотни строк?»; «по умолчанию
 * выключены»): the server's search, filters and pages over the texts the writer may learn from. A new text is off
 * until the owner switches «Учитывать» on.
 */
export function AiLearningList({ view: outer, onViewChange }: Props) {
  // Without a page to keep the URL (tests, embedding), the table keeps its own state.
  const [own, setOwn] = useState<AiLearningView>({});
  const view = onViewChange ? (outer ?? {}) : own;
  const change = (patch: Partial<AiLearningView>) =>
    onViewChange ? onViewChange(patch) : setOwn((current) => ({ ...current, ...patch }));
  const list = useQuery(aiLearningQueryOptions(view));
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

  const columns = useMemo<DataColumn<AiLearningItemDto>[]>(
    () => [
      {
        id: 'text',
        header: t.columns.text,
        isRowHeader: true,
        cell: (item) => {
          const parts = item.changedParts.map((part) => copy.quality.part[part]).join(', ');
          return (
            <span className={styles.textCell}>
              <span className={styles.excerptLine} title={item.excerpt}>
                {item.excerpt}
              </span>
              <span className={styles.cellMeta}>
                {sourceLabel(item)}
                {parts ? ` · ${t.revisionParts(parts)}` : ''}
              </span>
            </span>
          );
        }
      },
      {
        id: 'format',
        header: t.columns.format,
        width: 120,
        cell: (item) => copy.quality.format[item.format]
      },
      {
        id: 'date',
        header: t.columns.date,
        width: 120,
        cell: (item) => <span className={styles.nowrap}>{when(item.createdAt)}</span>
      },
      {
        id: 'include',
        header: t.columns.include,
        width: 112,
        compactSlot: 'trailing',
        cell: (item) => <IncludeSwitch item={item} />
      }
    ],
    []
  );

  const data = list.data;
  // Which text is open in full; local, like any open/closed state. A row gone from the page closes it.
  const [openKey, setOpenKey] = useState<string>();
  const opened = data?.items.find((item) => `${item.source}:${item.id}` === openKey);
  const filtered = Boolean(view.q || view.state || view.source);
  return (
    <Panel
      title={copy.editor.learning.examples}
      headingLevel={2}
      quiet
      note={data ? t.count(data.includedCount) : undefined}
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
            label={t.stateLabel}
            inlineLabel
            options={STATES}
            value={view.state ?? 'all'}
            onChange={(id) => change({ state: id === 'all' ? undefined : (id as 'on' | 'off'), page: undefined })}
          />
          <Select
            label={t.sourceLabel}
            inlineLabel
            options={SOURCES}
            value={view.source ?? 'all'}
            onChange={(id) =>
              change({ source: id === 'all' ? undefined : (id as AiLearningView['source']), page: undefined })
            }
          />
        </div>
      }
      footer={
        <Pagination
          page={data?.page ?? 1}
          pageSize={AI_LEARNING_LIST_LIMIT}
          totalCount={data?.totalCount ?? 0}
          onPageChange={(page) => change({ page: page === 1 ? undefined : page })}
          isLoading={list.isPending}
        />
      }
    >
      {list.isError && data === undefined ? (
        <ErrorState message={t.loadError} onRetry={() => void list.refetch()} />
      ) : (
        <div className={styles.tableInset}>
          <p className={styles.hint}>{t.hint}</p>
          <DataTable
            aria-label={copy.editor.learning.examples}
            columns={columns}
            rows={data?.items ?? []}
            getRowId={(item) => `${item.source}:${item.id}`}
            getRowText={(item) => item.excerpt}
            onRowAction={setOpenKey}
            activeId={opened ? openKey : undefined}
            isLoading={list.isPending}
            loadingRows={8}
            density="compact"
            flush
            emptyState={<EmptyState icon="file" title={filtered ? t.noMatch : t.empty} />}
          />
        </div>
      )}
      <Drawer
        isOpen={opened !== undefined}
        onOpenChange={(isOpen) => {
          if (!isOpen) setOpenKey(undefined);
        }}
        title={t.textTitle}
        meta={
          opened
            ? `${sourceLabel(opened)} · ${copy.quality.format[opened.format]} · ${when(opened.createdAt)}`
            : undefined
        }
        footer={opened ? <IncludeSwitch item={opened} labelled /> : undefined}
        size="wide"
      >
        {opened ? (
          <>
            {opened.changedParts.length > 0 ? (
              <p className={styles.meta}>
                {t.revisionParts(opened.changedParts.map((part) => copy.quality.part[part]).join(', '))}
              </p>
            ) : null}
            <p className={styles.fullText}>{opened.text}</p>
          </>
        ) : null}
      </Drawer>
    </Panel>
  );
}
