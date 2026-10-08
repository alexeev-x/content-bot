import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useDocumentTitle } from '../app/use-document-title';
import { useBotCheck } from '../features/bot';
import { DateChip, Dashboard, useDashboardQuery, type ServiceRow } from '../features/dashboard';
import { browserTimeZone, utcOffsetLabel } from '../features/publications';
import { checkWord, isSwitchedOff, useServiceChecks } from '../features/system-health';
import { ru } from '../shared/lib/ru';
import { Button, PageHeader } from '../shared/ui';

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
  const services: ServiceRow[] = checks.map((check) => ({
    id: check.id,
    name: check.name,
    tone: check.tone,
    word: checkWord(check),
    off: isSwitchedOff(check),
    title: check.summary
  }));

  return (
    <>
      <PageHeader
        title={ru.pages.dashboard}
        description={ru.dashboard.description}
        actions={
          <>
            <DateChip placement="header" zoneNote={zoneNote} />
            <Button icon="plus" onPress={() => void navigate({ to: '/posts/new' })}>
              Новый пост
            </Button>
          </>
        }
      />
      <Dashboard
        query={dashboard}
        checks={checks}
        services={services}
        zoneNote={zoneNote}
        onOpenPublication={(id) => void navigate({ to: '/publications', search: { id } })}
        onNewPost={() => void navigate({ to: '/posts/new' })}
        onOpenPosts={() => void navigate({ to: '/posts' })}
      />
    </>
  );
}
