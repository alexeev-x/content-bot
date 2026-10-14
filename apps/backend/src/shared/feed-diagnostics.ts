import type { ZodError } from 'zod';

const MAX_DETAIL = 300;

export function clipDetail(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_DETAIL ? `${flat.slice(0, MAX_DETAIL - 1)}…` : flat;
}

/** Name and message of a thrown value: enough to tell a timeout from a runtime rejection, nothing else. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return clipDetail(`${error.name}: ${error.message}`);
  return 'Non-Error value thrown';
}

/** First failing field of a Zod parse, e.g. `appnews.newsitems.3.url: Invalid URL`. */
export function describeShape(error: ZodError): string {
  const issue = error.issues[0];
  if (issue === undefined) return 'Unexpected payload shape';
  const path = issue.path.map(String).join('.');
  return clipDetail(`${path === '' ? '(root)' : path}: ${issue.message}`);
}

export function describeHttp(response: Response): string {
  return clipDetail(`HTTP ${response.status}${response.statusText === '' ? '' : ` ${response.statusText}`}`);
}
