import { describe, expect, it } from 'vitest';
import { rateLimitClientKey } from './client-key';

describe('rateLimitClientKey', () => {
  it('keys IPv4 by the full address', () => {
    expect(rateLimitClientKey('203.0.113.7')).toBe('203.0.113.7');
    expect(rateLimitClientKey('203.0.113.8')).not.toBe(rateLimitClientKey('203.0.113.7'));
  });

  it('keys IPv6 by its /64 whatever the lower bits or the notation', () => {
    const key = rateLimitClientKey('2001:db8:1:2::1');
    expect(rateLimitClientKey('2001:db8:1:2::19')).toBe(key);
    expect(rateLimitClientKey('2001:0DB8:0001:0002:ffff:ffff:ffff:ffff')).toBe(key);
    expect(rateLimitClientKey('2001:db8:1:2:0:0:0:1%eth0')).toBe(key);
    expect(rateLimitClientKey('2001:db8:1:3::1')).not.toBe(key);
  });

  it('expands compression inside the prefix', () => {
    expect(rateLimitClientKey('2001:db8::1')).toBe(rateLimitClientKey('2001:db8:0:0:5::9'));
    expect(rateLimitClientKey('::1')).toBe(rateLimitClientKey('0:0:0:0:0:0:0:1'));
  });

  it('maps IPv4-mapped IPv6 to the IPv4 key', () => {
    expect(rateLimitClientKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(rateLimitClientKey('::ffff:cb00:7107')).toBe('203.0.113.7');
    expect(rateLimitClientKey('0:0:0:0:0:ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it.each([[undefined], [''], ['not-an-ip'], ['1:2:3'], ['1::2::3'], ['2001:db8::g'], ['300.1.1.1'], ['1.2.3']])(
    'puts %j in the shared bucket',
    (value) => {
      expect(rateLimitClientKey(value)).toBe('unknown');
    }
  );
});
