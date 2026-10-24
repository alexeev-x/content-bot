// Encrypts OAuth tokens before they reach D1: AES-GCM with a key derived (HKDF-SHA-256) from a Worker
// secret, so a database export alone does not hand out account access. Rotating that secret makes the
// stored tokens unreadable, which the caller reports as «reconnect».
const VERSION = 'v1';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function deriveKey(secret: string, purpose: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode(purpose) },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export interface TokenCipher {
  encrypt(plain: string): Promise<string>;
  /** Null when the value was not produced with this secret and purpose. */
  decrypt(sealed: string): Promise<string | null>;
}

export function createTokenCipher(secret: string, purpose: string): TokenCipher {
  let key: Promise<CryptoKey> | null = null;
  const getKey = () => (key ??= deriveKey(secret, purpose));
  return {
    async encrypt(plain) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const sealed = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        await getKey(),
        new TextEncoder().encode(plain)
      );
      return `${VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(sealed))}`;
    },
    async decrypt(sealed) {
      const [version, iv, body] = sealed.split('.');
      if (version !== VERSION || iv === undefined || body === undefined) return null;
      try {
        const plain = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: fromBase64Url(iv) },
          await getKey(),
          fromBase64Url(body)
        );
        return new TextDecoder().decode(plain);
      } catch {
        return null;
      }
    }
  };
}
