import { useDocumentTitle } from '../../app/use-document-title';
import { readAppEnvironment } from '../../app/environment';
import { DevRuns } from '../../features/dev-runs';
import { RichSamplesResult, useSendRichSamples } from '../../features/dota-intelligence';
import { Button, EmptyState, PageHeader } from '../../shared/ui';

// DEV only, removed after the check before the release (owner, 23.10.2026: «последний хотфикс, последний патч — я
// нажимаю, и всё идёт»).
export function DevRunsPage() {
  useDocumentTitle('Проверка автопостов');
  const reports = useSendRichSamples();
  if (readAppEnvironment() !== 'dev')
    return (
      <>
        <PageHeader title="Проверка автопостов" focusHeadingOnMount />
        <EmptyState title="Только на DEV" description="Эта страница работает только на DEV." />
      </>
    );
  return (
    <>
      <PageHeader
        title="Проверка автопостов"
        focusHeadingOnMount
        actions={
          <>
            <Button
              variant="secondary"
              icon="send"
              isLoading={reports.isPending && reports.variables.samples?.[0] === 'daily_report'}
              isDisabled={reports.isPending}
              onPress={() => reports.mutate({ samples: ['daily_report'] })}
            >
              Отчёт за день
            </Button>
            <Button
              variant="secondary"
              icon="send"
              isLoading={reports.isPending && reports.variables.samples?.[0] === 'weekly_report'}
              isDisabled={reports.isPending}
              onPress={() => reports.mutate({ samples: ['weekly_report'] })}
            >
              Отчёт за неделю
            </Button>
          </>
        }
      />
      <RichSamplesResult state={reports} />
      <DevRuns />
    </>
  );
}
