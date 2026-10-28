import { type BrowserBinding, createBrowserPictureRenderer } from '../../integrations/browser-render/browser-render';
import type { RubricKey } from '../../modules/rubrics';
import type { Container } from '../container';
import type { AppEnv } from '../env';
import { stratzAccess } from '../stats-access';
import { runRubricSampleJob } from './rubric-samples';

/** The queued jobs of «Тестирование»; handleAiQueue gets it only from a build with `__LAB__` (src/index.ts). */
export type LabQueue = {
  runRubricSample: (
    container: Container,
    token: string,
    rubric: RubricKey,
    requestId: string,
    onError: (error: unknown) => void
  ) => Promise<void>;
};

const isBrowserBinding = (value: unknown): value is BrowserBinding =>
  typeof value === 'object' && value !== null && typeof (value as { quickAction?: unknown }).quickAction === 'function';

export function createLabQueue(env: Partial<AppEnv>): LabQueue {
  return {
    runRubricSample: (container, token, rubric, requestId, onError) =>
      runRubricSampleJob(
        container,
        {
          renderer: isBrowserBinding(env.BROWSER) ? createBrowserPictureRenderer(env.BROWSER) : null,
          stratzAccess: stratzAccess(env.STRATZ_TOKEN, env.STATS_BRIDGE_URL, env.STATS_DIRECT)
        },
        token,
        rubric,
        requestId,
        onError
      )
  };
}
