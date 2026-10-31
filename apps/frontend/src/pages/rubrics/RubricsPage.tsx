import { getRouteApi } from '@tanstack/react-router';
import { useDocumentTitle } from '../../app/use-document-title';
import { RubricsSection, rubricsCopy } from '../../features/rubrics';
import { PageHeader } from '../../shared/ui';

const route = getRouteApi('/rubrics');

/** «Рубрики»: when each rubric goes out and why (rubric scheduler stage 3: the forecast). */
export function RubricsPage() {
  useDocumentTitle(rubricsCopy.title);
  const { rubric } = route.useSearch();
  return (
    <>
      <PageHeader title={rubricsCopy.title} description={rubricsCopy.description} focusHeadingOnMount />
      <RubricsSection initialRubric={rubric ?? null} />
    </>
  );
}
