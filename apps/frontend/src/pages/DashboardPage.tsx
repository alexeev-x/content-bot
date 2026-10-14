import { useNavigate } from '@tanstack/react-router';
import { useDocumentTitle } from '../app/use-document-title';
import { useBotCheck } from '../features/bot';
import { Dashboard, DateChip, useDashboardQuery, type PageBindings, type ServiceRow } from '../features/dashboard';
import { useOwnerTimezone } from '../features/owner-settings';
import { utcOffsetLabel } from '../shared/lib/owner-timezone';
import { useNow } from '../shared/lib/use-now';
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
  const timezone = useOwnerTimezone();
  const now = useNow();
  const dashboard = useDashboardQuery(pollMs, timezone);
  const service = useServiceChecks();
  const bot = useBotCheck();
  const checks = [...service.checks, bot];
  const zoneNote = `${timezone}, ${utcOffsetLabel(now, timezone)}`;
  const services: ServiceRow[] = checks.map((check) => ({
    id: check.id,
    name: check.name,
    tone: check.tone,
    word: checkWord(check),
    off: isSwitchedOff(check),
    title: check.summary
  }));

  const bindings: PageBindings = {
    query: dashboard,
    checks,
    services,
    zoneNote,
    timezone,
    onOpenPublication: (id) => void navigate({ to: '/publications', search: { id } }),
    onNewPost: () => void navigate({ to: '/posts/new' }),
    onOpenPosts: () => void navigate({ to: '/posts' })
  };

  return (
    <>
      <PageHeader
        title={ru.pages.dashboard}
        description={ru.dashboard.description}
        actions={
          <>
            <DateChip placement="header" zoneNote={zoneNote} timezone={timezone} />
            <Button icon="plus" onPress={() => void navigate({ to: '/posts/new' })}>
              Новый пост
            </Button>
          </>
        }
      />
      <Dashboard {...bindings} />
    </>
  );
}
