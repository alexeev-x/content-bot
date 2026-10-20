import type { ContentPlatform, ContentReportDto } from '@alexeev/contracts';
import { pluralRu } from '../../../shared/lib/ru-format';
import { AreaChart, Carousel, Skeleton } from '../../../shared/ui';
import { formatCount, formatDay, PLATFORM_LABEL } from '../model/format';
import { hasData, platformSummary, type PlatformSummary } from '../model/platforms';
import { PLATFORMS } from '../model/report';
import { PlatformLogo } from './PlatformLogo';
import styles from './PlatformTiles.module.css';

type Props = {
  report: ContentReportDto | undefined;
  platform: ContentPlatform | undefined;
  days: number;
};

const COLOR: Record<ContentPlatform, string> = {
  telegram: 'var(--color-platform-telegram)',
  youtube: 'var(--color-platform-youtube)',
  tiktok: 'var(--color-series-3)'
};

function Delta({ value, unit = '' }: { value: number | null; unit?: string }) {
  if (value === null) return null;
  return (
    <span className={styles.delta} data-tone={value > 0 ? 'up' : value < 0 ? 'down' : 'flat'}>
      {value > 0 ? '↑ +' : value < 0 ? '↓ −' : '± '}
      {value === 0 ? '0' : formatCount(Math.abs(value))}
      {unit}
    </span>
  );
}

/**
 * The first screen of «Обзор»: each platform with its own followers and the figure that matters for it — the reach
 * of a post in Telegram, the views of the period on YouTube and TikTok. A swipeable strip on a phone.
 */
export function PlatformTiles({ report, platform, days }: Props) {
  const shown = platform === undefined ? PLATFORMS : [platform];
  if (report === undefined) {
    return (
      <Carousel label="Платформы">
        {shown.map((each) => (
          <div key={each} className={styles.tile} aria-hidden="true">
            <Skeleton height={28} width="45%" />
            <Skeleton height={32} width="60%" />
            <Skeleton lines={2} height="1lh" />
            <Skeleton height={40} />
          </div>
        ))}
      </Carousel>
    );
  }
  const summaries = shown.map((each) => platformSummary(report, each, days)).filter(hasData);
  if (summaries.length === 0) return null;
  return (
    <Carousel label="Платформы">
      {summaries.map((summary) => (
        <Tile key={summary.platform} summary={summary} days={days} />
      ))}
    </Carousel>
  );
}

function Tile({ summary, days }: { summary: PlatformSummary; days: number }) {
  const label = PLATFORM_LABEL[summary.platform];
  const isTelegram = summary.platform === 'telegram';
  return (
    <article className={styles.tile} aria-label={label}>
      <header className={styles.head}>
        <PlatformLogo platform={summary.platform} size={24} />
        <span>{label}</span>
      </header>
      <div className={styles.main}>
        <strong className={styles.value}>{formatCount(summary.followers)}</strong>
        <span className={styles.caption}>
          {pluralRu(summary.followers ?? 0, 'подписчик', 'подписчика', 'подписчиков')}{' '}
          <Delta value={summary.followersChange} />
        </span>
      </div>
      <dl className={styles.metrics}>
        {isTelegram ? (
          <div>
            <dt>Охват поста</dt>
            <dd>
              {summary.reach === null ? '—' : `${summary.reach}%`} <Delta value={summary.reachChange} unit="%" />
            </dd>
          </div>
        ) : (
          <div>
            <dt>Просмотры за {days} дн.</dt>
            <dd>
              {formatCount(summary.views)} <Delta value={summary.viewsChange} unit="%" />
            </dd>
          </div>
        )}
        <div>
          <dt>{isTelegram ? 'Постов' : 'Роликов'}</dt>
          <dd>
            {summary.items}
            <span className={styles.muted}> · {summary.perWeek.toLocaleString('ru-RU')} в неделю</span>
          </dd>
        </div>
        <div>
          <dt title="Лайки, реакции, комментарии и репосты на 100 просмотров">Вовлечённость</dt>
          <dd>{summary.engagement === null ? '—' : `${summary.engagement.toLocaleString('ru-RU')}%`}</dd>
        </div>
        <div>
          <dt>{isTelegram ? 'Обычный пост' : 'Обычный ролик'}</dt>
          <dd>{summary.median === null ? '—' : `${formatCount(summary.median)} просм.`}</dd>
        </div>
      </dl>
      {summary.followersPoints.length >= 2 ? (
        <AreaChart
          points={summary.followersPoints.map((point) => point.followers)}
          height={40}
          color={COLOR[summary.platform]}
          label={`${label}: подписчики по дням`}
          tips={summary.followersPoints.map((point) => `${formatDay(point.day)}: ${formatCount(point.followers)}`)}
        />
      ) : null}
    </article>
  );
}
