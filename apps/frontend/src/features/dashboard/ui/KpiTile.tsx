import { Button as AriaButton } from 'react-aria-components';
import { Skeleton } from '../../../shared/ui';
import { pluralRu } from '../../../shared/lib/ru-format';
import { nextPublication, untilShort } from '../model/format';
import type { WidgetKind } from '../model/widget-catalog';
import { CATALOG } from '../model/widget-catalog';
import { copy } from './copy';
import styles from './KpiTile.module.css';
import type { WidgetEnv } from './widget-env';

export type KpiKind = Extract<WidgetKind, 'kpi-today' | 'kpi-sent' | 'kpi-attention' | 'kpi-next'>;

type Tile = { value: string; caption: string; onPress?: (() => void) | undefined; tone?: 'danger' | 'ok' };

function tile(kind: KpiKind, env: Omit<WidgetEnv, 'phone'>): Tile | undefined {
  const view = env.view;
  if (view === undefined) return undefined;
  const { dashboard } = view;
  switch (kind) {
    case 'kpi-today':
      return {
        value: String(dashboard.todayTotal),
        caption: pluralRu(dashboard.todayTotal, 'публикация', 'публикации', 'публикаций'),
        onPress: env.onOpenToday
      };
    case 'kpi-sent': {
      const sent = dashboard.today.filter((item) => item.status === 'sent').length;
      return { value: String(sent), caption: copy.kpi.sentCaption(dashboard.todayTotal), onPress: env.onOpenToday };
    }
    case 'kpi-attention':
      return {
        value: view.attentionCount >= 99 ? '99+' : String(view.attentionCount),
        caption: view.attentionCount === 0 ? copy.kpi.allClear : copy.kpi.needsLook,
        onPress: env.onOpenErrors,
        tone: view.attentionCount === 0 ? 'ok' : 'danger'
      };
    case 'kpi-next': {
      const next = nextPublication(dashboard.today, dashboard.upcoming, env.now);
      if (!next) return { value: '—', caption: copy.next.empty };
      return {
        value: untilShort(next.scheduledAt, env.now),
        caption: next.postTitle,
        onPress: () => env.onOpenPublication(next.publicationId)
      };
    }
  }
}

/** One number with a caption; pressing it opens the list or publication behind the number. */
export function KpiTile({ kind, env }: { kind: KpiKind; env: Omit<WidgetEnv, 'phone'> }) {
  const data = tile(kind, env);
  const title = CATALOG[kind].title;
  const body =
    data === undefined ? (
      <>
        <Skeleton width={56} height={32} />
        <Skeleton width="70%" height={14} />
      </>
    ) : (
      <>
        <span className={styles.value}>{data.value}</span>
        <span className={styles.caption}>{data.caption}</span>
      </>
    );
  return (
    <section
      className={styles.tile}
      data-widget={kind}
      data-tone={data?.tone}
      aria-busy={data === undefined || undefined}
    >
      <h2 className={styles.title}>{title}</h2>
      {data?.onPress ? (
        <AriaButton
          className={styles.press}
          onPress={data.onPress}
          aria-label={`${title}: ${data.value}, ${data.caption}`}
        >
          {body}
        </AriaButton>
      ) : (
        <div className={styles.press}>{body}</div>
      )}
    </section>
  );
}
