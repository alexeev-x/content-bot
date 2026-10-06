import { zValidator } from '@hono/zod-validator';
import { bodyLimit } from 'hono/body-limit';
import type { ZodType } from 'zod';
import { AppError } from '../shared/app-error';

const MAX_DETAILS = 5;
const MAX_MESSAGE = 200;

type Target = 'json' | 'query' | 'header' | 'param';

// Parses one part of the request with a contract schema; a failure becomes the standard
// VALIDATION_ERROR body with at most a few "field: message" details and never echoes the input.
//
// `reasons` lists the machine-readable codes a schema's own refinements raise as custom issues;
// the first such issue is exposed as `details.reason`, the way conflicts expose theirs.
export function validated<T extends ZodType, V extends Target>(
  target: V,
  schema: T,
  options: { reasons?: readonly string[] } = {}
) {
  return zValidator(target, schema, (result) => {
    if (result.success) return;
    const details: Record<string, string> = {};
    const reason = result.error.issues.find(
      (issue) => issue.code === 'custom' && options.reasons?.includes(issue.message)
    );
    if (reason !== undefined) details.reason = reason.message;
    for (const issue of result.error.issues.slice(0, MAX_DETAILS)) {
      details[issue.path.map(String).join('.') || target] = issue.message.slice(0, MAX_MESSAGE);
    }
    throw new AppError('VALIDATION_ERROR', 'Request validation failed', details);
  });
}

export function limitBody(maxSize: number) {
  return bodyLimit({
    maxSize,
    onError: (c) =>
      c.json(
        {
          error: {
            code: 'VALIDATION_ERROR' as const,
            message: 'Request body is too large',
            requestId: c.get('requestId')
          }
        },
        413
      )
  });
}
