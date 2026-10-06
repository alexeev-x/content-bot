import { classifyApiError, type ApiErrorKind } from '../../../shared/api/error-kind';
import { ApiError } from '../../../shared/api/http-client';
import { postsCopy } from '../ui/copy';

const copy = postsCopy.editor.errors;

export type EditorNotice = { title: string; message: string; requestId?: string | undefined };

function messageFor(kind: ApiErrorKind): string {
  switch (kind) {
    case 'validation':
      return copy.validation;
    case 'payload_too_large':
      return copy.tooLarge;
    case 'unavailable':
      return copy.unavailable;
    case 'rate_limited':
      return copy.rate;
    case 'forbidden':
      return copy.forbidden;
    default:
      return copy.generic;
  }
}

/** Short text plus the requestId; the typed text always stays in the editor. */
export function toEditorNotice(error: unknown, title: string): EditorNotice {
  const kind = classifyApiError(error);
  return {
    title,
    message: `${messageFor(kind)} ${copy.keep}`,
    requestId: error instanceof ApiError ? error.requestId : undefined
  };
}
