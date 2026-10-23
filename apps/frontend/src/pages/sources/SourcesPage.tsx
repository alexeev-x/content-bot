import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect, useRef } from 'react';
import { useDocumentTitle } from '../../app/use-document-title';
import { readAppEnvironment } from '../../app/environment';
import {
  DotaEventDetail,
  RichSamplesButton,
  RichSamplesResult,
  SourcesBoard,
  type SourceTableView,
  useSendRichSamples
} from '../../features/dota-intelligence';
import { useOwnerTimezone } from '../../features/owner-settings';
import { ru } from '../../shared/lib/ru';
import { LinkButton, PageHeader } from '../../shared/ui';

export function SourcesPage() {
  const timezone = useOwnerTimezone();
  const search = useSearch({ from: '/sources' });
  const navigate = useNavigate({ from: '/sources' });
  const parts = search.update?.split(':') ?? [];
  const sourceKey = parts.shift();
  const externalId = parts.join(':');
  const validSourceKey = sourceKey === 'steam_news' || sourceKey === 'patch_notes' ? sourceKey : undefined;
  const validUpdate = validSourceKey !== undefined && /^[A-Za-z0-9._-]{1,100}$/.test(externalId);
  const state: SourceTableView = { view: search.view ?? 'active', page: search.page ?? 1, open: search.open };
  const onChange = useCallback(
    (patch: Partial<SourceTableView>) =>
      void navigate({
        search: (previous) => ({
          ...previous,
          ...patch,
          ...(patch.page === 1 ? { page: undefined } : {}),
          ...(patch.view === 'active' ? { view: undefined } : {})
        }),
        replace: true
      }),
    [navigate]
  );
  const invalidHeadingRef = useRef<HTMLHeadingElement>(null);
  const isDev = readAppEnvironment() === 'dev';
  const richSamples = useSendRichSamples();
  useDocumentTitle(search.update ? 'Разбор обновления' : ru.pages.sources);

  useEffect(() => {
    if (search.update && !validUpdate) invalidHeadingRef.current?.focus();
  }, [search.update, validUpdate]);

  return (
    <>
      <PageHeader
        title={ru.pages.sources}
        focusHeadingOnMount
        actions={
          isDev && !search.update ? (
            <>
              <LinkButton href="/dev-runs" variant="secondary">
                Проверка автопостов
              </LinkButton>
              <RichSamplesButton state={richSamples} />
            </>
          ) : undefined
        }
      />
      {isDev ? <RichSamplesResult state={richSamples} /> : null}
      <div hidden={Boolean(search.update)}>
        <SourcesBoard timezone={timezone} state={state} onChange={onChange} autopublishTest={isDev} />
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
