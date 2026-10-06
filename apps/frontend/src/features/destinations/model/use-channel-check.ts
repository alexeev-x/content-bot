import type { DestinationCheckDto } from '@alexeev/contracts';
import { useCallback, useState } from 'react';
import { useCheckDestination } from '../api/destinations-queries';
import { describeFailure, type RequestFailure } from './check-failure';
import { useCountdown } from './use-countdown';

export type ChannelCheck = {
  isChecking: boolean;
  result: DestinationCheckDto | null;
  failure: RequestFailure | null;
  /** Seconds the server asked us to wait after a 429; checking is blocked meanwhile. */
  waitSeconds: number;
  /** `onResult` fires with the answer of this very call (never for a call that was reset meanwhile). */
  run: (chatId: string, onResult?: (result: DestinationCheckDto) => void) => void;
  /** Forget the answer: the operator changed what was checked, so it no longer vouches for the new input. */
  reset: () => void;
};

/** One check at a time. The answer lives only here (never in the cache) and is dropped with `reset`. */
export function useChannelCheck(): ChannelCheck {
  const mutation = useCheckDestination();
  const [failure, setFailure] = useState<RequestFailure | null>(null);
  const { secondsLeft: waitSeconds, start: startWait } = useCountdown();
  const { mutate, reset: resetMutation } = mutation;

  const run = useCallback(
    (chatId: string, onResult?: (result: DestinationCheckDto) => void) => {
      setFailure(null);
      mutate(
        { chatId },
        {
          onSuccess: (answer) => onResult?.(answer),
          onError: (error) => {
            const described = describeFailure(error);
            setFailure(described);
            if (described.kind === 'rate_limited' && described.retryAfterSeconds !== undefined) {
              startWait(described.retryAfterSeconds);
            }
          }
        }
      );
    },
    [mutate, startWait]
  );

  const reset = useCallback(() => {
    resetMutation();
    setFailure(null);
  }, [resetMutation]);

  return {
    isChecking: mutation.isPending,
    result: mutation.data ?? null,
    failure,
    waitSeconds,
    run,
    reset
  };
}
