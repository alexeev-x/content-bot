const UNKNOWN = 'unknown';

function parseIpv4(text: string): [number, number, number, number] | null {
  const parts = text.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
  if (octets.some((octet) => !(octet >= 0 && octet <= 255))) return null;
  return [octets[0] ?? 0, octets[1] ?? 0, octets[2] ?? 0, octets[3] ?? 0];
}

// Expands any textual IPv6 form (compressed, embedded dotted IPv4) into its eight 16-bit groups.
function parseIpv6(text: string): number[] | null {
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const toGroups = (side: string): number[] | null => {
    if (side === '') return [];
    const groups: number[] = [];
    const items = side.split(':');
    for (const [index, item] of items.entries()) {
      if (item.includes('.')) {
        const v4 = index === items.length - 1 ? parseIpv4(item) : null;
        if (v4 === null) return null;
        groups.push(v4[0] * 256 + v4[1], v4[2] * 256 + v4[3]);
      } else if (/^[0-9a-f]{1,4}$/.test(item)) {
        groups.push(Number.parseInt(item, 16));
      } else {
        return null;
      }
    }
    return groups;
  };
  const head = toGroups(halves[0] ?? '');
  const tail = halves.length === 2 ? toGroups(halves[1] ?? '') : [];
  if (head === null || tail === null) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const missing = 8 - head.length - tail.length;
  if (missing < 1) return null;
  return [...head, ...Array.from({ length: missing }, () => 0), ...tail];
}

// What one client is for rate limiting. An IPv6 customer gets a whole /64, so rotating the lower
// 64 bits costs an attacker nothing and must not buy a fresh bucket; IPv4 and IPv4-mapped IPv6
// (::ffff:a.b.c.d) count by the full IPv4 address. Anything unparseable shares one bucket.
export function rateLimitClientKey(address: string | undefined): string {
  const text = (address ?? '').trim().toLowerCase().split('%')[0] ?? '';
  const v4 = parseIpv4(text);
  if (v4 !== null) return v4.join('.');

  const groups = parseIpv6(text);
  if (groups === null) return UNKNOWN;
  const mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (mapped) {
    const [high = 0, low = 0] = groups.slice(6);
    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
  }
  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(':')}::/64`;
}
