import { apiErrorSchema, type ApiErrorCode } from '@alexeev/contracts';
import type { ZodType } from 'zod';
import { getAccessToken } from './session';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly requestId: string | undefined;
  readonly details: Record<string, string> | undefined;

  constructor(init: {
    code: ApiErrorCode;
    status: number;
    message: string;
    requestId?: string | undefined;
    details?: Record<string, string> | undefined;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.code = init.code;
    this.status = init.status;
    this.requestId = init.requestId;
    this.details = init.details;
  }
}

function codeFromStatus(status: number): ApiErrorCode {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 422 || status === 400) return 'VALIDATION_ERROR';
  if (status === 429) return 'RATE_LIMIT';
  return 'UNAVAILABLE';
}

/** Maps a non-2xx response to a typed error; uses the contract error body when present. */
export async function mapApiError(response: Response): Promise<ApiError> {
  try {
    const parsed = apiErrorSchema.safeParse(await response.json());
    if (parsed.success) {
      const { code, message, requestId, details } = parsed.data.error;
      return new ApiError({ code, message, requestId, details, status: response.status });
    }
  } catch {
    // body is not JSON: fall back to the status
  }
  return new ApiError({
    code: codeFromStatus(response.status),
    status: response.status,
    message: `HTTP ${response.status}`,
    requestId: response.headers.get('x-request-id') ?? undefined
  });
}

type RequestOptions = { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; signal?: AbortSignal };

export async function apiRequest<T>(path: string, schema: ZodType<T>, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = getAccessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const init: RequestInit = { method: options.method ?? 'GET', headers };
  if (options.signal) init.signal = options.signal;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(new URL(path, window.location.origin), init);
  } catch (cause) {
    if (options.signal?.aborted) throw cause;
    throw new ApiError({ code: 'UNAVAILABLE', status: 0, message: 'Network error' });
  }
  if (!response.ok) throw await mapApiError(response);

  const parsed = schema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) {
    throw new ApiError({ code: 'UNAVAILABLE', status: response.status, message: 'Unexpected response shape' });
  }
  return parsed.data;
}
