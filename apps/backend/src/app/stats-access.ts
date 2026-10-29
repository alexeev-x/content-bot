// STRATZ refuses Cloudflare's addresses, so its calls go through the owner's stats bridge; both are needed.
export function stratzAccess(
  token: string | undefined,
  bridgeUrl: string | undefined,
  direct?: string
): { token: string; bridgeUrl?: string } | null {
  // A token pasted with its quotes is the same token.
  const clean = token?.trim().replace(/^["']+|["']+$/g, '') ?? '';
  const bridge = bridgeUrl?.trim() ?? '';
  if (clean === '') return null;
  // A local run (`STATS_DIRECT` "true", set only in the local vars) calls the sources directly from one home address;
  // a deployed Worker needs the bridge: STRATZ refuses Cloudflare's addresses.
  if (direct === 'true' && bridge === '') return { token: clean };
  return !/^https:\/\/[\w.-]+(:\d+)?\/?$/.test(bridge) ? null : { token: clean, bridgeUrl: bridge };
}
