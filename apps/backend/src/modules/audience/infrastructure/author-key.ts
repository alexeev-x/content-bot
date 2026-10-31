// A commenter as a stable 16-hex key: HMAC-SHA256 of the Telegram user id under the Worker secret AUDIENCE_HASH_KEY.
// It tells «the same person commented again» without keeping who it was. The key is imported per call: no module state.

export async function authorKey(secret: string, userId: number): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign'
  ]);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(String(userId))));
  return Array.from(signature.slice(0, 8), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
