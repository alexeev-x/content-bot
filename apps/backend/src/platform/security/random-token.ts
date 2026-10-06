// 32 random bytes as base64url (43 characters, no padding): safe in a header or a cookie value.
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

// What randomToken() produces. Anything else is rejected before it is hashed or looked up.
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
