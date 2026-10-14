import type { DotaHeroBracket, DotaHeroStatisticDto, DotaHeroStatisticsDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import {
  DataTable,
  EmptyState,
  ErrorState,
  Panel,
  Select,
  Skeleton,
  StatusPill,
  type DataColumn
} from '../../../shared/ui';
import { dotaHeroStatisticsQueryOptions } from '../api/dota-hero-statistics-queries';
import styles from './DotaHeroStatistics.module.css';

type Segment = 'professional' | DotaHeroBracket;
type Sample = { picks: number | null; wins: number | null; bans?: number | null };
type Mover = { hero: DotaHeroStatisticDto; delta: number };

const SEGMENTS: Array<{ id: Segment; label: string }> = [
  { id: '1', label: 'Ранг 1' },
  { id: '2', label: 'Ранг 2' },
  { id: '3', label: 'Ранг 3' },
  { id: '4', label: 'Ранг 4' },
  { id: '5', label: 'Ранг 5' },
  { id: '6', label: 'Ранг 6' },
  { id: '7', label: 'Ранг 7' },
  { id: '8', label: 'Ранг 8' },
  { id: 'professional', label: 'Профессиональные матчи' }
];
const MINIMUM_MOVER_PICKS = 100;

function sampleFor(hero: DotaHeroStatisticDto, segment: Segment): Sample {
  return segment === 'professional' ? hero.professional : hero.ranked[segment];
}

function winRate(sample: Sample): number | null {
  if (sample.picks === null || sample.wins === null || sample.picks <= 0) return null;
  return (sample.wins / sample.picks) * 100;
}

function percent(value: number | null): string {
  return value === null
    ? '—'
    : `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)}%`;
}

function count(value: number | null): string {
  return value === null ? '—' : new Intl.NumberFormat('ru-RU').format(value);
}

function percentagePointDelta(value: number): string {
  const formatted = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
    Math.abs(value)
  );
  return `${value > 0 ? '+' : '−'}${formatted} п.п.`;
}

function observedTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone
  }).format(new Date(iso));
}

function movers(
  latest: DotaHeroStatisticsDto['latest'],
  previous: DotaHeroStatisticsDto['previous'],
  segment: Segment
) {
  if (!latest || !previous) return { rises: [], falls: [] };
  const previousById = new Map(previous.heroes.map((hero) => [hero.heroId, hero]));
  const values: Mover[] = latest.heroes.flatMap((hero) => {
    const oldHero = previousById.get(hero.heroId);
    if (!oldHero) return [];
    const currentSample = sampleFor(hero, segment);
    const oldSample = sampleFor(oldHero, segment);
    if (
      currentSample.picks === null ||
      oldSample.picks === null ||
      currentSample.picks < MINIMUM_MOVER_PICKS ||
      oldSample.picks < MINIMUM_MOVER_PICKS
    )
      return [];
    const currentRate = winRate(currentSample);
    const oldRate = winRate(oldSample);
    if (currentRate === null || oldRate === null) return [];
    const delta = currentRate - oldRate;
    return delta === 0 ? [] : [{ hero, delta }];
  });
  return {
    rises: values
      .filter((item) => item.delta > 0)
      .sort((left, right) => right.delta - left.delta)
      .slice(0, 5),
    falls: values
      .filter((item) => item.delta < 0)
      .sort((left, right) => left.delta - right.delta)
      .slice(0, 5)
  };
}

function healthLabel(health: DotaHeroStatisticsDto['health']): string {
  return {
    healthy: 'Доступен',
    stale: 'Данные устарели',
    unverified: 'Ещё не проверялся',
    degraded: 'Последняя проверка с ошибкой'
  }[health];
}

function healthTone(health: DotaHeroStatisticsDto['health']) {
  return {
    healthy: { group: 'done' as const, icon: 'check-circle' as const },
    stale: { group: 'unknown' as const, icon: 'alert' as const },
    unverified: { group: 'muted' as const, icon: 'help' as const },
    degraded: { group: 'failed' as const, icon: 'x-circle' as const }
  }[health];
}

function errorMessage(error: Error): { message: string; requestId?: string } {
  if (!(error instanceof ApiError)) return { message: 'Не удалось загрузить статистику героев.' };
  if (error.status === 401) return { message: 'Сессия истекла. Войдите снова.' };
  if (error.status === 403) return { message: 'Статистика доступна только владельцу.' };
  return {
    message: 'Не удалось загрузить сохранённые наблюдения. Повторите безопасную загрузку.',
    requestId: error.requestId
  };
}

function columns(segment: Segment): DataColumn<DotaHeroStatisticDto>[] {
  const result: DataColumn<DotaHeroStatisticDto>[] = [
    { id: 'hero', header: 'Герой', isRowHeader: true, cell: (hero) => hero.name },
    {
      id: 'winRate',
      header: 'Доля побед',
      align: 'end',
      compactSlot: 'trailing',
      cell: (hero) => percent(winRate(sampleFor(hero, segment)))
    },
    { id: 'wins', header: 'Победы', align: 'end', cell: (hero) => count(sampleFor(hero, segment).wins) },
    { id: 'picks', header: 'Выборы', align: 'end', cell: (hero) => count(sampleFor(hero, segment).picks) }
  ];
  if (segment === 'professional') {
    result.push({ id: 'bans', header: 'Баны', align: 'end', cell: (hero) => count(hero.professional.bans) });
  }
  return result;
}

function MoverList({ title, values, empty }: { title: string; values: Mover[]; empty: string }) {
  return (
    <section className={styles.moverGroup} aria-label={title}>
      <h3>{title}</h3>
      {values.length === 0 ? (
        <p className={styles.muted}>{empty}</p>
      ) : (
        <ol className={styles.moverList}>
          {values.map(({ hero, delta }) => (
            <li key={hero.heroId}>
              <span>{hero.name}</span>
              <span>{percentagePointDelta(delta)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function DotaHeroStatistics({ timezone, enabled = true }: { timezone: string; enabled?: boolean }) {
  const query = useQuery(dotaHeroStatisticsQueryOptions(enabled));
  const [segment, setSegment] = useState<Segment>('1');
  const ranked = segment !== 'professional';
  const rows = useMemo(
    () =>
      [...(query.data?.latest?.heroes ?? [])].sort(
        (left, right) => (winRate(sampleFor(right, segment)) ?? -1) - (winRate(sampleFor(left, segment)) ?? -1)
      ),
    [query.data?.latest?.heroes, segment]
  );
  const moveData = movers(query.data?.latest ?? null, query.data?.previous ?? null, segment);

  if (query.isPending) {
    return (
      <Panel title="Статистика героев" note="Загружаем сохранённые наблюдения">
        <div className={styles.skeleton} aria-busy="true">
          <Skeleton height={44} />
          <Skeleton height={112} />
          <Skeleton height={220} />
        </div>
      </Panel>
    );
  }
  if (!query.data) {
    const error = errorMessage(query.error instanceof Error ? query.error : new Error('Unknown error'));
    return (
      <ErrorState
        title={query.error instanceof ApiError && query.error.status === 403 ? 'Нет доступа' : undefined}
        message={error.message}
        {...(error.requestId ? { requestId: error.requestId } : {})}
        {...(query.error instanceof ApiError && [401, 403].includes(query.error.status)
          ? {}
          : { onRetry: () => void query.refetch() })}
      />
    );
  }

  const data = query.data;
  const latest = data.latest;
  const emptyMoverMessage = !data.previous
    ? 'Для сравнения нужны два успешных наблюдения.'
    : `Нет героев с ${MINIMUM_MOVER_PICKS}+ выборами в обеих выборках.`;

  return (
    <div className={styles.heroStatistics}>
      <Panel
        title="Статистика героев"
        marker={<StatusPill label={healthLabel(data.health)} {...healthTone(data.health)} />}
        footer={
          <span>
            {data.lastSuccessAt
              ? `Последнее наблюдение: ${observedTime(data.lastSuccessAt, timezone)} · ${timezone}`
              : 'Успешных наблюдений пока нет'}
          </span>
        }
      >
        <p className={styles.sourceNote}>
          Недавние матчи · источник стороннего сообщества, не Valve. Окно выборки не опубликовано; сравнение — только
          между сохранёнными наблюдениями.
        </p>
        <a className={styles.sourceLink} href={data.source.url} target="_blank" rel="noreferrer">
          OpenDota · источник
        </a>
        {data.health === 'degraded' ? (
          <output className={styles.warning}>
            Последняя проверка не удалась ({data.lastErrorCode}).
            {latest ? ' Показаны последние сохранённые данные.' : ''}
          </output>
        ) : null}
        {data.health === 'stale' ? (
          <output className={styles.warning}>
            Данные устарели. Последнее успешное наблюдение:{' '}
            {data.lastSuccessAt ? observedTime(data.lastSuccessAt, timezone) : 'нет'}.
          </output>
        ) : null}
        {!latest ? (
          <EmptyState
            title="Наблюдений пока нет"
            description="Статистика появится после первого успешного автоматического чтения OpenDota. Эта страница не запускает обновление."
          />
        ) : (
          <div className={styles.statisticsControls}>
            <Select
              label="Выборка"
              value={segment}
              options={SEGMENTS}
              onChange={(value) => setSegment(value as Segment)}
            />
            <span>
              Наблюдение от <time dateTime={latest.observedAt}>{observedTime(latest.observedAt, timezone)}</time>
            </span>
          </div>
        )}
      </Panel>

      {latest ? (
        <>
          <Panel title="Движение героев" note="Разница доли побед, п.п.">
            {data.previous ? (
              <p className={styles.muted}>
                {observedTime(data.previous.observedAt, timezone)} → {observedTime(latest.observedAt, timezone)} ·
                минимум {MINIMUM_MOVER_PICKS} выборов в каждой выборке
              </p>
            ) : null}
            <div className={styles.movers}>
              <MoverList title="Доля побед растёт" values={moveData.rises} empty={emptyMoverMessage} />
              <MoverList title="Доля побед снижается" values={moveData.falls} empty={emptyMoverMessage} />
            </div>
          </Panel>
          <Panel
            title="Герои"
            note={ranked ? `Ранг ${segment}` : 'Профессиональные матчи'}
            footer="Количество матчей относится к выборке OpenDota; нулевые и отсутствующие значения не подменяются."
          >
            <DataTable
              flush
              aria-label={`Статистика героев: ${ranked ? `ранг ${segment}` : 'профессиональные матчи'}`}
              columns={columns(segment)}
              rows={rows}
              getRowId={(hero) => String(hero.heroId)}
              getRowText={(hero) => `${hero.name}, доля побед ${percent(winRate(sampleFor(hero, segment)))}`}
              emptyState={<EmptyState title="Нет данных по героям" />}
            />
          </Panel>
        </>
      ) : null}
    </div>
  );
}
