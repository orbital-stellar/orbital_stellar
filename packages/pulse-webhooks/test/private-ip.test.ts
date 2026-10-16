import { describe, it, expect } from 'vitest';
import {
  isPrivateIpLiteral,
  isLoopbackHostname,
  normalizeHostname,
  isIpLiteral,
} from '../src/private-ip.js';

describe('normalizeHostname', () => {
  it('returns lowercased hostname', () => {
    expect(normalizeHostname('EXAMPLE.COMA')).toBe('example.com');
  });

  it('strips a single trailing dot', () => {
    expect(normalizeHostname('example.com.')).toBe('example.com');
  });

  it('strips trailing dot after lowercasing', () => {
    expect(normalizeHostname('EXAMPLE.COM.')).toBe('example.com');
  });

  it('strips brackets from IPv6 literals', () => {
    expect(normalizeHostname('[::1]')).toBe('::1');
  });

  it('strips brackets and lowercases', () => {
    expect(normalizeHostname('[2001:DB8::1]')).toBe('2001:db8::1');
  });

  it('strips brackets and trailing dot', () => {
    expect(normalizeHostname('[::1].')).toBe('::1');
  });

  it('trims whitespace', () => {
    expect(normalizeHostname('  Example.Com  ')).toBe('example.com');
  });

  it('returns an empty string for an empty hostname', () => {
    expect(normalizeHostname('')).toBe('');
  });

  it('returns an empty string for a loone trailing dot', () => {
    expect(normalizeHostname('.')).toBe('');
  });
});

describe('isIpLiteral', () => {
  it('accepts IPv4 addresses', () => {
    expect(isIpLiteral('127.0.0.1')).toBe(true);
    expect(isIpLiteral('192.168.1.1')).toBe(true);
    expect(isIpLiteral('255.255.255.255')).toBe(true);
  });

  it('accepts IPv6 addresses', () => {
    expect(isIpLiteral('::1')).toBe(true);
    expect(isIpLiteral('2001:db8::1')).toBe(true);
    expect(isIpLiteral('fe80::1')).toBe(true);
  });

  it('rejects hostnames', () => {
    expect(isIpLiteral('example.com')).toBe(false);
    expect(isIpLiteral('localhost')).toBe(false);
    expect(isIpLiteral(''),).toBe(false);
  });

  it('rejects out-of-range IPv4 octets', () => {
    expect(isIpLiteral('256.1.1.1')).toBe(false);
    expect(isIpLiteral('1.1.1.256')).toBe(false);
  });

  it('rejects bracketed IPv6 as a raw literal', () => {
    expect(isIpLiteral('[::1]')).toBe(false);
  });
});

describe('isPrivateIpLiteral', () => {
  it('accepts IPv4 private ranges', () => {
    expect(isPrivateIpLiteral('10.0.0.1')).toBe(true);
    expect(isPrivateIpLiteral('10.255.255.254')).toBe(true);
    expect(isPrivateIpLiteral('172.16.0.1')).toBe(true);
    expect(isPrivateIpLiteral('172.31.255.254')).toBe(true);
    expect(isPrivateIpLiteral('192.168.0.1')).toBe(true);
    expect(isPrivateIpLiteral('192.168.255.254')).toBe(true);
  });

  it('accepts IPv4 loopback', () => {
    expect(isPrivateIpLiteral('127.0.0.1')).toBe(true);
    expect(isPrivateIpLiteral('127.255.255.254')).toBe(true);
  });

  it('accepts IPv4 link-local', () => {
    expect(isPrivateIpLiteral('169.254.0.1')).toBe(true);
    expect(isPrivateIpLiteral('169.254.255.254')).toBe(true);
  });

  it('rejects public IPv4 addresses', () => {
    expect(isPrivateIpLiteral('8.8.8.8')).toBe(false);
    expect(isPrivateIpLiteral('1.1.1.1')).toBe(false);
    expect(isPrivateIpLiteral('172.15.0.1')).toBe(false);
    expect(isPrivateIpLiteral('172.32.0.1')).toBe(false);
    expect(isPrivateIpLiteral('192.167.0.1')).toBe(false);
    expect(isPrivateIpLiteral('192.169.0.1')).toBe(false);
  });

  it('accepts IPv6 loopback', () => {
    expect(isPrivateIpLiteral('::1')).toBe(true);
    expect(isPrivateIpLiteral('0000:0000:0000:0000:0000:0000:0000:0001')).toBe(true);
  });

  it('accepts IPv6 ULA addresses', () => {
    expect(isPrivateIpLiteral('fc00::1')).toBe(true);
    expect(isPrivateIpLiteral('fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff')).toBe(true);
  });

  it('accepts IPv6 link local addresses', () => {
    expect(isPrivateIpLiteral('fe80::1')).toBe(true);
    expect(isPrivateIpLiteral('febf:255.255.255.254')).toBe(true);
  });

  it('accepts IPv4-mapped IPv6 private addresses', () => {
    expect(isPrivateIpLiteral('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateIpLiteral('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateIpLiteral('::ffff:192.168.1.1')).toBe(true);
  });

  it('rejects IPv4-mapped IPv6 public addresses', () => {
    expect(isPrivateIpLiteral('::ffff:8.8.8.8')).toBe(false);
  });

  it('rejects public IPv6 addresses', () => {
    expect(isPrivateIpLiteral('2001:db8::1')).toBe(false);
    expect(isPrivateIpLiteral('2606:4700::8888')).toBe(false);
  });

  it('rejects hostnames and non-IP strings', () => {
    expect(isPrivateIpLiteral('localhost')).toBe(false);
    expect(isPrivateIpLiteral('example.com')).toBe(false);
    expect(isPrivateIpLiteral(''),).toBe(false);
  });
});

describe('isLoopbackHostname', () => {
  it('accepts localhost', () => {
    expect(isLoopbackHostname('localhost')).toBe(true);
  });

  it('accepts localhost with trailing dot', () => {
    expect(isLoopbackHostname('localhost.')).toBe(true);
  });

  it('accepts loopback hostnames under a domain', () => {
    expect(isLoopbackHostname('localhost.localdomain')).toBe(true);
    expect(isLoopbackHostname('foo.localhost')).toBe(true);
  });

  it('accepts IPv4 loopback literals', () => {
    expect(isLoopbackHostname('127.0.0.1')).toBe(true);
    expect(isLoopbackHostname('127.0.0.2')).toBe(true);
  });

  it('accepts IPv6 loopback literals', () => {
    expect(isLoopbackHostname('::1')).toBe(true);
    expect(isLoopbackHostname('[::1]')).toBe(true);
  });

  it('rejects other hostnames', () => {
    expect(isLoopbackHostname('example.com')).toBe(false);
    expect(isLoopbackHostname('192.168.1.1')).toBe(false);
    expect(isLoopbackHostname('notlocalhost')).toBe(false);
    expect(isLoopbackHostname('')).toBe(false);
  });
});
