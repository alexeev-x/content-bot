import { RUBRIC_KEYS, RUBRIC_TITLES, type RubricCompare, type RubricKey, type RubricPosts } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import {
  DataTable,
  EmptyState,
  ErrorState,
  Panel,
  SegmentedControl,
  Select,
  Skeleton,
  StatusPill
} from '../../../shared/ui';
import { rubricCommentsQueryOptions, rubricCompareQueryOptions, rubricPostsQueryOptions } from '../api/rubrics-queries';
import { mskWhen } from '../model/msk';
import { analyticsCopy as copy, times } from './analytics-copy';
import { RubricsHours, RubricsLearning } from './RubricsLearning';
import styles from './RubricsAnalytics.module.css';

type CompareRow = RubricCompare['rows'][number];

function failure(error: unknown, retry: () => void) {
  const pending = error instanceof ApiError && error.status === 503;
  return (
    <ErrorState
      message={pending ? copy.pending : copy.error}
      requestId={error instanceof ApiError ? error.requestId : undefined}
      onRetry={retry}
    />
  );
}

function Mark({ row }: { row: CompareRow }) {
  if (!row.enough) return <span className={styles.muted}>{copy.few}</span>;
  if (row.mark === null) return null;
  return (
    <StatusPill
      label={row.mark === 'best' ? copy.best : copy.worst}
      group={row.mark === 'best' ? 'done' : 'failed'}
      icon={row.mark === 'best' ? 'check-circle' : 'alert'}
    />
  );
}

/** Rubric against rubric, each against the channel's usual post. A row opens the rubric below. */
function Comparison({ onOpen }: { onOpen: (rubric: RubricKey) => void }) {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const query = useQuery(rubricCompareQueryOptions(days));
  const columns = [
    {
      id: 'rubric',
      header: copy.columns.rubric,
      isRowHeader: true,
      cell: (row: CompareRow) => (
        <span className={styles.rubricCell}>
          <span>{RUBRIC_TITLES[row.rubric]}</span>
          {row.reason !== null && row.enough ? <span className={styles.muted}>{copy.reason(row.reason)}</span> : null}
        </span>
      )
    },
    { id: 'posts', header: copy.columns.posts, align: 'end' as const, width: 80, cell: (row: CompareRow) => row.posts },
    {
      id: 'x',
      header: copy.columns.x,
      align: 'end' as const,
      width: 110,
      cell: (row: CompareRow) => <strong>{times(row.x)}</strong>
    },
    {
      id: 'prev',
      header: copy.columns.prev,
      align: 'end' as const,
      width: 130,
      cell: (row: CompareRow) => times(row.xPrev)
    },
    {
      id: 'views',
      header: copy.columns.views,
      align: 'end' as const,
      cell: (row: CompareRow) => times(row.parts.views)
    },
    {
      id: 'reactions',
      header: copy.columns.reactions,
      align: 'end' as const,
      cell: (row: CompareRow) => times(row.parts.reactions)
    },
    {
      id: 'comments',
      header: copy.columns.comments,
      align: 'end' as const,
      cell: (row: CompareRow) => times(row.parts.comments)
    },
    {
      id: 'votes',
      header: copy.columns.votes,
      align: 'end' as const,
      cell: (row: CompareRow) => times(row.parts.votes)
    },
    {
      id: 'mark',
      header: '',
      width: 130,
      compactSlot: 'trailing' as const,
      cell: (row: CompareRow) => <Mark row={row} />
    }
  ];
  const data = query.data;
  return (
    <Panel
      title={copy.compareTitle}
      note={copy.compareNote}
      action={
        <SegmentedControl
          label={copy.periodLabel}
          options={([7, 30, 90] as const).map((value) => ({ id: String(value), label: copy.periods[value] }))}
          value={String(days)}
          onChange={(id) => setDays(Number(id) as 7 | 30 | 90)}
        />
      }
      footer={
        data === undefined ? undefined : (
          <span className={styles.muted}>
            {copy.channelLine(data.channel.baselinePosts, data.channel.viewsMedian24)} ·{' '}
            {copy.coverage(data.coverage.scored, data.coverage.pending, data.coverage.missing)}
          </span>
        )
      }
    >
      {query.isError ? (
        failure(query.error, () => void query.refetch())
      ) : (
        <DataTable
          aria-label={copy.compareTitle}
          columns={columns}
          rows={data?.rows ?? []}
          getRowId={(row) => row.rubric}
          isLoading={query.isPending}
          loadingRows={5}
          flush
          density="compact"
          onRowAction={(id) => onOpen(id as RubricKey)}
          emptyState={<EmptyState title={copy.empty} description={copy.emptyHint} icon="chart" />}
        />
      )}
    </Panel>
  );
}

type PostRow = RubricPosts['posts'][number];

/** One rubric: its usual post, what lands better inside it, its posts. */
function InsideRubric({ rubric, onRubric }: { rubric: RubricKey; onRubric: (rubric: RubricKey) => void }) {
  const [days, setDays] = useState<'30' | '90' | 'all'>('90');
  const query = useQuery(rubricPostsQueryOptions(rubric, days));
  const data = query.data;
  const columns = [
    {
      id: 'sent',
      header: 'Когда',
      isRowHeader: true,
      width: 170,
      cell: (row: PostRow) =>
        row.telegramUrl === null ? (
          mskWhen(row.sentAt)
        ) : (
          <a
            href={row.telegramUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`${copy.openPost}: ${mskWhen(row.sentAt)}`}
          >
            {mskWhen(row.sentAt)}
          </a>
        )
    },
    {
      id: 'views',
      header: copy.columns.views,
      align: 'end' as const,
      cell: (row: PostRow) => copy.views24(row.views24)
    },
    {
      id: 'x',
      header: 'К обычному рубрики',
      align: 'end' as const,
      cell: (row: PostRow) => <strong>{times(row.x)}</strong>
    },
    { id: 'channel', header: 'К каналу', align: 'end' as const, cell: (row: PostRow) => times(row.xChannel) },
    {
      id: 'status',
      header: 'Данные',
      width: 130,
      compactSlot: 'trailing' as const,
      cell: (row: PostRow) => (
        <StatusPill
          label={copy.postStatus[row.status]}
          group={row.status === 'scored' ? 'done' : row.status === 'pending' ? 'pending' : 'muted'}
          icon={row.status === 'scored' ? 'check-circle' : row.status === 'pending' ? 'clock' : 'minus-circle'}
        />
      )
    }
  ];
  return (
    <Panel
      title={copy.rubricTitle}
      action={
        <div className={styles.controls}>
          <Select
            label={copy.rubricLabel}
            inlineLabel
            options={RUBRIC_KEYS.map((key) => ({ id: key, label: RUBRIC_TITLES[key] }))}
            value={rubric}
            onChange={(id) => onRubric(id as RubricKey)}
          />
          <SegmentedControl
            label={copy.periodLabel}
            options={(['30', '90', 'all'] as const).map((value) => ({ id: value, label: copy.rubricPeriods[value] }))}
            value={days}
            onChange={(id) => setDays(id as '30' | '90' | 'all')}
          />
        </div>
      }
    >
      {query.isError ? (
        failure(query.error, () => void query.refetch())
      ) : (
        <div className={styles.body}>
          <p className={styles.muted}>
            {data === undefined ? (
              <Skeleton width={240} height={16} />
            ) : data.usual === null ? (
              copy.noUsual
            ) : (
              copy.usual(times(data.usual))
            )}
          </p>
          {data !== undefined && data.slices.length > 0 ? (
            <section aria-label={copy.slicesTitle} className={styles.slices}>
              {data.slices.map((slice) => (
                <div key={slice.dimension} className={styles.slice}>
                  <h4 className={styles.sliceTitle}>{copy.dimensions[slice.dimension]}</h4>
                  <ul className={styles.sliceRows}>
                    {slice.rows.slice(0, 6).map((row) => (
                      <li key={row.key} className={styles.sliceRow} data-mark={row.mark ?? undefined}>
                        <span>{copy.sliceLabel(slice.dimension, row.label)}</span>
                        <span className={styles.muted}>
                          {row.few ? copy.few : times(row.x)} · {row.n}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ) : null}
          <DataTable
            aria-label={copy.postsTitle}
            columns={columns}
            rows={data?.posts ?? []}
            getRowId={(row) => row.messageId}
            isLoading={query.isPending}
            loadingRows={4}
            flush
            density="compact"
            emptyState={<EmptyState title={copy.noUsual} icon="chart" />}
          />
        </div>
      )}
    </Panel>
  );
}

function Comments() {
  const [days, setDays] = useState<7 | 30>(30);
  const query = useQuery(rubricCommentsQueryOptions(days));
  const data = query.data;
  return (
    <Panel
      title={copy.commentsTitle}
      action={
        <SegmentedControl
          label={copy.periodLabel}
          options={([7, 30] as const).map((value) => ({ id: String(value), label: copy.periods[value] }))}
          value={String(days)}
          onChange={(id) => setDays(Number(id) as 7 | 30)}
        />
      }
      footer={data === undefined ? undefined : <span className={styles.muted}>{copy.textKept(data.textKeptDays)}</span>}
    >
      {query.isError ? (
        failure(query.error, () => void query.refetch())
      ) : data === undefined ? (
        <div className={styles.body}>
          <Skeleton width="100%" height={80} />
        </div>
      ) : (
        <div className={styles.body}>
          {data.state === 'ok' ? null : <p className={styles.muted}>{copy.commentsState[data.state]}</p>}
          <ul className={styles.sliceRows}>
            {data.rubrics.map((row) => (
              <li key={row.rubric} className={styles.commentRow}>
                <strong>{RUBRIC_TITLES[row.rubric]}</strong>
                <span className={styles.muted}>
                  {row.comments} комм. · {times(row.xComments)} ·{' '}
                  {Object.entries(row.kinds)
                    .filter(([, count]) => count > 0)
                    .sort((a, b) => b[1] - a[1])
                    .map(([kind, count]) => `${copy.kinds[kind as keyof typeof copy.kinds]} ${count}`)
                    .join(', ')}
                </span>
                {row.topics.length > 0 ? (
                  <span>{row.topics.map((topic) => `${topic.label} (${topic.count})`).join(' · ')}</span>
                ) : null}
                {row.quote === null ? null : <q className={styles.quote}>{row.quote}</q>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

/** «Рубрики» → «Аналитика»: the comparison, the hours, the learning, one rubric inside, the comments. */
export function RubricsAnalytics() {
  const [rubric, setRubric] = useState<RubricKey>('whose_ability');
  return (
    <div className={styles.stack}>
      <Comparison onOpen={setRubric} />
      <RubricsHours />
      <RubricsLearning />
      <InsideRubric rubric={rubric} onRubric={setRubric} />
      <Comments />
    </div>
  );
}
