import { Link } from '@tanstack/react-router';
import { readAppEnvironment } from '../../app/environment';
import { useDocumentTitle } from '../../app/use-document-title';
import { RubricSamplesList } from '../../features/rubric-samples';
import { EmptyState, PageHeader } from '../../shared/ui';
import { ru } from '../../shared/lib/ru';

const TITLE = 'Рубрики (DEV)';

/** Источники → Рубрики (DEV): all 32 rubrics on a page of their own (owner, 26.10.2026: «прямо страницу, а не модалку»). */
export function RubricSamplesPage() {
  useDocumentTitle(TITLE);
  return (
    <div className="reading-width">
      <Link to="/sources">← {ru.pages.sources}</Link>
      <PageHeader
        title={TITLE}
        focusHeadingOnMount
        description="Собирается только нажатая рубрика: живые данные, текст пишет ИИ, картинку рисует код. Придёт вам в чат с ботом через 1–3 минуты, в канал ничего не уходит."
      />
      {readAppEnvironment() === 'dev' ? (
        <RubricSamplesList />
      ) : (
        <EmptyState title="Только на DEV" description="Образцы рубрик собираются только на DEV-сервере." />
      )}
    </div>
  );
}
