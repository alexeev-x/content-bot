import { ApiError } from '../../shared/api/http-client';
import { ru } from '../../shared/lib/ru';
import { Button, EmptyState } from '../../shared/ui';

type Props = { error: unknown; reset: () => void };

/** Default route error state: never shows the raw error message. */
export function RouteError({ error, reset }: Props) {
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  const description = requestId
    ? `${ru.routeError.description} ${ru.routeError.requestId}: ${requestId}`
    : ru.routeError.description;
  return (
    <div role="alert">
      <EmptyState
        title={ru.routeError.title}
        description={description}
        action={<Button onPress={reset}>{ru.common.retry}</Button>}
      />
    </div>
  );
}
