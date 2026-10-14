import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect, useRef } from 'react';
import { useDocumentTitle } from '../../app/use-document-title';
import { DotaEventDetail, SourcesBoard, type FeedFilters } from '../../features/dota-intelligence';
import { useOwnerTimezone } from '../../features/owner-settings';
import { ru } from '../../shared/lib/ru';
import { PageHeader } from '../../shared/ui';

export function SourcesPage() {
  const timezone = useOwnerTimezone();
  const search = useSearch({ from: '/sources' });
  const navigate = useNavigate({ from: '/sources' });
  const parts = search.update?.split(':') ?? [];
  const sourceKey = parts.shift();
  const externalId = parts.join(':');
  const validSourceKey = sourceKey === 'steam_news' || sourceKey === 'patch_notes' ? sourceKey : undefined;
  const validUpdate = validSourceKey !== undefined && /^[A-Za-z0-9._-]{1,100}$/.test(externalId);
  const filters: FeedFilters = { status: search.status ?? 'new', type: search.type ?? 'all', page: search.page ?? 1 };
  const onFiltersChange = useCallback(
    (patch: Partial<FeedFilters>) =>
      void navigate({
        search: (previous) => {
          const { type, ...rest } = patch;
          return {
            ...previous,
            ...rest,
            ...(type !== undefined ? { type: type === 'all' ? undefined : type } : {}),
            ...(patch.page === 1 ? { page: undefined } : {})
          };
        },
        replace: true
      }),
    [navigate]
  );
  const invalidHeadingRef = useRef<HTMLHeadingElement>(null);
  useDocumentTitle(search.update ? 'Разбор обновления' : ru.pages.sources);

  useEffect(() => {
    if (search.update && !validUpdate) invalidHeadingRef.current?.focus();
  }, [search.update, validUpdate]);

  return (
    <>
      <PageHeader
        title={ru.pages.sources}
        focusHeadingOnMount
        description={search.update ? undefined : 'События Dota 2 и статистика героев'}
      />
      <div hidden={Boolean(search.update)}>
        <SourcesBoard
          timezone={timezone}
          view={search.tab ?? 'feed'}
          onViewChange={(tab) => void navigate({ search: (previous) => ({ ...previous, tab }), replace: true })}
          filters={filters}
          onFiltersChange={onFiltersChange}
        />
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
            ← К ленте
          </Link>
        </section>
      ) : null}
    </>
  );
}
