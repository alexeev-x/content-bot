import { ru } from '../shared/lib/ru';
import { EmptyState, PageHeader, Panel, type IconName } from '../shared/ui';

type Props = { title: string; icon?: IconName };

export function InDevelopmentPage({ title, icon = 'sparkle' }: Props) {
  return (
    <>
      <PageHeader title={title} />
      <Panel>
        <EmptyState icon={icon} title={ru.inDevelopment.title} description={ru.inDevelopment.description} />
      </Panel>
    </>
  );
}
