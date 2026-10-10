import { Icon, MediaTile, Panel, PanelList, PanelRow } from '../../../shared/ui';
import patchThumb from '../assets/pulse-patch.svg';
import trophyThumb from '../assets/pulse-trophy.svg';
import heroThumb from '../assets/pulse-hero.svg';
import styles from './Dashboard.module.css';

const EVENTS = [
  { title: 'Вышло обновление 7.37d', ago: '2 ч назад', image: patchThumb },
  { title: 'Известны участники главного турнира', ago: '5 ч назад', image: trophyThumb },
  { title: 'Новый герой в разработке?', ago: '8 ч назад', image: heroThumb }
] as const;

const METRICS = [
  {
    label: 'Просмотры',
    value: '12.4K',
    trend: '229%',
    points: [12, 17, 14, 21, 18, 25, 20, 28, 23, 31, 27, 36, 32, 42]
  },
  {
    label: 'Подписчики',
    value: '+248',
    trend: '12%',
    points: [14, 18, 16, 19, 24, 22, 26, 25, 30, 29, 34, 32, 39, 42]
  },
  {
    label: 'Вовлечённость',
    value: '1.2%',
    trend: '0.4%',
    points: [30, 25, 29, 22, 27, 20, 24, 18, 22, 15, 18, 12, 16, 11]
  }
] as const;

function Sparkline({ points, label }: { points: readonly number[]; label: string }) {
  const min = Math.min(...points);
  const span = Math.max(...points) - min || 1;
  const step = 100 / (points.length - 1);
  const line = points
    .map((value, index) => `${(index * step).toFixed(1)},${(30 - ((value - min) / span) * 26).toFixed(1)}`)
    .join(' ');
  return (
    <svg className={styles.previewSpark} viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
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

/** Prototype-only content: no analytics or Dota Pulse data source is connected yet. */
export function PreviewPanels() {
  return (
    <>
      <div className={styles.item} data-widget="pulse-preview">
        <Panel
          quiet
          title="Dota Pulse"
          headingLevel={2}
          marker={
            <>
              <span className={styles.previewTag}>Превью</span>
              <span className={styles.demoTag}>демо</span>
            </>
          }
        >
          <PanelList aria-label="Примеры событий Dota Pulse">
            {EVENTS.map((event) => (
              <PanelRow key={event.title}>
                <MediaTile size={40} src={event.image} icon="zap" />
                <span className={styles.previewEvent}>{event.title}</span>
                <span className={styles.previewAgo}>{event.ago}</span>
              </PanelRow>
            ))}
          </PanelList>
        </Panel>
      </div>
      <div className={styles.item} data-widget="analytics-preview">
        <Panel
          quiet
          title="Аналитика канала"
          headingLevel={2}
          marker={
            <>
              <span className={styles.previewTag}>Превью</span>
              <span className={styles.demoTag}>демо</span>
            </>
          }
        >
          <ul className={styles.previewMetrics} aria-label="Демонстрационные метрики канала">
            {METRICS.map((metric) => (
              <li key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <span className={styles.previewTrend}>
                  <Icon name="arrow-up" size={12} />
                  {metric.trend}
                </span>
                <Sparkline points={metric.points} label={`Динамика: ${metric.label}`} />
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
