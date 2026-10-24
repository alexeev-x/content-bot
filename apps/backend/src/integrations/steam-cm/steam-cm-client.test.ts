import { describe, expect, it } from 'vitest';
import { type CmSocket, decodeProtobuf, frame, publicBranchOf, readSteamAppInfo, unframe } from './steam-cm-client';

// The anonymous Steam product info read (owner, 24.10.2026), against a fake connection manager speaking the same frames
// Valve's did in the probe of that day.

const varint = (value: number) => {
  const out: number[] = [];
  let rest = value;
  while (rest > 0x7f) {
    out.push((rest & 0x7f) | 0x80);
    rest = Math.floor(rest / 128);
  }
  out.push(rest);
  return out;
};
const bytes = (no: number, data: readonly number[]) => [...varint((no << 3) | 2), ...varint(data.length), ...data];
const number = (no: number, value: number) => [...varint(no << 3), ...varint(value)];
const text = (value: string) => [...new TextEncoder().encode(value)];

const APP_570 = `"appinfo"\n{\n\t"depots"\n\t{\n\t\t"branches"\n\t\t{\n\t\t\t"public"\n\t\t\t{\n\t\t\t\t"buildid"\t\t"26139613"\n\t\t\t\t"timeupdated"\t\t"1792694372"\n\t\t\t}\n\t\t}\n\t}\n}`;

/** A connection manager that accepts the anonymous logon and answers the product info request. */
function fakeManager(logonResult = 1): { socket: CmSocket; sent: number[] } {
  let listener: (data: Uint8Array) => void = () => {};
  const sent: number[] = [];
  const reply = (data: Uint8Array) => queueMicrotask(() => listener(data));
  return {
    sent,
    socket: {
      send: (data) => {
        const emsg = new DataView(data.buffer, data.byteOffset).getUint32(0, true) & 0x7fffffff;
        sent.push(emsg);
        if (emsg === 5514) reply(frame(751, [...number(2, 77)], number(1, logonResult)));
        if (emsg === 8903)
          reply(
            frame(
              8904,
              [],
              [
                ...bytes(1, [...number(1, 570), ...number(2, 40140808), ...bytes(5, text(APP_570))]),
                ...bytes(1, [...number(1, 2305270), ...number(2, 39554034), ...number(3, 1)])
              ]
            )
          );
      },
      onMessage: (next) => {
        listener = next;
      },
      close: () => {}
    }
  };
}

const directory = (async () =>
  Response.json({
    response: {
      serverlist: [
        { endpoint: 'cmp1-fra1.steamserver.net:27020', type: 'websockets' },
        { endpoint: 'cmp2-tyo3.steamserver.net:443', type: 'websockets' }
      ]
    }
  })) as unknown as typeof fetch;

describe('readSteamAppInfo', () => {
  it('logs on anonymously and reads Dota 2’s public build and Dota 2 Staging’s change number', async () => {
    const manager = fakeManager();
    const urls: string[] = [];
    const apps = await readSteamAppInfo([570, 2305270], {
      fetchImpl: directory,
      openSocket: async (url) => {
        urls.push(url);
        return manager.socket;
      }
    });
    // Only a manager on port 443: the one a Worker can reach.
    expect(urls).toEqual(['https://cmp2-tyo3.steamserver.net/cmsocket/']);
    expect(manager.sent).toEqual([5514, 8903]);
    expect(apps).toEqual([
      { appId: 570, changeNumber: 40140808, publicBuildId: '26139613', publicTimeUpdated: 1792694372 },
      { appId: 2305270, changeNumber: 39554034, publicBuildId: null, publicTimeUpdated: null }
    ]);
  });

  it('fails with a code when the logon is refused', async () => {
    const manager = fakeManager(5);
    await expect(
      readSteamAppInfo([570], { fetchImpl: directory, openSocket: async () => manager.socket })
    ).rejects.toMatchObject({ code: 'STEAM_CM_LOGON' });
  });
});

describe('the frames', () => {
  it('unpacks a gzipped Multi into its messages', async () => {
    const inner = frame(751, [...number(2, 5)], number(1, 1));
    const sized = [...new Uint8Array(new Uint32Array([inner.length]).buffer), ...inner];
    const gzipped = new Uint8Array(
      await new Response(
        new Blob([new Uint8Array(sized)]).stream().pipeThrough(new CompressionStream('gzip'))
      ).arrayBuffer()
    );
    const parts = await unframe(frame(1, [], [...number(1, sized.length), ...bytes(2, [...gzipped])]));
    expect(parts.map((part) => part.emsg)).toEqual([751]);
    expect(decodeProtobuf(parts[0]?.body ?? new Uint8Array())).toEqual([{ no: 1, value: 1n }]);
  });

  it('reads the public branch of an app’s info, or nothing without one', () => {
    expect(publicBranchOf(APP_570)).toEqual({ buildId: '26139613', timeUpdated: 1792694372 });
    expect(publicBranchOf('"appinfo" {}')).toEqual({ buildId: null, timeUpdated: null });
  });
});
