import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { PAGE_SIZE } from '../../../shared/api/page-query';
import { relativeTimeRu } from '../../../shared/lib/ru-format';
import { useNow } from '../../../shared/lib/use-now';
import {
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Pagination,
  Panel,
  Select,
  Skeleton,
  type DataColumn,
  type TableSort
} from '../../../shared/ui';
import { useDotaAutomation, useRunAutomationNow } from '../api/dota-automation-queries';
import { dotaHeroStatisticsQueryOptions } from '../api/dota-hero-statistics-queries';
import { buildRows, RANKS, sortRows, type HeroRow, type HeroSortKey, type Rank } from './hero-statistics-model';
import styles from './HeroStatistics.module.css';

const number = (digits: number) =>
  new Intl.NumberFormat('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const PERCENT = number(1);
const GAMES = new Intl.NumberFormat('ru-RU');

const percent = (value: number | null) => (value === null ? '—' : `${PERCENT.format(value)}%`);
function delta(value: number | null) {
  if (value === null) return '—';
  const text = `${value > 0 ? '+' : value < 0 ? '−' : ''}${PERCENT.format(Math.abs(value))} п.п.`;
  return <span data-trend={value > 0 ? 'up' : value < 0 ? 'down' : undefined}>{text}</span>;
}

export function HeroStatistics() {
  const now = useNow().getTime();
  const query = useQuery(dotaHeroStatisticsQueryOptions());
  const automation = useDotaAutomation('dota-hero-statistics');
  const run = useRunAutomationNow('dota-hero-statistics');
  const [rank, setRank] = useState<Rank>('all');
  const [sort, setSort] = useState<TableSort>({ column: 'winRate', direction: 'descending' });
  const [page, setPage] = useState(1);

  const latest = query.data?.latest ?? null;
  const previous = query.data?.previous ?? null;
  const hasDelta = previous !== null;
  const rows = useMemo(
    () => (latest ? sortRows(buildRows(latest, previous, rank), sort.column as HeroSortKey, sort.direction) : []),
    [latest, previous, rank, sort]
  );

  if (query.isPending) {
    return (
      <Panel reserveRows={4}>
        <div className={styles.skeleton} aria-busy="true">
          <Skeleton height={36} />
          <Skeleton height={220} />
        </div>
      </Panel>
    );
  }
  if (!query.data) {
    const requestId = query.error instanceof ApiError ? query.error.requestId : undefined;
    return (
      <ErrorState
        message="Не удалось загрузить статистику героев. Повторите загрузку."
        {...(requestId ? { requestId } : {})}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const columns: DataColumn<HeroRow>[] = [
    { id: 'name', header: 'Герой', isRowHeader: true, allowsSorting: true, cell: (hero) => hero.name },
    {
      id: 'winRate',
      header: 'Победы',
      allowsSorting: true,
      align: 'end',
      compactSlot: 'trailing',
      cell: (hero) => percent(hero.winRate)
    },
    {
      id: 'games',
      header: 'Игр',
      allowsSorting: true,
      align: 'end',
      cell: (hero) => (hero.games === null ? '—' : GAMES.format(hero.games))
    },
    { id: 'pickRate', header: 'Выбор', allowsSorting: true, align: 'end', cell: (hero) => percent(hero.pickRate) },
    ...(hasDelta
      ? [
          {
            id: 'delta',
            header: 'Δ побед',
            allowsSorting: true,
            align: 'end' as const,
            cell: (hero: HeroRow) => delta(hero.delta)
          }
        ]
      : [])
  ];

  const auto = automation.data ?? undefined;
  const nextRunAt = auto?.enabled && auto.nextRunAt && new Date(auto.nextRunAt).getTime() > now ? auto.nextRunAt : null;
  const running = run.isPending || (auto !== undefined && auto.executionState !== 'idle');
  const line = [
    'Данные OpenDota',
    query.data.lastSuccessAt ? `обновлено ${relativeTimeRu(query.data.lastSuccessAt, now)}` : null,
    nextRunAt ? `следующее ${relativeTimeRu(nextRunAt, now)}` : null
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className={styles.stats}>
      <div className={styles.head}>
        <p className={styles.line}>{line}</p>
        {auto?.runNowAllowed ? (
          <Button size="sm" variant="secondary" icon="retry" isLoading={running} onPress={() => run.mutate()}>
            Обновить сейчас
          </Button>
        ) : null}
        {run.isError ? (
          <span role="alert" className={styles.line}>
            Не удалось запустить обновление.
          </span>
        ) : null}
      </div>
      <Panel
        footer={
          latest ? (
            <Pagination page={page} pageSize={PAGE_SIZE} totalCount={rows.length} onPageChange={setPage} />
          ) : undefined
        }
        title="Герои"
        action={
          latest ? (
            <Select
              label="Ранг"
              inlineLabel
              options={RANKS}
              value={rank}
              onChange={(value) => {
                setRank(value as Rank);
                setPage(1);
              }}
            />
          ) : undefined
        }
      >
        {latest ? (
          <DataTable
            flush
            aria-label="Статистика героев"
            columns={columns}
            rows={rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}
            getRowId={(hero) => String(hero.heroId)}
            getRowText={(hero) => `${hero.name}, победы ${percent(hero.winRate)}`}
            sort={sort}
            onSortChange={(next) => {
              setSort(next);
              setPage(1);
            }}
            emptyState={<EmptyState title="Нет данных по героям" />}
          />
        ) : (
          <EmptyState icon="clock" title="Статистика ещё не собрана" description="Первый сбор в течение 6 часов." />
        )}
      </Panel>
    </div>
  );
}
