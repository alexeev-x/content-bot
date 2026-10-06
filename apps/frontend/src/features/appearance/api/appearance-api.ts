import { appearanceSchema, type UpdateAppearanceInput } from '@alexeev/contracts';
import { apiRequest } from '../../../shared/api/http-client';

const PATH = '/api/v1/settings/appearance';

export function fetchAppearance(signal?: AbortSignal) {
  return apiRequest(PATH, appearanceSchema, { signal });
}

/** Replaces the whole document; `revision` is the one the edits are based on (409 STALE_REVISION otherwise). */
export function saveAppearance(input: UpdateAppearanceInput) {
  return apiRequest(PATH, appearanceSchema, { method: 'PUT', body: input });
}
