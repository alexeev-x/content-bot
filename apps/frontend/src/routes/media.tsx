import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import { mediaLibraryKindSchema, mediaLibraryUsageFilterSchema } from '@alexeev/contracts';
import { z } from 'zod';
import { MediaLibrary } from '../features/media';

const mediaSearchSchema = z.looseObject({
  kind: mediaLibraryKindSchema.optional().catch(undefined),
  usage: mediaLibraryUsageFilterSchema.optional().catch(undefined),
  search: z.string().trim().min(1).max(80).optional().catch(undefined),
  view: z.enum(['grid', 'list']).optional().catch(undefined),
  id: z.uuid().optional().catch(undefined)
});

export const Route = createFileRoute('/media')({
  validateSearch: mediaSearchSchema,
  component: function MediaRoute() {
    const searchState = useSearch({ from: '/media' });
    const navigate = useNavigate({ from: '/media' });
    return (
      <MediaLibrary
        searchState={searchState}
        onCreatePost={() => void navigate({ to: '/posts/new' })}
        onLogin={() => void navigate({ to: '/login' })}
        onOpenPost={(id) => void navigate({ to: '/posts/$id', params: { id } })}
        onSearchState={(patch, options) =>
          void navigate({
            search: (previous) => ({ ...previous, ...patch }),
            replace: options?.replace ?? false
          })
        }
      />
    );
  }
});
