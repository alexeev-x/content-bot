import type { AppearanceDto } from '@alexeev/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { appearanceKeys, appearanceQueryOptions, useSaveAppearance } from '../api/appearance-queries';
import { toInput, toValue, type AppearanceValue } from './appearance-value';

type Options = {
  /** Applies a value to the document without persisting it; must be stable. */
  preview: (value: AppearanceValue) => void;
  /** The save failed; the screen already returned to the server value. */
  onFailure: () => void;
};

/**
 * Immediate saving of the appearance (owner decision 07.10.2026): a choice shows at once and is saved right away;
 * the query cache changes only with the server's answer. Choices are merged and sent one request at a time, the
 * last one wins. 409: refetch the newest revision and send the same choice once more.
 */
export function useAppearanceSaver({ preview, onFailure }: Options) {
  const queryClient = useQueryClient();
  const save = useSaveAppearance();
  const wanted = useRef<Partial<AppearanceValue> | null>(null);
  const running = useRef(false);

  const cached = useCallback(() => queryClient.getQueryData<AppearanceDto>(appearanceKeys.detail()), [queryClient]);

  const send = useCallback(
    (base: AppearanceDto, patch: Partial<AppearanceValue>) =>
      save.mutateAsync(toInput({ ...toValue(base), ...patch }, base.revision)),
    [save]
  );

  const persist = useCallback(
    async (patch: Partial<AppearanceValue>): Promise<boolean> => {
      const base = cached();
      if (!base) return false;
      try {
        await send(base, patch);
        return true;
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 409)) return false;
      }
      try {
        const fresh = await queryClient.fetchQuery({ ...appearanceQueryOptions(), staleTime: 0 });
        await send(fresh, patch);
        return true;
      } catch {
        return false;
      }
    },
    [cached, queryClient, send]
  );

  const drain = useCallback(async () => {
    running.current = true;
    while (wanted.current) {
      const patch = wanted.current;
      wanted.current = null;
      const ok = await persist(patch);
      if (!ok && !wanted.current) {
        const server = cached();
        if (server) preview(toValue(server));
        onFailure();
      }
    }
    running.current = false;
  }, [cached, persist, preview, onFailure]);

  /** Shows the change and queues it for saving. */
  const choose = useCallback(
    (patch: Partial<AppearanceValue>) => {
      const base = cached();
      if (!base) return;
      wanted.current = { ...wanted.current, ...patch };
      preview({ ...toValue(base), ...wanted.current });
      if (!running.current) void drain();
    },
    [cached, drain, preview]
  );

  return { choose, isSaving: save.isPending };
}
