import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useDocumentTitle } from '../app/use-document-title';
import { useBotCheck } from '../features/bot';
import {
  Dashboard,
  DashboardEditor,
  DashboardSkeleton,
  DateChip,
  dashboardCopy,
  readsDashboard,
  useDashboardLayout,
  useDashboardQuery,
  useLayoutEditor,
  type PageBindings,
  type ServiceRow
} from '../features/dashboard';
import { browserTimeZone, utcOffsetLabel } from '../features/publications';
import { checkWord, isSwitchedOff, useServiceChecks } from '../features/system-health';
import { ru } from '../shared/lib/ru';
import { Banner, Button, PageHeader } from '../shared/ui';

type Props = {
  /** Test hook: dashboard poll interval in ms (production uses the 60 s default). */
  pollMs?: number;
};

const CUSTOMIZE_ID = 'dashboard-customize';

export function DashboardPage({ pollMs }: Props) {
  useDocumentTitle(ru.pages.dashboard);
  const navigate = useNavigate();
  const layout = useDashboardLayout();
  const editor = useLayoutEditor({ current: layout.widgets, revision: layout.revision });
  // The day summary is read only while the page (or the draft being edited) has widgets that need it.
  const wantsDay = layout.settled && (editor.draft ?? layout.widgets).some((widget) => readsDashboard(widget.type));
  const dashboard = useDashboardQuery(pollMs, wantsDay);
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

  // Leaving the edit mode removes the toolbar that held focus: return it to the button that opened the mode.
  const wasEditing = useRef(false);
  useEffect(() => {
    if (wasEditing.current && !editor.editing) document.getElementById(CUSTOMIZE_ID)?.focus();
    wasEditing.current = editor.editing;
  }, [editor.editing]);

  const bindings: PageBindings = {
    query: dashboard,
    checks,
    services,
    zoneNote,
    onOpenPublication: (id) => void navigate({ to: '/publications', search: { id } }),
    onNewPost: () => void navigate({ to: '/posts/new' }),
    onOpenPosts: () => void navigate({ to: '/posts' }),
    onOpenPost: (id) => void navigate({ to: '/posts/$id', params: { id } }),
    onAddChannel: () => void navigate({ to: '/settings/channels' })
  };
  const layoutFailed = layout.query.isError && !layout.query.data;

  return (
    <>
      <PageHeader
        title={ru.pages.dashboard}
        description={ru.dashboard.description}
        actions={
          <>
            <DateChip placement="header" zoneNote={zoneNote} />
            {editor.editing ? null : (
              <>
                <Button
                  id={CUSTOMIZE_ID}
                  variant="secondary"
                  icon="settings"
                  isDisabled={layout.revision === undefined}
                  onPress={() => editor.startEdit()}
                >
                  {dashboardCopy.customize}
                </Button>
                <Button icon="plus" onPress={() => void navigate({ to: '/posts/new' })}>
                  Новый пост
                </Button>
              </>
            )}
          </>
        }
      />
      {layoutFailed ? (
        <Banner
          tone="warning"
          title={dashboardCopy.layoutError.title}
          action={
            <Button
              size="sm"
              variant="secondary"
              isLoading={layout.query.isFetching}
              onPress={() => void layout.query.refetch()}
            >
              {dashboardCopy.layoutError.retry}
            </Button>
          }
        >
          {dashboardCopy.layoutError.message}
        </Banner>
      ) : null}
      {editor.editing ? (
        <DashboardEditor editor={editor} bindings={bindings} />
      ) : !layout.settled ? (
        <DashboardSkeleton zoneNote={zoneNote} />
      ) : (
        <Dashboard
          widgets={layout.widgets}
          {...bindings}
          {...(layout.revision === undefined
            ? {}
            : {
                onResetLayout: () => editor.startEdit({ withDefault: true }),
                onAddWidget: () => editor.startEdit({ catalog: true })
              })}
        />
      )}
    </>
  );
}
