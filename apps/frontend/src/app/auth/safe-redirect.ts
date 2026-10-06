/** Where to go after sign-in: an in-app path only, never another origin or the login page itself. */
export function safeRedirect(value: string | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  if (value === '/login' || value.startsWith('/login?') || value.startsWith('/login#')) return '/';
  try {
    if (new URL(value, 'http://app.invalid').origin !== 'http://app.invalid') return '/';
  } catch {
    return '/';
  }
  return value;
}
