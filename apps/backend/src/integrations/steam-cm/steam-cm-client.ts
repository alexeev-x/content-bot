import { readErrorDetail } from '../../platform/error-detail';

// Steam's own product info service (PICS), read the way a Steam client reads it (owner, 24.10.2026: «как люди делают»):
// an anonymous logon to a Steam connection manager over a WebSocket, one product info request, then the socket closes.
// Only the few protobuf fields this needs are written and read here; no Steam library runs in a Worker. A Worker reaches
// only some ports, so only the connection managers on 443 are used. Probe of 24.10.2026: an anonymous logon answers OK;
// Dota 2 (570) gives its public branch's build, Dota 2 Staging (2305270) only its change number (its info needs a token).

const DIRECTORY = 'https://api.steampowered.com/ISteamDirectory/GetCMListForConnect/v1/?cellid=0&cmtype=websockets';
export const STEAM_CM_TIMEOUT_MS = 12_000;
const PROTO = 0x80000000;
const EMSG = {
  Multi: 1,
  ClientLogon: 5514,
  ClientLogOnResponse: 751,
  ProductInfoRequest: 8903,
  ProductInfoResponse: 8904
};
/** Steam's protocol version of a current client. */
const PROTOCOL_VERSION = 65580;
/** An anonymous user's id: universe public (1), account type AnonUser (10), account 0. */
const ANON_STEAMID = (1n << 56n) | (10n << 52n);
const MESSAGE_MAX_BYTES = 2_000_000;

export type SteamCmErrorCode =
  'STEAM_CM_DIRECTORY' | 'STEAM_CM_CONNECT' | 'STEAM_CM_LOGON' | 'STEAM_CM_TIMEOUT' | 'STEAM_CM_SHAPE';

/** `detail` says which step failed and how (owner: every failure in full detail); `status` is Steam's HTTP status. */
export class SteamCmError extends Error {
  constructor(
    readonly code: SteamCmErrorCode,
    readonly detail?: string,
    readonly status?: number
  ) {
    super(code);
    this.name = 'SteamCmError';
  }
}

export interface SteamAppInfo {
  appId: number;
  changeNumber: number;
  /** The public branch's build; null when the app's info needs a token (Dota 2 Staging). */
  publicBuildId: string | null;
  /** When the public branch last changed (epoch seconds), when known. */
  publicTimeUpdated: number | null;
}

// --- protobuf, the few wire types used ---

function varint(value: bigint | number): number[] {
  let rest = BigInt(value);
  const out: number[] = [];
  while (rest > 0x7fn) {
    out.push(Number((rest & 0x7fn) | 0x80n));
    rest >>= 7n;
  }
  out.push(Number(rest));
  return out;
}
const key = (no: number, type: number) => varint((no << 3) | type);
const pbVarint = (no: number, value: bigint | number) => [...key(no, 0), ...varint(value)];
const pbBytes = (no: number, bytes: readonly number[] | Uint8Array) => [
  ...key(no, 2),
  ...varint(bytes.length),
  ...bytes
];
function pbFixed64(no: number, value: bigint): number[] {
  const bytes: number[] = [];
  for (let i = 0n; i < 8n; i += 1n) bytes.push(Number((value >> (8n * i)) & 0xffn));
  return [...key(no, 1), ...bytes];
}

export interface PbField {
  no: number;
  value: bigint | Uint8Array;
}

/** A protobuf message's top-level fields. Throws on a malformed message. */
export function decodeProtobuf(bytes: Uint8Array): PbField[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fields: PbField[] = [];
  let at = 0;
  const readVarint = () => {
    let result = 0n;
    for (let shift = 0n; shift < 70n; shift += 7n) {
      if (at >= bytes.length) throw new SteamCmError('STEAM_CM_SHAPE');
      const byte = bytes[at++] ?? 0;
      result |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return result;
    }
    throw new SteamCmError('STEAM_CM_SHAPE');
  };
  while (at < bytes.length) {
    const tag = Number(readVarint());
    const no = tag >> 3;
    const type = tag & 7;
    if (type === 0) fields.push({ no, value: readVarint() });
    else if (type === 1) {
      if (at + 8 > bytes.length) throw new SteamCmError('STEAM_CM_SHAPE');
      fields.push({ no, value: view.getBigUint64(at, true) });
      at += 8;
    } else if (type === 2) {
      const length = Number(readVarint());
      if (at + length > bytes.length) throw new SteamCmError('STEAM_CM_SHAPE');
      fields.push({ no, value: bytes.subarray(at, at + length) });
      at += length;
    } else if (type === 5) {
      if (at + 4 > bytes.length) throw new SteamCmError('STEAM_CM_SHAPE');
      fields.push({ no, value: BigInt(view.getUint32(at, true)) });
      at += 4;
    } else throw new SteamCmError('STEAM_CM_SHAPE');
  }
  return fields;
}
const numberOf = (fields: PbField[], no: number) => {
  const value = fields.find((each) => each.no === no)?.value;
  return typeof value === 'bigint' ? value : null;
};
const bytesOf = (fields: PbField[], no: number) => {
  const value = fields.find((each) => each.no === no)?.value;
  return value instanceof Uint8Array ? value : null;
};

/** One message as the connection manager frames it: EMsg with the protobuf flag, header length, header, body. */
export function frame(emsg: number, header: readonly number[], body: readonly number[]): Uint8Array {
  const out = new Uint8Array(8 + header.length + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, (emsg | PROTO) >>> 0, true);
  view.setUint32(4, header.length, true);
  out.set(header, 8);
  out.set(body, 8 + header.length);
  return out;
}

/** A framed message's EMsg, header fields and body; a Multi is unpacked into its parts (gzipped or not). */
export async function unframe(bytes: Uint8Array): Promise<{ emsg: number; header: PbField[]; body: Uint8Array }[]> {
  if (bytes.length < 8) throw new SteamCmError('STEAM_CM_SHAPE');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const emsg = (view.getUint32(0, true) & ~PROTO) >>> 0;
  const headerLength = view.getUint32(4, true);
  if (8 + headerLength > bytes.length) throw new SteamCmError('STEAM_CM_SHAPE');
  const header = decodeProtobuf(bytes.subarray(8, 8 + headerLength));
  const body = bytes.subarray(8 + headerLength);
  if (emsg !== EMSG.Multi) return [{ emsg, header, body }];
  const multi = decodeProtobuf(body);
  let payload = bytesOf(multi, 2) ?? new Uint8Array();
  if ((numberOf(multi, 1) ?? 0n) > 0n) payload = await gunzip(payload);
  const parts: { emsg: number; header: PbField[]; body: Uint8Array }[] = [];
  const payloadView = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  for (let at = 0; at + 4 <= payload.length;) {
    const length = payloadView.getUint32(at, true);
    if (at + 4 + length > payload.length) throw new SteamCmError('STEAM_CM_SHAPE');
    parts.push(...(await unframe(payload.subarray(at + 4, at + 4 + length))));
    at += 4 + length;
  }
  return parts;
}

/** Inflates a gzipped Multi, stopping as soon as it passes the cap (QA 24.10.2026: a small bomb is 1 GB inflated). */
async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MESSAGE_MAX_BYTES) {
      await reader.cancel();
      throw new SteamCmError('STEAM_CM_SHAPE');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

/** The public branch of an app's info text (Valve's KeyValues): its build and its last update. */
export function publicBranchOf(text: string): { buildId: string | null; timeUpdated: number | null } {
  const branches = text.indexOf('"branches"');
  const publicAt = branches === -1 ? -1 : text.indexOf('"public"', branches);
  if (publicAt === -1) return { buildId: null, timeUpdated: null };
  const block = text.slice(publicAt, text.indexOf('}', publicAt));
  const value = (name: string) => new RegExp(`"${name}"\\s+"([^"]{1,40})"`, 'u').exec(block)?.[1] ?? null;
  const time = Number(value('timeupdated'));
  return { buildId: value('buildid'), timeUpdated: Number.isFinite(time) && time > 0 ? time : null };
}

/** A WebSocket the client talks through: the Worker's `fetch` upgrade in production, a fake in tests. */
export interface CmSocket {
  send(bytes: Uint8Array): void;
  onMessage(listener: (bytes: Uint8Array) => void): void;
  close(): void;
}

export interface SteamCmDeps {
  fetchImpl?: typeof fetch;
  /** Opens a socket to `https://host:443/cmsocket/`; default: the Worker's WebSocket upgrade. */
  openSocket?: (url: string, signal: AbortSignal) => Promise<CmSocket>;
  timeoutMs?: number;
}

async function workerSocket(url: string, fetchImpl: typeof fetch, signal: AbortSignal): Promise<CmSocket> {
  const response = await fetchImpl(url, { headers: { Upgrade: 'websocket' }, signal });
  const socket = (response as Response & { webSocket?: WebSocket | null }).webSocket;
  if (socket === null || socket === undefined) throw new SteamCmError('STEAM_CM_CONNECT');
  // Binary frames come as Blobs by default at this compatibility date (QA 24.10.2026, workerd): ask for ArrayBuffers,
  // and still read a Blob should one come.
  socket.binaryType = 'arraybuffer';
  (socket as WebSocket & { accept(): void }).accept();
  return {
    send: (bytes) => socket.send(bytes),
    onMessage: (listener) =>
      socket.addEventListener('message', (event: MessageEvent) => {
        const data: unknown = event.data;
        if (data instanceof ArrayBuffer) listener(new Uint8Array(data));
        else if (data instanceof Blob) void data.arrayBuffer().then((buffer) => listener(new Uint8Array(buffer)));
      }),
    close: () => socket.close()
  };
}

/** The connection managers a Worker can reach: WebSocket ones on port 443. */
async function connectionManagers(fetchImpl: typeof fetch, signal: AbortSignal): Promise<string[]> {
  let response: Response;
  try {
    response = await fetchImpl(DIRECTORY, { signal });
  } catch {
    throw new SteamCmError(
      'STEAM_CM_DIRECTORY',
      signal.aborted ? 'список серверов: Steam не ответил вовремя' : 'список серверов: сетевая ошибка'
    );
  }
  if (!response.ok) {
    const said = await readErrorDetail(response);
    throw new SteamCmError(
      'STEAM_CM_DIRECTORY',
      `список серверов${said === undefined ? '' : `: ${said}`}`,
      response.status
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new SteamCmError(
      'STEAM_CM_DIRECTORY',
      signal.aborted ? 'список серверов: ответ не дочитан вовремя' : 'список серверов: ответ не JSON'
    );
  }
  const list = (body as { response?: { serverlist?: { endpoint?: unknown; type?: unknown }[] } }).response?.serverlist;
  const hosts = (Array.isArray(list) ? list : [])
    .filter((server) => server.type === 'websockets' && typeof server.endpoint === 'string')
    .map((server) => String(server.endpoint))
    .filter((endpoint) => /^[a-z0-9.-]{1,100}:443$/u.test(endpoint))
    .map((endpoint) => endpoint.slice(0, -':443'.length));
  if (hosts.length === 0) {
    const total = Array.isArray(list) ? list.length : 0;
    throw new SteamCmError('STEAM_CM_DIRECTORY', `список серверов: из ${total} нет WebSocket на порту 443`);
  }
  return hosts;
}

/** Codes worth one more try in the same run: Steam or the network was slow or dropped, not a refusal. */
const RETRIED: readonly SteamCmErrorCode[] = ['STEAM_CM_DIRECTORY', 'STEAM_CM_CONNECT', 'STEAM_CM_TIMEOUT'];

/**
 * The current info of `appIds`, read anonymously; throws a SteamCmError with a code. A slow or dropped read is tried
 * once more with a fresh deadline and another random manager (owner 29.10.2026: single timeouts in production).
 */
export async function readSteamAppInfo(appIds: readonly number[], deps: SteamCmDeps = {}): Promise<SteamAppInfo[]> {
  try {
    return await readOnce(appIds, deps);
  } catch (error) {
    if (!(error instanceof SteamCmError) || !RETRIED.includes(error.code)) throw error;
    try {
      return await readOnce(appIds, deps);
    } catch (again) {
      if (!(again instanceof SteamCmError)) throw again;
      throw new SteamCmError(again.code, `дважды подряд; ${again.detail ?? again.code}`, again.status);
    }
  }
}

async function readOnce(appIds: readonly number[], deps: SteamCmDeps): Promise<SteamAppInfo[]> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? STEAM_CM_TIMEOUT_MS;
  // One deadline for the directory, the connection and the exchange (QA 24.10.2026: a manager that never answers the
  // upgrade must not hold the queue consumer).
  const started = Date.now();
  const signal = AbortSignal.timeout(timeoutMs);
  const hosts = await connectionManagers(fetchImpl, signal);
  // Any of them; a random one spreads the runs over Valve's servers.
  const host = hosts[Math.floor(Math.random() * hosts.length)] ?? hosts[0];
  const url = `https://${host}/cmsocket/`;
  let socket: CmSocket;
  try {
    socket = await (deps.openSocket ?? ((target, abort) => workerSocket(target, fetchImpl, abort)))(url, signal);
  } catch (error) {
    if (error instanceof SteamCmError) throw error;
    throw new SteamCmError(
      signal.aborted ? 'STEAM_CM_TIMEOUT' : 'STEAM_CM_CONNECT',
      signal.aborted ? `подключение к ${host}: нет ответа за ${timeoutMs / 1000} с` : `подключение к ${host}: отказ`
    );
  }
  try {
    return await new Promise<SteamAppInfo[]>((resolve, reject) => {
      const left = Math.max(1, timeoutMs - (Date.now() - started));
      let stage = 'вход';
      const timer = setTimeout(
        () => reject(new SteamCmError('STEAM_CM_TIMEOUT', `${stage} на ${host}: нет ответа за ${timeoutMs / 1000} с`)),
        left
      );
      let steamId = ANON_STEAMID;
      let session = 0n;
      const header = () => [...pbFixed64(1, steamId), ...pbVarint(2, session)];
      socket.onMessage((bytes) => {
        void unframe(bytes)
          .then((parts) => {
            for (const part of parts) {
              if (part.emsg === EMSG.ClientLogOnResponse) {
                const result = numberOf(decodeProtobuf(part.body), 1);
                if (result !== 1n)
                  throw new SteamCmError('STEAM_CM_LOGON', `вход отклонён, результат ${String(result)}`);
                stage = 'запрос сборки';
                session = numberOf(part.header, 2) ?? 0n;
                steamId = numberOf(part.header, 1) ?? steamId;
                const apps = appIds.flatMap((appId) => pbBytes(2, pbVarint(1, appId)));
                socket.send(
                  frame(EMSG.ProductInfoRequest, [...header(), ...pbFixed64(10, 1n)], [...apps, ...pbVarint(4, 1)])
                );
              } else if (part.emsg === EMSG.ProductInfoResponse) {
                const response = decodeProtobuf(part.body);
                const apps = response
                  .filter((each) => each.no === 1 && each.value instanceof Uint8Array)
                  .map((each) => {
                    const app = decodeProtobuf(each.value as Uint8Array);
                    const buffer = bytesOf(app, 5);
                    const branch = buffer === null ? null : publicBranchOf(new TextDecoder().decode(buffer));
                    return {
                      appId: Number(numberOf(app, 1) ?? 0n),
                      changeNumber: Number(numberOf(app, 2) ?? 0n),
                      publicBuildId: branch?.buildId ?? null,
                      publicTimeUpdated: branch?.timeUpdated ?? null
                    };
                  })
                  // Only what was asked (QA 24.10.2026: an unasked or zero app id broke the run's other app).
                  .filter((app) => appIds.includes(app.appId) && app.changeNumber > 0);
                // The connection manager may answer in parts; this request is small enough to come whole.
                clearTimeout(timer);
                resolve(apps);
              }
            }
          })
          .catch((error: unknown) => {
            clearTimeout(timer);
            reject(error instanceof SteamCmError ? error : new SteamCmError('STEAM_CM_SHAPE'));
          });
      });
      // An anonymous logon: protocol version, cell 0, client OS, language.
      socket.send(
        frame(EMSG.ClientLogon, header(), [
          ...pbVarint(1, PROTOCOL_VERSION),
          ...pbVarint(3, 0),
          ...pbVarint(7, 16),
          ...pbBytes(6, new TextEncoder().encode('english'))
        ])
      );
    });
  } finally {
    socket.close();
  }
}
