/** The stable code of a watch's failure for «Состояние лент»: the error's own `code` when it has one, else its name. */
export function watchErrorCode(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown';
  return 'code' in error && typeof error.code === 'string' ? error.code : error.name;
}
