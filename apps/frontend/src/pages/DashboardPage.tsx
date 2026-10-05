import { SystemHealth } from '../features/system-health';
import { ru } from '../shared/lib/ru';
import { PageHeader } from '../shared/ui';

export function DashboardPage() {
  return (
    <>
      <PageHeader title={ru.pages.dashboard} />
      <SystemHealth />
    </>
  );
}
