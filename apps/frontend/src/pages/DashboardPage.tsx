import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useDocumentTitle } from '../app/use-document-title';
import { useBotCheck } from '../features/bot';
import { AddChannelDialog } from '../features/destinations';
import { QuickPostDialog } from '../features/posts';
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
  widgetKeys,
  dashboardKeys,
  type PageBindings,
  type ServiceRow
} from '../features/dashboard';
import { useOwnerTimezone } from '../features/owner-settings';
import { utcOffsetLabel } from '../shared/lib/owner-timezone';
import { useNow } from '../shared/lib/use-now';
import { checkWord, isSwitchedOff, useServiceChecks } from '../features/system-health';
import { ru } from '../shared/lib/ru';
import { Banner, Button, PageHeader, useToast } from '../shared/ui';
import { PublishPostDialog } from './publications/PublishPostDialog';

type Props = {
  /** Test hook: dashboard poll interval in ms (production uses the 60 s default). */
  pollMs?: number;
};

const CUSTOMIZE_ID = 'dashboard-customize';

export function DashboardPage({ pollMs }: Props) {
  useDocumentTitle(ru.pages.dashboard);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [quick, setQuick] = useState<'post' | 'publish' | 'channel' | null>(null);
  const closeQuick = (open: boolean) => {
    if (!open) setQuick(null);
  };
  // The widgets read their own cached lists; refresh them only after the server confirmed the change.
  const refreshWidgets = () => {
    void queryClient.invalidateQueries({ queryKey: widgetKeys.all });
    void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
  };
  const layout = useDashboardLayout();
  const timezone = useOwnerTimezone();
  const now = useNow();
  const editor = useLayoutEditor({ current: layout.widgets, revision: layout.revision });
  // The day summary is read only while the page (or the draft being edited) has widgets that need it.
  const wantsDay = layout.settled && (editor.draft ?? layout.widgets).some((widget) => readsDashboard(widget.type));
  const dashboard = useDashboardQuery(pollMs, wantsDay, timezone);
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
    timezone,
    onOpenPublication: (id) => void navigate({ to: '/publications', search: { id } }),
    onNewPost: () => void navigate({ to: '/posts/new' }),
    onOpenPosts: () => void navigate({ to: '/posts' }),
    onOpenPost: (id) => void navigate({ to: '/posts/$id', params: { id } }),
    onAddChannel: () => void navigate({ to: '/settings/channels' }),
    onQuickNewPost: () => setQuick('post'),
    onQuickPublish: () => setQuick('publish'),
    onQuickAddChannel: () => setQuick('channel')
  };
  const layoutFailed = layout.query.isError && !layout.query.data;

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
            {editor.editing ? null : (
              <>
                <Button
                  id={CUSTOMIZE_ID}
                  variant="secondary"
                  icon="settings"
                  aria-label={dashboardCopy.customize}
                  isDisabled={layout.revision === undefined}
                  onPress={() => editor.startEdit()}
                />
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
          defaultOverview={layout.isDefault}
          {...bindings}
          {...(layout.revision === undefined
            ? {}
            : {
                onResetLayout: () => editor.startEdit({ withDefault: true }),
                onAddWidget: () => editor.startEdit({ catalog: true })
              })}
        />
      )}
      <QuickPostDialog
        isOpen={quick === 'post'}
        onOpenChange={closeQuick}
        onSaved={(post) => {
          refreshWidgets();
          toast.show({
            tone: 'success',
            title: dashboardCopy.quick.draftSaved,
            action: {
              label: dashboardCopy.quick.open,
              onPress: () => void navigate({ to: '/posts/$id', params: { id: post.id } })
            }
          });
        }}
        onSavedAndOpen={(post) => {
          refreshWidgets();
          void navigate({ to: '/posts/$id', params: { id: post.id } });
        }}
      />
      <PublishPostDialog
        timezone={timezone}
        isOpen={quick === 'publish'}
        onOpenChange={closeQuick}
        onOpenPosts={() => {
          setQuick(null);
          void navigate({ to: '/posts' });
        }}
      />
      <AddChannelDialog
        isOpen={quick === 'channel'}
        onOpenChange={closeQuick}
        onCreated={refreshWidgets}
        onOpenExisting={(id) => {
          setQuick(null);
          void navigate({ to: '/settings/channels', search: { channel: id } });
        }}
      />
    </>
  );
}
