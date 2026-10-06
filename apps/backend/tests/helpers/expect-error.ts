import { type ApiErrorDto, apiErrorSchema } from '@alexeev/contracts';
import { expect } from 'vitest';

export async function expectError(
  response: Response,
  status: number,
  code: ApiErrorDto['error']['code'],
  details?: Record<string, string>
): Promise<void> {
  expect(response.status).toBe(status);
  const body = apiErrorSchema.parse(await response.json());
  expect(body.error.code).toBe(code);
  expect(body.error.requestId).toBe(response.headers.get('x-request-id'));
  if (details !== undefined) expect(body.error.details).toMatchObject(details);
}
