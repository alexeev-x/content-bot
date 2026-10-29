// What the owner reads when something fails (owner, 28.10.2026): which API, which step, the stable code, the HTTP
// status and the provider's own words, bounded and with every secret-looking part removed. Request bodies, prompts
// and user payloads are never passed in here: callers hand over only what the provider answered.

export const ERROR_DETAIL_MAX = 300;
const BODY_PEEK_BYTES = 2_000;
const REDACTED = '[скрыто]';

const REDACTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  // Bot API paths and bare bot tokens: «bot123456:AA…» also appears in Telegram's own descriptions.
  [/bot\d{5,}:[A-Za-z0-9_-]{20,}/g, `bot${REDACTED}`],
  [/\b\d{5,}:[A-Za-z0-9_-]{30,}/g, REDACTED],
  [/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{6,}/gi, `$1 ${REDACTED}`],
  [/\b(authorization|x-api-key|api-key|cookie|set-cookie)\s*["']?\s*[:=]\s*[^\s,;"']+/gi, `$1: ${REDACTED}`],
  // Query or form parameters that carry credentials.
  [
    /([?&"'\s](?:key|api_?key|apikey|token|access_token|refresh_token|secret|signature|sig|hash|auth|password)["']?\s*[=:]\s*["']?)[^&\s"',}]+/gi,
    `$1${REDACTED}`
  ],
  [/(init_?data["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, `$1${REDACTED}`],
  // Provider keys (OpenAI «sk-…», «sk-proj-…») and JWTs.
  [/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}/g, REDACTED],
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, REDACTED],
  // Any other long opaque run (a hex or base64 key), keeping UUIDs readable.
  [/\b(?![0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-)[A-Za-z0-9_-]{32,}\b/g, REDACTED]
];

export function redactSecrets(text: string): string {
  let result = text;
  for (const [pattern, replacement] of REDACTIONS) result = result.replace(pattern, replacement);
  return result;
}

/** One redacted, whitespace-collapsed line of at most `max` characters. */
export function boundDetail(text: string, max = ERROR_DETAIL_MAX): string {
  const line = redactSecrets(
    text
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) if (typeof value === 'string' && value.trim() !== '') return value;
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** The provider's own error text out of a JSON body (OpenAI, STRATZ GraphQL, Telegram, GitHub shapes) or plain text. */
export function detailFromBody(text: string): string | undefined {
  if (text.trim() === '') return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return boundDetail(text) || undefined;
  }
  const root = asRecord(parsed);
  if (root === null) return boundDetail(text) || undefined;
  const nested = asRecord(root['error']);
  const graphql = Array.isArray(root['errors']) ? asRecord(root['errors'][0]) : null;
  const message = firstText(
    nested?.['message'],
    graphql?.['message'],
    root['message'],
    root['description'],
    root['error_description'],
    root['error']
  );
  const kind = firstText(nested?.['code'], nested?.['type'], root['code'], root['status']);
  const joined = [kind, message].filter((part): part is string => part !== null).join(': ');
  return joined === '' ? boundDetail(text) || undefined : boundDetail(joined);
}

/** Reads at most the first 2 kB of a failed response and returns the provider's words; never throws. */
export async function readErrorDetail(response: Response): Promise<string | undefined> {
  try {
    const body = response.body;
    if (body === null) return undefined;
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < BODY_PEEK_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
    await reader.cancel().catch(() => undefined);
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, at);
      at += chunk.byteLength;
    }
    return detailFromBody(new TextDecoder().decode(bytes.subarray(0, BODY_PEEK_BYTES)));
  } catch {
    return undefined;
  }
}

const API_BY_ERROR_NAME: Record<string, string> = {
  StratzError: 'STRATZ',
  OpenDotaError: 'OpenDota',
  BrowserRenderError: 'Browser Rendering',
  AiProviderError: 'OpenAI',
  GitHubApiError: 'GitHub',
  SteamPublicError: 'Steam',
  SteamCmError: 'Steam CM',
  TikTokApiError: 'TikTok',
  YouTubeApiError: 'YouTube',
  DatafeedError: 'Valve datafeed',
  DotaConstantsError: 'dotaconstants',
  ChannelPreviewError: 'Telegram t.me',
  GrammyError: 'Telegram',
  HttpError: 'Telegram',
  AppError: 'Приложение',
  TimeoutError: 'Сеть',
  AbortError: 'Сеть'
};

export interface ErrorParts {
  api: string;
  code: string;
  status: number | null;
  detail: string | null;
}

/** The parts of any caught error, read by shape so platform code does not import the integrations. */
export function errorParts(error: unknown): ErrorParts {
  if (!(error instanceof Error)) return { api: 'Приложение', code: 'UNKNOWN', status: null, detail: null };
  const record = error as Error & Record<string, unknown>;
  const api = API_BY_ERROR_NAME[error.name] ?? 'Приложение';
  let code = typeof record['code'] === 'string' ? record['code'] : error.name;
  let status =
    typeof record['httpStatus'] === 'number'
      ? record['httpStatus']
      : typeof record['error_code'] === 'number'
        ? record['error_code']
        : typeof record['status'] === 'number'
          ? record['status']
          : null;
  let detail: string | null = null;
  if (typeof record['detail'] === 'string') detail = record['detail'];
  else if (typeof record['description'] === 'string') {
    // grammY's GrammyError: Telegram's own refusal text.
    code = 'TELEGRAM_API';
    detail = record['description'];
  } else {
    const details = asRecord(record['details']);
    const reason = details === null ? null : firstText(details['reason']);
    if (error.name === 'AppError') detail = [reason, error.message].filter((part) => part !== null).join(' — ');
    else if (error.name === 'HttpError') {
      code = 'TELEGRAM_NETWORK';
      detail = error.message;
    } else if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      code = 'TIMEOUT';
      detail = 'запрос не уложился в срок';
    }
    // A plain unknown Error: only its class, never its message (it can hold anything).
  }
  if (status === null && error.name === 'AppError') {
    const fromDetails = asRecord(record['details'])?.['status'];
    if (typeof fromDetails === 'string' && /^\d{3}$/.test(fromDetails)) status = Number(fromDetails);
  }
  return { api, code, status, detail: detail === null || detail === '' ? null : boundDetail(detail) };
}

const grammyMethod = (error: Error): string | null => {
  const method = (error as Error & { method?: unknown }).method;
  return typeof method === 'string' ? method : null;
};

/** `<API> <operation>: <code>, HTTP <status> — <detail>`: one line, no secrets, at most ~450 characters. */
export function describeError(error: unknown, operation?: string): string {
  const parts = errorParts(error);
  const step = operation ?? (error instanceof Error ? grammyMethod(error) : null);
  const head = step === null || step === undefined ? parts.api : `${parts.api} ${step}`;
  const status = parts.status === null ? '' : `, HTTP ${parts.status}`;
  const detail = parts.detail === null ? '' : ` — ${parts.detail}`;
  return `${head}: ${parts.code}${status}${detail}`;
}

/** The two log fields for a caught error: a stable code and the bounded detail line. */
export function errorLogFields(error: unknown, operation?: string): { errorCode: string; detail: string } {
  return { errorCode: errorParts(error).code, detail: describeError(error, operation) };
}

/** A failed `fetch` or other thrown cause: its name and message, bounded and redacted (a URL's `key=` is stripped). */
export function causeDetail(cause: unknown): string | undefined {
  if (cause instanceof Error) return boundDetail(`${cause.name}: ${cause.message}`) || undefined;
  return typeof cause === 'string' ? boundDetail(cause) || undefined : undefined;
}

/** Which fields of a provider's answer did not fit the schema: paths and rules only, at most three. */
export function schemaDetail(error: {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}): string {
  return boundDetail(
    error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`)
      .join('; ')
  );
}
