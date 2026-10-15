import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { mediaLibraryKindSchema, mediaLibraryUsageFilterSchema } from '@alexeev/contracts';
import { z } from 'zod';
import { HeroGallery } from '../features/hero-assets';
import { MediaLibrary } from '../features/media';
import { useOwnerTimezone } from '../features/owner-settings';

const mediaSearchSchema = z.looseObject({
  kind: mediaLibraryKindSchema.optional().catch(undefined),
  usage: mediaLibraryUsageFilterSchema.optional().catch(undefined),
  search: z.string().trim().min(1).max(80).optional().catch(undefined),
  view: z.enum(['grid', 'list']).optional().catch(undefined),
  id: z.uuid().optional().catch(undefined),
  page: z.number().int().min(1).max(1000).optional().catch(1),
  section: z.enum(['heroes']).optional().catch(undefined)
});

export const Route = createFileRoute('/media')({
  validateSearch: mediaSearchSchema,
  component: function MediaRoute() {
    const searchState = useSearch({ from: '/media' });
    const navigate = useNavigate({ from: '/media' });
    const timezone = useOwnerTimezone();
    return (
      <MediaLibrary
        searchState={searchState}
        timezone={timezone}
        extraTab={{
          id: 'heroes',
          label: 'Герои Dota',
          selected: searchState.section === 'heroes',
          onSelect: () => void navigate({ search: (previous) => ({ ...previous, section: 'heroes', id: undefined }) }),
          content: <HeroGallery />
        }}
        onCreatePost={() => void navigate({ to: '/posts/new' })}
        onLogin={() => void navigate({ to: '/login' })}
        onOpenPost={(id) => void navigate({ to: '/posts/$id', params: { id } })}
        onSearchState={(patch, options) =>
          void navigate({
            // Filters and search start again from page 1; paging, the view and the open file keep it.
            search: (previous) => ({
              ...previous,
              ...(Object.keys(patch).some((key) => key !== 'id' && key !== 'page' && key !== 'view')
                ? { page: undefined }
                : {}),
              ...patch,
              // A file-kind tab leaves «Герои Dota».
              ...('kind' in patch ? { section: undefined } : {})
            }),
            replace: options?.replace ?? false
          })
        }
      />
    );
  }
});
