const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

// The Worker's own public origin, taken from the request that reached it, so no setting has to name
// it. Telegram only accepts https; plain http survives only for a local run.
export function appOriginOf(requestUrl: string): string {
  const url = new URL(requestUrl);
  if (url.protocol === 'http:' && !LOOPBACK_HOSTS.has(url.hostname)) url.protocol = 'https:';
  return url.origin;
}

export function webhookUrlFor(appOrigin: string): string {
  return `${appOrigin}/webhooks/telegram`;
}
