import type { ContentReportForecastDto, ContentReportSummaryDto } from '@alexeev/contracts';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Button,
  type DataColumn,
  DataTable,
  Disclosure,
  DisclosureGroup,
  ErrorState,
  Icon,
  Panel,
  Skeleton
} from '../../../shared/ui';
import { contentReportDetailQueryOptions, contentReportsQueryOptions } from '../api/content-analytics-queries';
import { PLATFORM_LABEL } from '../model/format';
import styles from './ReportsPanel.module.css';

// The history of the daily and Monday reports (AI plan P8; SYS-03, SYS-04): each one opens to the text it was
// built from and, for a daily report, its forecasts with how they turned out.

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
  in_band: 'Попал в диапазон',
  below: 'Ниже диапазона',
  above: 'Выше диапазона',
  no_fact: 'Нет замера у срока'
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

const FORECAST_COLUMNS: DataColumn<ContentReportForecastDto & { key: string }>[] = [
  {
    id: 'video',
    header: 'Ролик',
    isRowHeader: true,
    cell: (row) => `${row.title ?? row.itemId}${row.platform === null ? '' : ` · ${PLATFORM_LABEL[row.platform]}`}`
  },
  { id: 'horizon', header: 'Срок', width: 90, cell: (row) => HORIZON[row.horizonHours] },
  {
    id: 'band',
    header: 'Прогноз',
    width: 170,
    align: 'end',
    cell: (row) => `${count.format(row.low)}–${count.format(row.high)}`
  },
  {
    id: 'fact',
    header: 'Факт',
    width: 110,
    align: 'end',
    cell: (row) => (row.fact === null ? '—' : count.format(row.fact))
  },
  {
    id: 'outcome',
    header: 'Итог',
    width: 170,
    compactSlot: 'trailing',
    cell: (row) => (row.outcome === null ? 'Срок не наступил' : OUTCOME[row.outcome])
  },
  { id: 'method', header: 'Метод', width: 110, cell: (row) => row.method }
];

function ReportDetail({ id }: { id: string }) {
  const query = useQuery(contentReportDetailQueryOptions(id));
  if (query.isPending) return <Skeleton lines={4} height={18} />;
  if (query.isError) return <ErrorState message="Не удалось загрузить отчёт." onRetry={() => void query.refetch()} />;
  const { text, forecasts } = query.data;
  return (
    <div className={styles.detail}>
      <pre className={styles.text}>{text}</pre>
      {forecasts.length > 0 ? (
        <DataTable
          aria-label="Прогнозы отчёта"
          columns={FORECAST_COLUMNS}
          rows={forecasts.map((row) => ({ ...row, key: `${row.itemId}:${row.horizonHours}` }))}
          getRowId={(row) => row.key}
          density="compact"
        />
      ) : null}
    </div>
  );
}

export function ReportsPanel() {
  const query = useInfiniteQuery(contentReportsQueryOptions());
  // Only an opened report loads its text and forecasts.
  const [open, setOpen] = useState<Set<string>>(new Set());

  let body;
  if (query.isPending) body = <Skeleton lines={4} height={20} />;
  else if (query.isError)
    body = <ErrorState message="Не удалось загрузить отчёты." onRetry={() => void query.refetch()} />;
  else {
    const reports = query.data.pages.flatMap((page) => page.items);
    body =
      reports.length === 0 ? (
        <p className={styles.hint}>
          Отчётов пока нет. Ежедневный отчёт включается в «Настройки → Общие», итоги недели приходят по понедельникам.
        </p>
      ) : (
        <>
          <DisclosureGroup expandedKeys={open} onExpandedChange={setOpen}>
            {reports.map((report) => (
              <Disclosure
                key={report.id}
                id={report.id}
                title={
                  // Two lines, not a side note: on a phone the review line squeezed the date into one word a line.
                  <span className={styles.heading}>
                    <span>{title(report)}</span>
                    <span className={styles.meta}>{reviewLine(report)}</span>
                  </span>
                }
              >
                {open.has(report.id) ? <ReportDetail id={report.id} /> : null}
              </Disclosure>
            ))}
          </DisclosureGroup>
          {query.hasNextPage ? (
            <Button
              variant="secondary"
              size="sm"
              isLoading={query.isFetchingNextPage}
              onPress={() => void query.fetchNextPage()}
            >
              Показать ещё
            </Button>
          ) : null}
        </>
      );
  }
  return (
    <Panel title="Отчёты" icon={<Icon name="list-ordered" />}>
      <div className={styles.body}>
        <p className={styles.hint}>
          Ежедневные отчёты и итоги недели, как их собрал бот: текст с разбором ИИ и прогнозы с тем, как они сбылись.
        </p>
        {body}
      </div>
    </Panel>
  );
}
