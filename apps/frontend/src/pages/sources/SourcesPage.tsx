import { useDocumentTitle } from '../../app/use-document-title';
import { DotaIntelligence } from '../../features/dota-intelligence';
import { PageHeader } from '../../shared/ui';

export function SourcesPage() {
  useDocumentTitle('Источники и Dota Pulse');
  return (
    <>
      <PageHeader
        title="Dota Pulse"
        focusHeadingOnMount
        description="Официальные новости и патчи Dota 2. Ленты проверяются по расписанию; здесь показаны сохранённые записи."
      />
      <DotaIntelligence />
    </>
  );
}
