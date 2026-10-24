import { AI_QUALITY_MIN_APPROVED, type AiFormatQualityDto, type AiOverviewDto } from '@alexeev/contracts';
import { Carousel, DataTable, Skeleton, useMediaQuery, type DataColumn } from '../../../shared/ui';
import { formatMinutes, qualityComparison, sharePercent, splitFormats } from '../model/ai-view';
import { copy } from './copy';
import styles from './AiQualityExtras.module.css';

const t = copy.quality.byFormat;
const COLUMNS: readonly DataColumn<AiFormatQualityDto>[] = [
  { id: 'format', header: 'Формат', isRowHeader: true, cell: (row) => copy.quality.format[row.format], width: '14%' },
  { id: 'drafts', header: t.drafts, cell: (row) => row.drafts, align: 'end' },
  { id: 'questions', header: t.questions, cell: (row) => row.questions, align: 'end' },
  { id: 'approved', header: t.approved, cell: (row) => row.approved, align: 'end' },
  { id: 'unchanged', header: t.unchanged, cell: (row) => row.approvedUnchanged, align: 'end' },
  { id: 'edits', header: t.edits, cell: (row) => sharePercent(row.averageEditRatio), align: 'end' },
  { id: 'hook', header: t.hook, cell: (row) => sharePercent(row.hookChangedShare), align: 'end' },
  { id: 'ending', header: t.ending, cell: (row) => sharePercent(row.endingChangedShare), align: 'end' },
  { id: 'joke', header: t.joke, cell: (row) => row.jokeMissed, align: 'end' },
  { id: 'time', header: t.time, cell: (row) => formatMinutes(row.medianMinutesToApproval), align: 'end' }
];

type Metric = { id: string; label: string; value: (row: AiFormatQualityDto) => string };
const METRICS: readonly Metric[] = COLUMNS.slice(1).map((column) => ({
  id: column.id,
  label: column.header,
  value: (row) => String(column.cell(row))
}));

// DataTable turns into cards below this width (same query), so the wide layout is the transposed table.
const NARROW = '(max-width: 859px)';

/**
 * «По форматам»: a card per format on a phone; on wide screens the formats are the columns (at most four), because
 * nine metric columns do not fit the half-width panel.
 */
export function AiQualityByFormat({ rows }: { rows: AiOverviewDto['quality']['byFormat'] }) {
  const narrow = useMediaQuery(NARROW);
  if (!rows || rows.length === 0) return null;
  const { active, idle } = splitFormats(rows);
  const columns: readonly DataColumn<Metric>[] = [
    { id: 'metric', header: 'Показатель', isRowHeader: true, cell: (row) => row.label, width: '34%' },
    ...active.map((format) => ({
      id: format.format,
      header: copy.quality.format[format.format],
      cell: (row: Metric) => row.value(format),
      align: 'end' as const
    }))
  ];
  return (
    <section className={styles.section} aria-labelledby="ai-quality-by-format">
      <h3 id="ai-quality-by-format" className={styles.title}>
        {t.title}
      </h3>
      {active.length === 0 ? null : narrow ? (
        // A swipeable card per format on a phone (owner, 20.10.2026: nine-row tables one under another).
        <Carousel label={t.label}>
          {active.map((row) => (
            <article key={row.format} className={styles.formatCard} aria-label={copy.quality.format[row.format]}>
              <h4 className={styles.formatTitle}>{copy.quality.format[row.format]}</h4>
              <dl className={styles.formatFacts}>
                {METRICS.map((metric) => (
                  <div key={metric.id}>
                    <dt>{metric.label}</dt>
                    <dd>{metric.value(row)}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </Carousel>
      ) : (
        <DataTable aria-label={t.label} columns={columns} rows={METRICS} getRowId={(row) => row.id} flush />
      )}
      {idle.length > 0 ? (
        <p className={styles.muted}>{t.idle(idle.map((row) => copy.quality.format[row.format]).join(', '))}</p>
      ) : null}
    </section>
  );
}

/** The previous period beside the current numbers: a neutral direction in words, or why there is none. */
export function AiQualityComparison({ quality }: { quality: AiOverviewDto['quality'] }) {
  const comparison = qualityComparison(quality);
  if (!comparison) return null;
  if (!comparison.comparable)
    return <p className={styles.muted}>{copy.quality.compare.tooLittle(AI_QUALITY_MIN_APPROVED)}</p>;
  const line = copy.quality.compare.line(quality.days, comparison.approved, comparison.ratioPercent);
  return (
    <p className={styles.compare}>
      {comparison.direction ? `${line} · ${copy.quality.compare.direction[comparison.direction]}` : line}
    </p>
  );
}

/** «По форматам» before the overview: the real metric rows, two format columns of placeholders (the usual pair). */
export function AiQualityByFormatSkeleton() {
  const narrow = useMediaQuery(NARROW);
  const placeholder = () => <Skeleton width={32} height="1lh" />;
  const columns: readonly DataColumn<Metric>[] = [
    { id: 'metric', header: 'Показатель', isRowHeader: true, cell: (row) => row.label, width: '34%' },
    // A no-break space keeps the header row at its loaded height; the format names are not known yet.
    { id: 'first', header: ' ', cell: placeholder, align: 'end' },
    { id: 'second', header: ' ', cell: placeholder, align: 'end' }
  ];
  return (
    <section className={styles.section} aria-hidden="true">
      <h3 className={styles.title}>{t.title}</h3>
      {narrow ? (
        <DataTable
          aria-label={t.label}
          columns={COLUMNS}
          rows={[]}
          getRowId={(row) => row.format}
          isLoading
          loadingRows={2}
        />
      ) : (
        <DataTable aria-label={t.label} columns={columns} rows={METRICS} getRowId={(row) => row.id} flush />
      )}
      <p className={styles.muted}>
        <Skeleton width="50%" height="1lh" />
      </p>
    </section>
  );
}
