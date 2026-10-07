import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useBotCheck } from '../features/bot';
import { attentionRows, Dashboard, useDashboardQuery } from '../features/dashboard';
import { browserTimeZone, utcOffsetLabel } from '../features/publications';
import { useServiceChecks } from '../features/system-health';
import { useDocumentTitle } from '../app/use-document-title';
import { ru } from '../shared/lib/ru';
import { Button, PageHeader } from '../shared/ui';
import { SystemStatus } from './dashboard/SystemStatus';

type Props = {
  /** Test hook: dashboard poll interval in ms (production uses the 60 s default). */
  pollMs?: number;
};

export function DashboardPage({ pollMs }: Props) {
  useDocumentTitle(ru.pages.dashboard);
  const navigate = useNavigate();
  const dashboard = useDashboardQuery(pollMs);
  const service = useServiceChecks();
  const bot = useBotCheck();
  const checks = [...service.checks, bot];
  const [zoneNote] = useState(() => {
    const zone = browserTimeZone();
    return `${zone}, ${utcOffsetLabel(new Date(), zone)}`;
  });
  const listed = dashboard.data !== undefined && attentionRows(dashboard.data.attention, checks).length > 0;

  return (
    <>
      <PageHeader
        title={ru.pages.dashboard}
        description="Центр управления контентом, публикациями и состоянием системы."
        actions={
          <>
            <SystemStatus actionListedBelow={listed} />
            <Button onPress={() => void navigate({ to: '/posts/new' })}>Новый пост</Button>
          </>
        }
      />
      <Dashboard
        query={dashboard}
        checks={checks}
        zoneNote={zoneNote}
        onOpenPublication={(id) => void navigate({ to: '/publications', search: { id } })}
        onSchedule={() => void navigate({ to: '/posts' })}
      />
    </>
  );
}
