import { useDocumentTitle } from '../../app/use-document-title';
import { aiEditorCopy, AuthorProfile } from '../../features/ai-editor';
import { PageHeader } from '../../shared/ui';

/** «ИИ-редактор»: what the editor knows about the author (later: drafts, control runs, voice rules). */
export function AiEditorPage() {
  useDocumentTitle(aiEditorCopy.title);
  return (
    <>
      <PageHeader title={aiEditorCopy.title} focusHeadingOnMount />
      <AuthorProfile />
    </>
  );
}
