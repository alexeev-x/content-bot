import type { DashboardWidget } from '@alexeev/contracts';
import { rowCapacity } from '../model/geometry';
import { ChannelsPanel } from './ChannelsPanel';
import { AttentionPanel } from './AttentionPanel';
import { DraftsPanel } from './DraftsPanel';
import { IncidentsPanel } from './IncidentsPanel';
import { Kpis } from './Kpis';
import { QuickActionsPanel } from './QuickActionsPanel';
import { RecentPanel, TodayPanel, UpcomingPanel } from './PublicationPanels';
import { SystemPanel } from './SystemPanel';
import { WeekPanel } from './WeekPanel';
import { ChannelsWidget, DraftsWidget, IncidentsWidget, WeekWidget } from './widget-containers';
import type { WidgetEnv } from './widget-env';

type Props = { widget: DashboardWidget; env: WidgetEnv };

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
  const { view, now, phone, skeleton } = env;
  const dashboard = view?.dashboard;
  const narrow = phone || widget.w < (widget.type === 'recent' ? TABLE_FROM : CARD_BELOW);
  const fit = (rowPx: number, extra = 0) => (phone ? undefined : rowCapacity(widget.h, rowPx, extra));
  const rows = fit(narrow ? CARD : ROW);
  // The own-query widgets always need a number of rows for their skeleton.
  const listRows = fit(narrow ? CARD : ROW) ?? 2;

  switch (widget.type) {
    case 'kpi-summary':
      return <Kpis view={view} now={now} />;
    case 'kpi-today':
      return <Kpis view={view} now={now} only="today" />;
    case 'kpi-sent':
      return <Kpis view={view} now={now} only="sent" />;
    case 'kpi-attention':
      return <Kpis view={view} now={now} only="attention" />;
    case 'kpi-next':
      return <Kpis view={view} now={now} only="next" />;
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
          onOpenPublication={env.onOpenPublication}
        />
      );
    }
    case 'system':
      return <SystemPanel services={env.services} />;
    case 'drafts':
      return skeleton ? (
        <DraftsPanel
          items={undefined}
          narrow={narrow}
          capacity={listRows}
          onContinue={env.onOpenPost}
          onNewPost={env.onNewPost}
        />
      ) : (
        <DraftsWidget narrow={narrow} capacity={listRows} onContinue={env.onOpenPost} onNewPost={env.onNewPost} />
      );
    case 'week':
      return skeleton ? <WeekPanel days={undefined} limit={0} /> : <WeekWidget now={now} />;
    case 'channels': {
      const bot = env.services?.find((service) => service.id === 'bot');
      return skeleton ? (
        <ChannelsPanel channels={undefined} bot={bot} capacity={listRows} onAddChannel={env.onAddChannel} />
      ) : (
        <ChannelsWidget bot={bot} capacity={listRows} onAddChannel={env.onAddChannel} />
      );
    }
    case 'incidents':
      return skeleton ? <IncidentsPanel summary={undefined} /> : <IncidentsWidget now={now} />;
    case 'quick-actions':
      return (
        <QuickActionsPanel
          onNewPost={env.onQuickNewPost}
          onPublish={env.onQuickPublish}
          onAddChannel={env.onQuickAddChannel}
        />
      );
  }
}
