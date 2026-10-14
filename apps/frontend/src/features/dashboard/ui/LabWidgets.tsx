import type { ActivityItemDto, DashboardPublicationDto, DashboardSentDto, PostDto } from '@alexeev/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { formatClock } from '../../../shared/lib/clock';
import { relativeTimeRu } from '../../../shared/lib/ru-format';
import { Icon, Sparkline } from '../../../shared/ui';
import { activityFeedQueryOptions } from '../api/activity-queries';
import { activityView } from '../model/activity-view';
import type { AttentionRow } from '../model/attention-rows';
import { untilShort } from '../model/format';
import type { ServiceRow } from '../model/service-rows';
import { toneStyle } from '../model/tone';
import { countByDay, weekDays } from '../model/week';
import styles from './LabWidgets.module.css';

// DEV design trial (owner, 14.10.2026): alternative looks for each Обзор widget, shown side by side in /lab.

const Quiet = ({ children }: { children: string }) => <p className={styles.quiet}>{children}</p>;

/* ===== Требует внимания ===== */

export function AttentionTiles({ rows, onOpenErrors }: { rows: readonly AttentionRow[]; onOpenErrors: () => void }) {
  const failed = rows.filter((row) => row.type === 'publication' && row.kind === 'failed').length;
  const unknown = rows.filter((row) => row.type === 'publication' && row.kind === 'unknown').length;
  const stuck = rows.filter((row) => row.type === 'stuck').length;
  const checks = rows.filter((row) => row.type === 'check').length;
  const tiles = [
    { id: 'failed', label: 'Не отправлено', count: failed, tone: 'failed' as const },
    { id: 'unknown', label: 'Не подтверждено', count: unknown, tone: 'unknown' as const },
    { id: 'stuck', label: 'Просрочено', count: stuck, tone: 'unknown' as const },
    { id: 'checks', label: 'Сбои системы', count: checks, tone: 'failed' as const }
  ];
  return (
    <div className={styles.tiles}>
      {tiles.map((tile) => (
        <AriaButton
          key={tile.id}
          className={styles.tile}
          style={toneStyle(tile.count === 0 ? 'done' : tile.tone)}
          onPress={onOpenErrors}
        >
          <span className={styles.tileValue}>{tile.count}</span>
          <span className={styles.tileLabel}>{tile.label}</span>
        </AriaButton>
      ))}
    </div>
  );
}

export function AttentionStrip({ rows, onOpenErrors }: { rows: readonly AttentionRow[]; onOpenErrors: () => void }) {
  if (rows.length === 0) {
    return (
      <p className={styles.strip} style={toneStyle('done')}>
        <Icon name="check-circle" size={16} /> Всё в порядке
      </p>
    );
  }
  return (
    <AriaButton className={styles.strip} style={toneStyle('failed')} onPress={onOpenErrors}>
      <Icon name="alert" size={16} />
      <strong>{rows.length}</strong>
      <span className={styles.stripText}>
        {rows
          .map((row) => (row.type === 'check' ? row.check.name : row.title || 'Без названия'))
          .slice(0, 3)
          .join(' · ')}
      </span>
      <span className={styles.stripAction}>Разобрать</span>
    </AriaButton>
  );
}

/* ===== Неделя ===== */

type WeekProps = {
  items: readonly { status: DashboardPublicationDto['status']; scheduledAt: string }[];
  now: Date;
  timezone: string;
  onOpenDay: (day: { from: string; to: string }) => void;
};

export function WeekCards({ items, now, timezone, onOpenDay }: WeekProps) {
  const days = weekDays(now, timezone);
  const counts = countByDay(items, days);
  return (
    <ol className={styles.weekCards}>
      {days.map((day, index) => {
        const count = counts[index] ?? { scheduled: 0, sent: 0, problem: 0 };
        return (
          <li key={day.from}>
            <AriaButton
              className={styles.weekCard}
              data-today={day.isToday || undefined}
              aria-label={`${day.long}: отправлено ${count.sent}, запланировано ${count.scheduled}, проблем ${count.problem}`}
              onPress={() => onOpenDay(day)}
            >
              <span className={styles.weekDay}>{day.short}</span>
              <span className={styles.weekNums}>
                <span style={toneStyle('done')} title="Отправлено">
                  <Icon name="check" size={12} /> {count.sent}
                </span>
                <span style={toneStyle('pending')} title="Запланировано">
                  <Icon name="clock" size={12} /> {count.scheduled}
                </span>
                <span style={toneStyle('failed')} title="Проблемы" data-zero={count.problem === 0 || undefined}>
                  <Icon name="alert" size={12} /> {count.problem}
                </span>
              </span>
            </AriaButton>
          </li>
        );
      })}
    </ol>
  );
}

export function WeekSummary({ items, now, timezone }: WeekProps) {
  const days = weekDays(now, timezone);
  const counts = countByDay(items, days);
  const sent = counts.reduce((sum, count) => sum + count.sent, 0);
  const planned = counts.reduce((sum, count) => sum + count.scheduled, 0);
  const problems = counts.reduce((sum, count) => sum + count.problem, 0);
  return (
    <div className={styles.summary}>
      <div className={styles.summaryNums}>
        <span>
          <strong>{sent}</strong> отправлено
        </span>
        <span>
          <strong>{planned}</strong> впереди
        </span>
        <span data-bad={problems > 0 || undefined}>
          <strong>{problems}</strong> проблем
        </span>
      </div>
      <Sparkline
        points={counts.map((count) => count.sent + count.scheduled)}
        width={480}
        height={56}
        label="Публикации по дням недели"
      />
    </div>
  );
}

/* ===== Черновики ===== */

export function DraftList({
  posts,
  now,
  onPublish
}: {
  posts: readonly PostDto[];
  now: Date;
  onPublish: (id: string) => void;
}) {
  if (posts.length === 0) return <Quiet>Черновиков нет</Quiet>;
  return (
    <ul className={styles.list}>
      {posts.map((post) => (
        <li key={post.id}>
          <AriaButton className={styles.row} onPress={() => onPublish(post.id)}>
            <Icon name="edit" size={16} />
            <span className={styles.rowText}>
              <span className={styles.rowTitle}>{post.title.trim() || 'Без названия'}</span>
              <span className={styles.meta}>изменён {relativeTimeRu(post.updatedAt, now.getTime())}</span>
            </span>
            <Icon name="chevron-right" size={16} />
          </AriaButton>
        </li>
      ))}
    </ul>
  );
}

export function DraftTiles({
  posts,
  now,
  onPublish
}: {
  posts: readonly PostDto[];
  now: Date;
  onPublish: (id: string) => void;
}) {
  if (posts.length === 0) return <Quiet>Черновиков нет</Quiet>;
  return (
    <div className={styles.draftTiles}>
      {posts.map((post) => (
        <AriaButton key={post.id} className={styles.draftTile} onPress={() => onPublish(post.id)}>
          <span className={styles.rowTitle}>{post.title.trim() || 'Без названия'}</span>
          <span className={styles.draftBody}>{post.body.slice(0, 90) || 'Текст не заполнен'}</span>
          <span className={styles.meta}>{relativeTimeRu(post.updatedAt, now.getTime())}</span>
        </AriaButton>
      ))}
    </div>
  );
}

/* ===== Отправлено недавно ===== */

export function RecentList({
  items,
  timezone,
  onOpen
}: {
  items: readonly DashboardSentDto[];
  timezone: string;
  onOpen: (id: string) => void;
}) {
  if (items.length === 0) return <Quiet>Пока ничего не отправлено</Quiet>;
  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.publicationId} className={styles.recentRow}>
          <AriaButton className={styles.row} onPress={() => onOpen(item.publicationId)}>
            <span className={styles.rowLead}>{formatClock(item.sentAt, timezone)}</span>
            <span className={styles.rowText}>
              <span className={styles.rowTitle}>{item.postTitle}</span>
              <span className={styles.meta}>{item.destinationName}</span>
            </span>
          </AriaButton>
          {item.messageUrl ? (
            <a
              className={styles.external}
              href={item.messageUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Открыть в Telegram: ${item.postTitle}`}
            >
              <Icon name="external" size={16} />
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function RecentHero({
  items,
  timezone,
  now,
  onOpen
}: {
  items: readonly DashboardSentDto[];
  timezone: string;
  now: Date;
  onOpen: (id: string) => void;
}) {
  const [latest, ...rest] = items;
  if (!latest) return <Quiet>Пока ничего не отправлено</Quiet>;
  return (
    <div className={styles.hero}>
      <AriaButton className={styles.heroBubble} onPress={() => onOpen(latest.publicationId)}>
        <span className={styles.heroChannel}>{latest.destinationName}</span>
        <span className={styles.heroTitle}>{latest.postTitle}</span>
        <span className={styles.heroTime}>
          {relativeTimeRu(latest.sentAt, now.getTime())} · {formatClock(latest.sentAt, timezone)} ✓
        </span>
      </AriaButton>
      {rest.length > 0 ? (
        <p className={styles.meta}>
          Ещё:{' '}
          {rest
            .map((item) => item.postTitle)
            .slice(0, 3)
            .join(', ')}
        </p>
      ) : null}
    </div>
  );
}

/* ===== Система ===== */

// A switched-off service is fine but not green: the owner turned it off on purpose.
const serviceTone = (service: ServiceRow) =>
  service.off || service.tone === 'loading' ? 'muted' : service.tone === 'ok' ? 'done' : 'failed';

export function SystemPill({ services }: { services: readonly ServiceRow[] }) {
  const [open, setOpen] = useState(false);
  const problems = services.filter(
    (service) => !service.off && (service.tone === 'warning' || service.tone === 'danger')
  );
  const off = services.find((service) => service.off);
  return (
    <div className={styles.pillWrap}>
      <AriaButton
        className={styles.pill}
        style={toneStyle(problems.length ? 'failed' : 'done')}
        onPress={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className={styles.dots}>
          {services.map((service) => (
            <span key={service.id} style={toneStyle(serviceTone(service))} />
          ))}
        </span>
        {problems.length
          ? `Проблем: ${problems.length}`
          : off
            ? `Работает · ${off.name.toLowerCase()}: ${off.word.toLowerCase()}`
            : 'Всё работает'}
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} />
      </AriaButton>
      {open ? (
        <ul className={styles.list}>
          {services.map((service) => (
            <li key={service.id} className={styles.meta}>
              {service.name}: {service.word}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function SystemIcons({ services }: { services: readonly ServiceRow[] }) {
  const icon = (id: string) =>
    id === 'bot'
      ? 'message'
      : id === 'webhook'
        ? 'link'
        : id === 'cron'
          ? 'clock'
          : id === 'publishing'
            ? 'send'
            : 'monitor';
  return (
    <div className={styles.icons}>
      {services.map((service) => (
        <div key={service.id} className={styles.iconCell} style={toneStyle(serviceTone(service))}>
          <span className={styles.iconCircle}>
            <Icon name={icon(service.id)} size={18} />
          </span>
          <span className={styles.rowTitle}>{service.name}</span>
          <span className={styles.meta}>{service.word}</span>
        </div>
      ))}
    </div>
  );
}

/* ===== KPI ===== */

export function KpiStrip({
  today,
  todayTotal,
  attention,
  next,
  now
}: {
  today: readonly DashboardPublicationDto[];
  todayTotal: number;
  attention: number;
  next: DashboardPublicationDto | undefined;
  now: Date;
}) {
  const sent = today.filter((item) => item.status === 'sent').length;
  const cells = [
    { label: 'Сегодня', value: String(todayTotal) },
    { label: 'Отправлено', value: String(sent) },
    { label: 'Проблемы', value: String(attention), bad: attention > 0 },
    { label: 'Следующая', value: next ? untilShort(next.scheduledAt, now) : '—' }
  ];
  return (
    <div className={styles.kpiStrip}>
      {cells.map((cell) => (
        <div key={cell.label} className={styles.kpiCell} data-bad={cell.bad || undefined}>
          <span className={styles.kpiValue}>{cell.value}</span>
          <span className={styles.meta}>{cell.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ===== Активность ===== */

export function ActivityCompact({
  timezone,
  onOpen
}: {
  timezone: string;
  onOpen: (items: readonly ActivityItemDto[]) => void;
}) {
  const query = useInfiniteQuery(activityFeedQueryOptions({}));
  const items = query.data?.pages.flatMap((page) => page.items).slice(0, 10) ?? [];
  if (items.length === 0) return <Quiet>{query.isPending ? 'Загружаем…' : 'Пока ничего не происходило'}</Quiet>;
  return (
    <table className={styles.table}>
      <tbody>
        {items.map((item) => {
          const view = activityView(item);
          return (
            <tr key={item.id} style={toneStyle(view.tone)}>
              <td className={styles.tdTime}>{formatClock(item.at, timezone)}</td>
              <td className={styles.tdIcon}>
                <Icon name={view.icon} size={14} />
              </td>
              <td className={styles.tdText}>
                <AriaButton className={styles.linkish} onPress={() => onOpen([item])}>
                  {view.text}
                  {view.subject ? ` — ${view.subject}` : ''}
                </AriaButton>
              </td>
              <td className={styles.tdWho}>{item.actor === 'owner' ? 'Вы' : 'Студия'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
