import type { FixedWidget } from '../model/default-layout';
import { rowCapacity } from '../model/geometry';
import { AttentionPanel } from './AttentionPanel';
import { Kpis } from './Kpis';
import { RecentPanel, TodayPanel, UpcomingPanel } from './PublicationPanels';
import { SystemPanel } from './SystemPanel';
import type { WidgetEnv } from './widget-env';

type Props = { widget: FixedWidget; env: WidgetEnv };

// Below these widths a list widget switches from desktop rows (or the table) to phone-style cards.
const CARD_BELOW = 5;
const TABLE_FROM = 7;
// Row heights of the panels (px): a desktop row, a phone card and the recent table (32 px header + 44 px rows).
const ROW = 56;
const CARD = 96;
const TABLE_ROW = 44;
const TABLE_HEAD = 32;
const TABLE_FOOT = 40;

/**
 * One widget's content. It adapts to its box: narrow = compact (cards, short labels), wide = details, and the
 * rows it lists follow the grid height. On a phone the box is a full-width block of natural height.
 */
export function WidgetBody({ widget, env }: Props) {
  const { view, now, phone } = env;
  const dashboard = view?.dashboard;
  const narrow = phone || widget.w < (widget.type === 'recent' ? TABLE_FROM : CARD_BELOW);
  const fit = (rowPx: number, extra = 0) => (phone ? undefined : rowCapacity(widget.h, rowPx, extra));
  const rows = fit(narrow ? CARD : ROW);

  switch (widget.type) {
    case 'kpi-summary':
      return <Kpis view={view} now={now} timezone={env.timezone} />;
    case 'attention':
      return (
        <AttentionPanel
          rows={view?.rows}
          total={view?.attentionCount ?? 0}
          checking={view?.checking ?? false}
          narrow={narrow}
          {...(rows ? { capacity: rows } : {})}
          now={now}
          onOpenPublication={env.onOpenPublication}
        />
      );
    case 'today':
      return (
        <TodayPanel
          items={dashboard?.today}
          total={dashboard?.todayTotal ?? 0}
          narrow={narrow}
          {...(rows ? { capacity: rows } : {})}
          now={now}
          timezone={env.timezone}
          onOpenPublication={env.onOpenPublication}
          onNewPost={env.onNewPost}
        />
      );
    case 'upcoming':
      return (
        <UpcomingPanel
          items={dashboard?.upcoming}
          narrow={narrow}
          {...(rows ? { capacity: rows } : {})}
          now={now}
          timezone={env.timezone}
          onOpenPublication={env.onOpenPublication}
          onCreate={env.onOpenPosts}
        />
      );
    case 'recent': {
      const tableRows = narrow ? fit(CARD, TABLE_FOOT) : fit(TABLE_ROW, TABLE_HEAD + TABLE_FOOT);
      return (
        <RecentPanel
          items={dashboard?.recentSent}
          narrow={narrow}
          {...(tableRows ? { capacity: tableRows } : {})}
          now={now}
          timezone={env.timezone}
          onOpenPublication={env.onOpenPublication}
        />
      );
    }
    case 'system':
      return <SystemPanel services={env.services} />;
  }
}
