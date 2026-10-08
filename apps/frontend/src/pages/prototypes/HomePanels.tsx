import { Link } from '@tanstack/react-router';
import { type ReactNode } from 'react';
import {
  Button,
  ErrorState,
  Icon,
  MediaTile,
  Panel,
  PanelList,
  PanelRow,
  RowCard,
  Skeleton,
  StatusBadge,
  type IconName
} from '../../shared/ui';
import { formatDateTime, formatTime, type Publication } from './data';
import { ANALYTICS_TILES, DAY_START, DEMO_STATS, PHONE_ROW, PULSE_ITEMS, SYSTEM_ROWS, untilText } from './home-data';
import { buildSeries } from './preview-data';
import { BASE } from './proto-kit';
import styles from './Home.module.css';

export type HomeLink = { text: string; to: string; search?: Record<string, string> };

export function PanelLink({ link }: { link: HomeLink }) {
  return (
    <Link to={`${BASE}${link.to}` as never} search={link.search as never}>
      {link.text}
      <Icon name="chevron-right" size={14} />
    </Link>
  );
}

type SectionProps = {
  area: string;
  title: string;
  /** Only where the number is actionable (Требует внимания, Сегодня). */
  count?: number;
  link?: HomeLink;
  /** Body height reserved for the loaded content, so a panel never changes height (UX_SPEC §2.6). */
  minBody: number;
  /** ПРЕВЬЮ tag. */
  preview?: boolean;
  /** One quiet «демо» word in the header: the figures in this panel are invented. */
  demo?: boolean;
  children: ReactNode;
  busy?: boolean;
};

/** One dashboard panel: grid cell, quiet 48 px strip, body that keeps the skeleton height. */
export function Section({ area, title, count, link, minBody, preview, demo, children, busy }: SectionProps) {
  return (
    <div className={styles.cell} data-area={area} aria-busy={busy || undefined}>
      <Panel
        quiet
        title={title}
        headingLevel={2}
        marker={
          <>
            {count !== undefined ? <span className={styles.count}>{count}</span> : null}
            {preview ? <span className={styles.previewTag}>Превью</span> : null}
            {demo ? <span className={styles.demoNote}>демо</span> : null}
          </>
        }
        action={link ? <PanelLink link={link} /> : undefined}
      >
        <div className={styles.fill} style={{ minHeight: minBody }}>
          {children}
        </div>
      </Panel>
    </div>
  );
}

export function SectionError({ onRetry }: { onRetry: () => void }) {
  return (
    <ErrorState
      title="Не удалось загрузить"
      message="Остальные блоки работают."
      requestId="req_0b52a7de"
      onRetry={onRetry}
    />
  );
}

export function EmptyLine({ icon, text, action }: { icon?: IconName; text: string; action?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <p>
        {icon ? <Icon name={icon} size={18} /> : null}
        {text}
      </p>
      {action}
    </div>
  );
}

/** Skeleton rows with the loaded row geometry: fixed boxes for time and thumbnail, so nothing shifts on arrival. */
export function SkeletonRows({
  count,
  narrow,
  thumb = true,
  height = 56
}: {
  count: number;
  narrow: boolean;
  thumb?: boolean;
  height?: number;
}) {
  return (
    <PanelList>
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className={styles.skRow} style={{ minHeight: narrow ? PHONE_ROW : height }}>
          {narrow ? null : <Skeleton width={40} height={14} />}
          {thumb ? <Skeleton width={narrow ? 44 : 40} height={narrow ? 44 : 40} /> : null}
          <span className={styles.skText}>
            <Skeleton height={14} width={index % 2 ? '52%' : '68%'} />
            {narrow ? <Skeleton height={12} width="38%" /> : null}
          </span>
        </li>
      ))}
    </PanelList>
  );
}

export function Trend({ value, up = true }: { value: string; up?: boolean }) {
  return (
    <span className={styles.trend}>
      <Icon name={up ? 'arrow-up' : 'arrow-down'} size={12} />
      {value}
    </span>
  );
}

type RowBase = {
  pub: Publication;
  title: string;
  image: string | undefined;
  channel: string;
  onOpen: (id: string) => void;
};

/** Whole row opens the publication (the title button stretches over it). Status and views only; no menu. */
export function TodayRow({ pub, title, image, channel, onOpen, real }: RowBase & { real: boolean }) {
  const stats = real ? undefined : DEMO_STATS[pub.id];
  return (
    <PanelRow>
      <span className={styles.time}>{formatTime(pub.at)}</span>
      <MediaTile src={image} size={40} />
      <div className={styles.titleBlock}>
        <button type="button" className={styles.rowMain} title={`${title} · ${channel}`} onClick={() => onOpen(pub.id)}>
          {title}
        </button>
      </div>
      <span className={styles.statusCol}>
        <StatusBadge status={pub.status} />
      </span>
      <span className={styles.metric} title={stats ? 'Просмотры (демо)' : 'Нет данных'}>
        {stats?.views ?? '—'}
      </span>
    </PanelRow>
  );
}

export function UpcomingRow({ pub, title, image, channel, onOpen }: RowBase) {
  return (
    <PanelRow>
      <span className={styles.time}>{formatTime(pub.at)}</span>
      <MediaTile src={image} size={40} />
      <div className={styles.titleBlock}>
        <button type="button" className={styles.rowMain} title={`${title} · ${channel}`} onClick={() => onOpen(pub.id)}>
          {title}
        </button>
      </div>
      <span className={styles.until}>{untilText(pub.at)}</span>
    </PanelRow>
  );
}

export type AttentionItem = { pub: Publication; kind: 'unknown' | 'failed'; reason: string };

export function AttentionRow({
  item,
  title,
  onOpen
}: {
  item: AttentionItem;
  title: string;
  onOpen: (id: string) => void;
}) {
  const unknown = item.kind === 'unknown';
  return (
    <PanelRow>
      <span className={styles.sev} data-kind={item.kind}>
        <Icon name={unknown ? 'alert' : 'x-circle'} size={20} />
      </span>
      <div className={styles.titleBlock}>
        <button type="button" className={styles.rowMain} onClick={() => onOpen(item.pub.id)}>
          {title}
        </button>
        <span className={styles.excerpt}>
          <strong className={styles.kindLabel} data-kind={item.kind}>
            {unknown ? 'Требует проверки' : 'Ошибка публикации'}
          </strong>
          {' · '}
          {item.reason}
        </span>
      </div>
      <span className={styles.timeSm}>{formatTime(item.pub.at)}</span>
      <span className={styles.actions}>
        <Button size="sm" variant={unknown ? 'primary' : 'secondary'} onPress={() => onOpen(item.pub.id)}>
          {unknown ? 'Проверить' : 'Открыть'}
        </Button>
      </span>
    </PanelRow>
  );
}

/** Phone card: thumb 44, title, status + meta line. `action` (attention rows) is the one visible button. */
export function PhoneCard({
  pub,
  title,
  image,
  meta,
  warning,
  onOpen,
  action
}: {
  pub: Publication;
  title: string;
  image: string | undefined;
  meta: string;
  warning?: string;
  onOpen: (id: string) => void;
  action?: ReactNode;
}) {
  return (
    <RowCard
      title={title}
      media={<MediaTile src={image} size={44} />}
      meta={
        <span className={styles.phoneMeta}>
          {action ? null : <StatusBadge status={pub.status} />}
          <span>{meta}</span>
        </span>
      }
      {...(warning ? { warning } : {})}
      onPress={() => onOpen(pub.id)}
      menu={action ? <span className={styles.phoneMenu}>{action}</span> : undefined}
    />
  );
}

type RecentRow = { pub: Publication; title: string; image: string | undefined };

/** Compact table: 32 px header, 44 px rows, whole row opens the publication. */
export function RecentTable({
  rows,
  real,
  onOpen
}: {
  rows: RecentRow[];
  real: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <table className={styles.recent} aria-label="Последние публикации">
      <thead>
        <tr>
          <th scope="col">Время</th>
          <th scope="col">Пост</th>
          <th scope="col">Статус</th>
          <th scope="col" className={styles.num}>
            Просмотры
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ pub, title, image }) => {
          const today = pub.at >= DAY_START;
          const views = real ? undefined : DEMO_STATS[pub.id]?.views;
          return (
            <tr key={pub.id}>
              <td className={styles.mono}>{today ? formatTime(pub.at) : formatDateTime(pub.at).split(',')[0]}</td>
              <td>
                <span className={styles.recentTitle}>
                  <MediaTile src={image} size={32} />
                  <button type="button" className={styles.rowMain} onClick={() => onOpen(pub.id)}>
                    {title}
                  </button>
                </span>
              </td>
              <td>
                <StatusBadge status={pub.status} />
              </td>
              <td className={`${styles.num} ${styles.mono}`} title={views ? 'Просмотры (демо)' : 'Нет данных'}>
                {views ?? '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function RecentSkeleton({ rows }: { rows: number }) {
  return (
    <div className={styles.recentSkeleton}>
      <div className={styles.recentHeadSk}>
        <Skeleton width={40} height={10} />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={styles.recentRowSk}>
          <Skeleton width={36} height={12} />
          <Skeleton width={32} height={32} />
          <Skeleton width={index % 2 ? '40%' : '55%'} height={12} />
        </div>
      ))}
    </div>
  );
}

/** Thumbnail, one-line title, «N ч назад». */
export function PulseList({ count, narrow, real }: { count: number; narrow: boolean; real: boolean }) {
  return (
    <PanelList aria-label="Dota Pulse">
      {PULSE_ITEMS.slice(0, count).map((item) => (
        <PanelRow key={item.id}>
          <MediaTile src={real ? undefined : item.image} size={narrow ? 44 : 40} icon="zap" />
          <div className={styles.titleBlock}>
            <span className={styles.pulseTitle}>{item.title}</span>
          </div>
          <span className={styles.ago}>{item.ago}</span>
        </PanelRow>
      ))}
    </PanelList>
  );
}

function Spark({ points, label }: { points: readonly number[]; label: string }) {
  const min = Math.min(...points);
  const span = Math.max(...points) - min || 1;
  const step = 100 / (points.length - 1);
  const line = points
    .map((value, index) => `${(index * step).toFixed(1)},${(30 - ((value - min) / span) * 26).toFixed(1)}`)
    .join(' ');
  return (
    <svg className={styles.spark} viewBox="0 0 100 32" preserveAspectRatio="none">
      <title>{label}</title>
      <path d={`M0,32 L${line.replaceAll(' ', ' L')} L100,32Z`} fill="var(--color-accent-soft)" />
      <polyline
        points={line}
        fill="none"
        stroke="var(--color-accent-text)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Three metrics in one strip separated by 1 px rules: value, small trend, sparkline below. */
export function AnalyticsStrip() {
  return (
    <ul className={styles.tiles}>
      {ANALYTICS_TILES.map((tile) => {
        const series = buildSeries(14, tile.seed, 0).map((point) => point.views);
        return (
          <li key={tile.label} className={styles.tile}>
            <span className={styles.tileLabel}>{tile.label}</span>
            <span className={styles.tileValue}>
              {tile.value}
              <Trend value={tile.trend} up={tile.up} />
            </span>
            <Spark points={series} label={`Динамика: ${tile.label}`} />
          </li>
        );
      })}
    </ul>
  );
}

/** One line per service: name, status dot and a short word. Latency lives in the title (tooltip). */
export function SystemList({ botBad, real }: { botBad: boolean; real: boolean }) {
  return (
    <PanelList aria-label="Система">
      {SYSTEM_ROWS.map((row) => {
        const known = !real || row.id === 'bot' || row.id === 'queue';
        const bad = row.id === 'bot' && botBad;
        const tone = !known ? 'muted' : bad ? 'warn' : 'ok';
        const word = !known ? 'Нет данных' : bad ? 'Нет прав' : 'Работает';
        return (
          <PanelRow key={row.id}>
            <span className={styles.sysName} title={real ? 'Задержка: нет данных' : `Задержка: ${row.latency} (демо)`}>
              {row.name}
            </span>
            <span className={styles.sysState} data-tone={tone}>
              <span className={styles.dot} aria-hidden="true" />
              {word}
            </span>
          </PanelRow>
        );
      })}
    </PanelList>
  );
}
