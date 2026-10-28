// STRATZ refuses Cloudflare's addresses, so its calls go through the owner's stats bridge; both are needed.
export function stratzAccess(
  token: string | undefined,
  bridgeUrl: string | undefined
): { token: string; bridgeUrl: string } | null {
  // A token pasted with its quotes is the same token.
  const clean = token?.trim().replace(/^["']+|["']+$/g, '') ?? '';
  const bridge = bridgeUrl?.trim() ?? '';
  return clean === '' || !/^https:\/\/[\w.-]+(:\d+)?\/?$/.test(bridge) ? null : { token: clean, bridgeUrl: bridge };
}
