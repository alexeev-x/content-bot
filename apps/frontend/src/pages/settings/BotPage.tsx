import { useQuery } from '@tanstack/react-query';
import { BotConnection, botCopy, botStatusQueryOptions } from '../../features/bot';
import { Card } from '../../shared/ui';

export function BotPage() {
  // Shares the cache entry with the feature, so the username in the subtitle costs no extra request.
  const username = useQuery(botStatusQueryOptions()).data?.botUsername;
  return (
    <Card title={botCopy.title}>
      {username ? <p>{botCopy.descriptionWith(username)}</p> : null}
      <BotConnection />
    </Card>
  );
}
