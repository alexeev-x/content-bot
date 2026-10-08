// The owner's display name, remembered per browser so a reload shows it at once instead of a placeholder while
// /auth/me answers. Not a secret (the access token never leaves memory); cleared on sign-out and lost sessions.
const KEY = 'ui-owner-name';
const MAX_LENGTH = 64;

export function readOwnerName(): string | undefined {
  try {
    const value = window.localStorage.getItem(KEY)?.trim();
    return value && value.length <= MAX_LENGTH ? value : undefined;
  } catch {
    return undefined;
  }
}

export function writeOwnerName(name: string): void {
  try {
    const value = name.trim();
    if (value && value.length <= MAX_LENGTH) window.localStorage.setItem(KEY, value);
  } catch {
    // Storage blocked (private mode): the name simply arrives with /auth/me.
  }
}

export function clearOwnerName(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing stored if storage is blocked.
  }
}
