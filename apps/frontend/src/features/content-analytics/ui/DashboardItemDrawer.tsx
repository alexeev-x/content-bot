import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useNow } from '../../../shared/lib/use-now';
import { contentReportQueryOptions } from '../api/content-analytics-queries';
import { mediansByPlatform, splitPeriods } from '../model/report';
import { ItemDrawer } from './ItemDrawer';

const DAYS = 30;

type Props = {
  id: string | undefined;
  onClose: () => void;
  onOpen: (id: string) => void;
  timezone: string;
};

/** The item drawer outside the analytics page: compares the item with the last 30 days the dashboard widgets show. */
export function DashboardItemDrawer({ id, onClose, onOpen, timezone }: Props) {
  const report = useQuery(contentReportQueryOptions(DAYS));
  const now = useNow().getTime();
  const context = useMemo(() => {
    if (!report.data) return undefined;
    const { current } = splitPeriods(report.data, undefined);
    return {
      items: current,
      medians: mediansByPlatform(current, Date.parse(report.data.to)),
      baselines: report.data.baselines,
      days: DAYS
    };
  }, [report.data]);
  return <ItemDrawer id={id} onClose={onClose} onOpen={onOpen} timezone={timezone} now={now} context={context} />;
}
