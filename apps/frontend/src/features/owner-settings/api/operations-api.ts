import {
  ownerOperationsSettingsSchema,
  type UpdateOwnerOperationsSettingsInput,
  type OwnerOperationsSettingsDto
} from '@alexeev/contracts';
import { apiRequest } from '../../../shared/api/http-client';

const PATH = '/api/v1/settings/operations';

export function fetchOwnerOperationsSettings(signal?: AbortSignal) {
  return apiRequest(PATH, ownerOperationsSettingsSchema, { signal });
}

export function saveOwnerOperationsSettings(input: UpdateOwnerOperationsSettingsInput) {
  return apiRequest(PATH, ownerOperationsSettingsSchema, { method: 'PUT', body: input });
}

export type { OwnerOperationsSettingsDto, UpdateOwnerOperationsSettingsInput };
