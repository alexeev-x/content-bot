import { useBlocker } from '@tanstack/react-router';
import type { RefObject } from 'react';

/**
 * Blocks in-app navigation (router) and tab close (beforeunload) while `dirtyRef` is true. A ref, not state,
 * so a save that just succeeded can lift the guard before the navigation that follows it.
 */
export function useLeaveGuard(dirtyRef: RefObject<boolean>) {
  return useBlocker({
    shouldBlockFn: () => dirtyRef.current,
    enableBeforeUnload: () => dirtyRef.current,
    withResolver: true
  });
}
