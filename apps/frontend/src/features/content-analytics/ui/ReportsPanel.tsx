import type {
  ContentForecastAccuracyDto,
  ContentReportDetailDto,
  ContentReportForecastDto,
  ContentReportSummaryDto
} from '@alexeev/contracts';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  Button,
  type DataColumn,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  Icon,
  Panel,
  Skeleton
} from '../../../shared/ui';
import {
  contentReportDetailQueryOptions,
  contentReportsQueryOptions,
  forecastAccuracyQueryOptions
} from '../api/content-analytics-queries';
import { PLATFORM_LABEL } from '../model/format';
import styles from './ReportsPanel.module.css';

// The history of the daily and Monday reports (AI plan P8; SYS-03, SYS-04). Owner, 20.10.2026: a report was a raw
// copy of the bot's message in monospace, two phone screens each, and nothing said whether the forecasts can be
// trusted. Now: how the forecasts scored on top, one line per report with its main fact, the report in a side panel.

const MISSING: Record<string, string> = {
  AI_DISABLED: 'ИИ выключен',
  AI_NO_KEY: 'ключ ИИ не задан',
  AI_BUDGET: 'бюджет ИИ исчерпан',
  REVIEW_TIMEOUT: 'не успел за 30 минут',
  AI_TIMEOUT: 'модель не ответила вовремя',
  AI_NUMBERS_UNVERIFIED: 'в ответе модели были цифры не из отчёта',
  AI_BAD_FORMAT: 'модель ответила не в том формате',
  AI_NO_MODEL: 'не выбрана модель ИИ',
  AI_NO_PRICE: 'у модели ИИ нет цены',
  AI_TOO_LONG: 'разбор не влез в сообщение',
  EXPIRED: 'отчёт устарел, не отправлялся'
};

const OUTCOME: Record<NonNullable<ContentReportForecastDto['outcome']>, string> = {
  in_band: 'попал',
  below: 'ниже',
  above: 'выше',
  no_fact: 'нет замера'
};

const HORIZON: Record<ContentReportForecastDto['horizonHours'], string> = { 24: '24 ч', 72: '3 дня', 168: '7 дней' };

const count = new Intl.NumberFormat('ru-RU');

/** In the zone the report was built in, as its text says it. */
function title(report: ContentReportSummaryDto): string {
  const day = new Date(report.asOf).toLocaleString('ru-RU', {
    timeZone: report.timezone,
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit'
  });
  return `${report.kind === 'week' ? 'Итоги недели' : 'Ежедневный'} · ${day}`;
}

function reviewLine(report: ContentReportSummaryDto): string {
  // A refused answer (wrong format, numbers not in the report, too long) was still a paid call.
  const cost = report.costUsd === null ? '' : ` · $${report.costUsd.toFixed(4)}`;
  if (report.status === 'reviewed') return `Разбор ИИ: ${report.model ?? 'модель не записана'}${cost}`;
  return `Без разбора ИИ: ${report.reviewError === null ? 'причина не записана' : (MISSING[report.reviewError] ?? report.reviewError)}${cost}`;
}

// «к 21 окт.»: the band and its date stay one phone line.
const dayShort = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short' });
const dayMonth = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long' });

/** «Как я на оракле играл. Учусь играть в доту. Часть 69… #dota #dota2» → the words before the hashtags. */
const shortTitle = (value: string) => value.replace(/#[\p{L}\p{N}_]+/gu, '').trim();

function AccuracyPanel() {
  const query = useQuery(forecastAccuracyQueryOptions());
  let body;
  if (query.isPending) body = <Skeleton lines={2} height={18} />;
  else if (query.isError)
    body = <ErrorState message="Не удалось загрузить точность прогнозов." onRetry={() => void query.refetch()} />;
  else body = <AccuracyBody data={query.data} />;
  return (
    <Panel title="Как сбываются прогнозы" icon={<Icon name="check-circle" />} note="за 30 дней">
      <div className={styles.body}>{body}</div>
    </Panel>
  );
}

function AccuracyBody({ data }: { data: ContentForecastAccuracyDto }) {
  const judged = data.horizons.map((row) => ({ ...row, total: row.inBand + row.below + row.above }));
  const anyScored = judged.some((row) => row.total + row.noFact > 0);
  const pending =
    data.waiting > 0
      ? `Ждут проверки: ${data.waiting} — их проверит следующий ежедневный отчёт.`
      : data.nextTargetAt !== null
        ? `Ближайшая проверка — ${dayMonth(data.nextTargetAt)}.`
        : null;
  if (!anyScored)
    return (
      <p className={styles.hint}>
        Проверенных прогнозов пока нет. {pending ?? 'Прогнозы появятся с первым ежедневным отчётом.'}
      </p>
    );
  return (
    <>
      <ul className={styles.accuracy}>
        {judged.map((row) => (
          <li key={row.horizonHours} className={styles.accuracyRow}>
            <span className={styles.accuracyHorizon}>{HORIZON[row.horizonHours]}</span>
            {row.total === 0 ? (
              <span className={styles.meta}>{row.noFact > 0 ? `без замера: ${row.noFact}` : 'ещё не проверялись'}</span>
            ) : (
              <span>
                <strong>
                  {row.inBand} из {row.total}
                </strong>{' '}
                в диапазоне
                <span className={styles.meta}>
                  {' '}
                  · ниже {row.below} · выше {row.above}
                  {row.noFact > 0 ? ` · без замера ${row.noFact}` : ''}
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
      {pending ? <p className={styles.hint}>{pending}</p> : null}
    </>
  );
}

/** One line per horizon: the band, then the fact and how it went, or when it will be checked. */
function horizonResult(row: ContentReportForecastDto, now: number): string {
  if (row.outcome !== null)
    return row.fact === null ? OUTCOME[row.outcome] : `${count.format(row.fact)} · ${OUTCOME[row.outcome]}`;
  return Date.parse(row.targetAt) > now ? `к ${dayShort(row.targetAt)}` : 'проверит следующий отчёт';
}

/** `now`: when the report was loaded; a horizon that passed since then still reads as ahead until a re-read. */
function Forecasts({ forecasts, now }: { forecasts: ContentReportDetailDto['forecasts']; now: number }) {
  // One card per video: the same title three times read as three different forecasts.
  const videos = new Map<string, ContentReportForecastDto[]>();
  for (const row of forecasts) videos.set(row.itemId, [...(videos.get(row.itemId) ?? []), row]);
  return (
    <section className={styles.forecasts} aria-label="Прогнозы отчёта">
      <h3 className={styles.sectionTitle}>Прогнозы просмотров</h3>
      {[...videos].map(([itemId, rows]) => {
        const first = rows[0]!;
        return (
          <div key={itemId} className={styles.forecast}>
            <p className={styles.forecastTitle}>
              {first.title === null ? itemId : shortTitle(first.title)}
              {first.platform === null ? null : (
                <span className={styles.meta}> · {PLATFORM_LABEL[first.platform]}</span>
              )}
            </p>
            <dl className={styles.horizons}>
              {rows.map((row) => (
                <div key={row.horizonHours} className={styles.horizon}>
                  <dt>{HORIZON[row.horizonHours]}</dt>
                  <dd>
                    {count.format(row.low)}–{count.format(row.high)}
                    <span className={styles.meta}> → {horizonResult(row, now)}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
    </section>
  );
}

function ReportDetail({ id }: { id: string }) {
  const query = useQuery(contentReportDetailQueryOptions(id));
  if (query.isPending) return <Skeleton lines={6} height={18} />;
  if (query.isError) return <ErrorState message="Не удалось загрузить отчёт." onRetry={() => void query.refetch()} />;
  const { blocks, forecasts } = query.data;
  return (
    <div className={styles.detail}>
      {/* Prose reads as text; only the platform tables keep Telegram's monospace columns. */}
      {blocks.map((block, index) =>
        block.kind === 'table' ? (
          // oxlint-disable-next-line react/no-array-index-key -- the blocks are a fixed, never reordered message.
          <pre key={index} className={styles.table}>
            {block.text}
          </pre>
        ) : (
          // oxlint-disable-next-line react/no-array-index-key -- see above.
          <p key={index} className={styles.prose}>
            {block.text}
          </p>
        )
      )}
      {forecasts.length > 0 ? <Forecasts forecasts={forecasts} now={query.dataUpdatedAt} /> : null}
    </div>
  );
}

export function ReportsPanel() {
  const query = useInfiniteQuery(contentReportsQueryOptions());
  // The open report: local, like any open/closed state; only it loads its text and forecasts.
  const [openId, setOpenId] = useState<string>();
  const reports = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const opened = reports.find((report) => report.id === openId);

  const columns = useMemo<DataColumn<ContentReportSummaryDto>[]>(
    () => [
      {
        id: 'report',
        header: 'Отчёт',
        isRowHeader: true,
        cell: (report) => (
          <span className={styles.row}>
            <span className={styles.rowTitle}>{title(report)}</span>
            <span className={styles.headline}>{report.headline ?? reviewLine(report)}</span>
          </span>
        )
      },
      {
        id: 'review',
        header: 'Разбор ИИ',
        width: 150,
        align: 'end',
        compactSlot: 'trailing',
        cell: (report) =>
          report.status === 'reviewed'
            ? report.costUsd === null
              ? '—'
              : `$${report.costUsd.toFixed(4)}`
            : 'без разбора'
      }
    ],
    []
  );

  return (
    <div className={styles.stack}>
      <AccuracyPanel />
      <Panel
        title="Отчёты"
        icon={<Icon name="file" />}
        footer={
          query.hasNextPage ? (
            <Button
              variant="secondary"
              size="sm"
              isLoading={query.isFetchingNextPage}
              onPress={() => void query.fetchNextPage()}
            >
              Показать ещё
            </Button>
          ) : undefined
        }
      >
        {query.isError ? (
          <ErrorState message="Не удалось загрузить отчёты." onRetry={() => void query.refetch()} />
        ) : (
          <DataTable
            aria-label="Отчёты"
            columns={columns}
            rows={reports}
            getRowId={(report) => report.id}
            getRowText={(report) => title(report)}
            onRowAction={setOpenId}
            activeId={opened ? openId : undefined}
            isLoading={query.isPending}
            loadingRows={4}
            density="compact"
            flush
            emptyState={
              <EmptyState
                icon="file"
                title="Отчётов пока нет"
                description="Ежедневный отчёт включается в «Настройки → Общие», итоги недели приходят по понедельникам."
              />
            }
          />
        )}
      </Panel>
      <Drawer
        isOpen={opened !== undefined}
        onOpenChange={(isOpen) => {
          if (!isOpen) setOpenId(undefined);
        }}
        title={opened ? title(opened) : 'Отчёт'}
        meta={opened ? <span className={styles.meta}>{reviewLine(opened)}</span> : undefined}
        size="wide"
      >
        {openId !== undefined ? <ReportDetail id={openId} /> : null}
      </Drawer>
    </div>
  );
}
