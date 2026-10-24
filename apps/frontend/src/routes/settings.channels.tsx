import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { ChannelsPage } from '../pages/settings/ChannelsPage';

const searchSchema = z.object({ channel: z.uuid().optional().catch(undefined) });

export const Route = createFileRoute('/settings/channels')({
  validateSearch: searchSchema,
  component: ChannelsRoute
});

function ChannelsRoute() {
  const { channel } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <ChannelsPage
      selectedId={channel}
      onSelect={(id) => void navigate({ search: id ? { channel: id } : {}, replace: false })}
    />
  );
}
