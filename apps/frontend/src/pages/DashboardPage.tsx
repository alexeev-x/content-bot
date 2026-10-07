import { ru } from '../shared/lib/ru';
import { PageHeader } from '../shared/ui';
import { SystemStatus } from './dashboard/SystemStatus';

export function DashboardPage() {
  return <PageHeader title={ru.pages.dashboard} actions={<SystemStatus />} />;
}
