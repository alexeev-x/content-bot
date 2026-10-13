import { Link, useSearch } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useDocumentTitle } from '../../app/use-document-title';
import { DotaEventDetail, DotaIntelligence } from '../../features/dota-intelligence';
import { useOwnerTimezone } from '../../features/owner-settings';
import { PageHeader } from '../../shared/ui';

export function SourcesPage() {
  const timezone = useOwnerTimezone();
  const search = useSearch({ from: '/sources' });
  const parts = search.update?.split(':') ?? [];
  const sourceKey = parts.shift();
  const externalId = parts.join(':');
  const validSourceKey = sourceKey === 'steam_news' || sourceKey === 'patch_notes' ? sourceKey : undefined;
  const validUpdate = validSourceKey !== undefined && /^[A-Za-z0-9._-]{1,100}$/.test(externalId);
  const invalidHeadingRef = useRef<HTMLHeadingElement>(null);
  useDocumentTitle(search.update ? 'Разбор обновления' : 'Источники и Dota Pulse');

  useEffect(() => {
    if (search.update && !validUpdate) invalidHeadingRef.current?.focus();
  }, [search.update, validUpdate]);

  return (
    <>
      <PageHeader
        title="Dota Pulse"
        focusHeadingOnMount
        description={
          search.update
            ? undefined
            : 'Официальные новости и патчи Dota 2. Ленты проверяются по расписанию; здесь показаны сохранённые записи.'
        }
      />
      <div hidden={Boolean(search.update)}>
        <DotaIntelligence timezone={timezone} update={search.update} />
      </div>
      {validUpdate && validSourceKey ? (
        <DotaEventDetail sourceKey={validSourceKey} externalId={externalId} timezone={timezone} />
      ) : search.update ? (
        <section aria-labelledby="missing-update-title">
          <h2 id="missing-update-title" ref={invalidHeadingRef} tabIndex={-1}>
            Обновление не найдено
          </h2>
          <p>Ссылка на разбор некорректна.</p>
          <Link to="/sources" search={(previous) => ({ ...previous, update: undefined })}>
            ← К обновлениям
          </Link>
        </section>
      ) : null}
    </>
  );
}
