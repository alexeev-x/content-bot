// STRATZ refuses Cloudflare's addresses, so its calls go through the owner's stats bridge; both are needed.
// `STATS_BRIDGE_URL` holds the main bridge, or the main and the spare comma-separated (bridge/stats-bridge/README.md).
export function stratzAccess(
  token: string | undefined,
  bridgeUrl: string | undefined,
  direct?: string
): { token: string; bridgeUrl?: string; spareBridgeUrl?: string } | null {
  // A token pasted with its quotes is the same token.
  const clean = token?.trim().replace(/^["']+|["']+$/g, '') ?? '';
  const [bridge = '', spare = '', ...rest] = (bridgeUrl ?? '').split(',').map((each) => each.trim());
  if (clean === '') return null;
  // A local run (`STATS_DIRECT` "true", set only in the local vars) calls the sources directly from one home address;
  // a deployed Worker needs the bridge: STRATZ refuses Cloudflare's addresses.
  if (direct === 'true' && bridge === '') return { token: clean };
  const origin = /^https:\/\/[\w.-]+(:\d+)?\/?$/;
  // Two bridges at most: STRATZ allows one token two addresses per 15 minutes.
  if (!origin.test(bridge) || rest.length > 0 || (spare !== '' && !origin.test(spare))) return null;
  return spare === ''
    ? { token: clean, bridgeUrl: bridge }
    : { token: clean, bridgeUrl: bridge, spareBridgeUrl: spare };
}
