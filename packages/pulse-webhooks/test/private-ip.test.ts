import { describe, it, expect } from "vitest";
import {
  isPrivateIpLiteral,
  isLoopbackHostname,
  normalizeHostname,
  isIpLiteral,
} from "../src/private-ip.js";

describe("isIpLiteral", () => {
  it("accepts IPv4 literals", () => {
    expect(isIpLiteral("127.0.0.1")).toBe(true);
    expect(isIpLiteral("10.0.0.1")).toBe(true);
    expect(isIpLiteral("192.168.1.1")).toBe(true);
    expect(isIpLiteral("0.0.0.0")).toBe(true);
    expect(isIpLiteral("255.255.255.255")).toBe(true);
  });

  it("accepts IPv6 literals", () => {
    expect(isIpLiteral("::1")).toBe(true);
    expect(isIpLiteral("::")).toBe(true);
    expect(isIpLiteral("fe80::1")).toBe(true);
    expect(isIpLiteral("fc00::1")).toBe(true);
    expect(isIpLiteral("2001:db8::1")).toBe(true);
  });

  it("accepts IPv4-mapped IPv6 literals", () => {
    expect(isIpLiteral("::ffff:127.0.0.1")).toBe(true);
    expect(isIpLiteral("::ffff:10.0.0.1")).toBe(true);
  });

  it("rejects non-IP hostnames", () => {
    expect(isIpLiteral("example.com")).toBe(false);
    expect(isIpLiteral("localhost")).toBe(false);
    expect(isIpLiteral("")).toBe(false);
    expect(isIpLiteral("999.999.999.999")).toBe(false);
    expect(isIpLiteral("not-an-ip")).toBe(false);
  });
});

describe("isPrivateIpLiteral", () => {
  it("detects IPv4 private ranges", () => {
    expect(isPrivateIpLiteral("10.0.0.1")).toBe(true);
    expect(isPrivateIpLiteral("10.255.255.255")).toBe(true);
    expect(isPrivateIpLiteral("172.16.0.1")).toBe(true);
    expect(isPrivateIpLiteral("172.31.255.255")).toBe(true);
    expect(isPrivateIpLiteral("192.168.0.1")).toBe(true);
    expect(isPrivateIpLiteral("192.168.255.255")).toBe(true);
  });

  it("detects IPv4 loopback", () => {
    expect(isPrivateIpLiteral("127.0.0.1")).toBe(true);
    expect(isPrivateIpLiteral("127.255.255.255")).toBe(true);
  });

  it("detects IPv4 link-local", () => {
    expect(isPrivateIpLiteral("169.254.0.1")).toBe(true);
    expect(isPrivateIpLiteral("169.254.255.255")).toBe(true);
  });

  it("detects IPv4 unspecified", () => {
    expect(isPrivateIpLiteral("0.0.0.0")).toBe(true);
  });

  it("rejects public IPv4", () => {
    expect(isPrivateIpLiteral("8.8.8.8")).toBe(false);
    expect(isPrivateIpLiteral("1.1.1.1")).toBe(false);
    expect(isPrivateIpLiteral("172.15.0.1")).toBe(false);
    expect(isPrivateIpLiteral("172.32.0.1")).toBe(false);
    expect(isPrivateIpLiteral("192.169.0.1")).toBe(false);
  });

  it("detects IPv6 loopback", () => {
    expect(isPrivateIpLiteral("::1")).toBe(true);
  });

  it("detects IPv6 unspecified", () => {
    expect(isPrivateIpLiteral("::")).toBe(true);
  });

  it("detects IPv6 ULA", () => {
    expect(isPrivateIpLiteral("fc00::1")).toBe(true);
    expect(isPrivateIpLiteral("fd00::1")).toBe(true);
    expect(isPrivateIpLiteral("fdff:ffff::1")).toBe(true);
  });

  it("detects IPv6 link-local", () => {
    expect(isPrivateIpLiteral("fe80::1")).toBe(true);
    expect(isPrivateIpLiteral("febf::1")).toBe(true);
  });

  it("detects IPv4-mapped IPv6 private addresses", () => {
    expect(isPrivateIpLiteral("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIpLiteral("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateIpLiteral("::ffff:192.168.1.1")).toBe(true);
  });

  it("rejects IPv4-mapped IPv6 public addresses", () => {
    expect(isPrivateIpLiteral("::ffff:8.8.8.8")).toBe(false);
  });

  it("rejects public IPv6", () => {
    expect(isPrivateIpLiteral("2001:db8::1")).toBe(false);
    expect(isPrivateIpLiteral("2606:4700::1111")).toBe(false);
  });

  it("detects 0.0.0.0/8 beyond the unspecified address", () => {
    expect(isPrivateIpLiteral("0.1.2.3")).toBe(true);
    expect(isPrivateIpLiteral("0.255.255.255")).toBe(true);
  });

  it("detects CGNAT 100.64.0.0/10 and only that slice of 100.x", () => {
    expect(isPrivateIpLiteral("100.64.0.1")).toBe(true);
    expect(isPrivateIpLiteral("100.127.255.255")).toBe(true);
    expect(isPrivateIpLiteral("100.63.255.255")).toBe(false);
    expect(isPrivateIpLiteral("100.128.0.1")).toBe(false);
  });

  it("detects 192.0.0.0/24 protocol assignments but not the rest of 192.0.x", () => {
    expect(isPrivateIpLiteral("192.0.0.1")).toBe(true);
    expect(isPrivateIpLiteral("192.0.2.1")).toBe(true);
    expect(isPrivateIpLiteral("192.1.0.1")).toBe(false);
  });

  it("detects multicast and reserved space from 224.0.0.0 up", () => {
    expect(isPrivateIpLiteral("224.0.0.1")).toBe(true);
    expect(isPrivateIpLiteral("239.255.255.255")).toBe(true);
    expect(isPrivateIpLiteral("255.255.255.255")).toBe(true);
    expect(isPrivateIpLiteral("223.255.255.255")).toBe(false);
  });

  it("detects hex-form IPv4-mapped IPv6 by re-checking the embedded address", () => {
    expect(isPrivateIpLiteral("::ffff:7f00:1")).toBe(true);
    expect(isPrivateIpLiteral("::ffff:a00:1")).toBe(true);
    expect(isPrivateIpLiteral("::ffff:808:808")).toBe(false);
  });

  it("detects IPv4-compatible IPv6 by re-checking the embedded address", () => {
    expect(isPrivateIpLiteral("::10.0.0.1")).toBe(true);
    expect(isPrivateIpLiteral("::8.8.8.8")).toBe(false);
  });

  it("does not match IPv6 addresses outside fc00::/7 and fe80::/10", () => {
    expect(isPrivateIpLiteral("fb00::1")).toBe(false);
    expect(isPrivateIpLiteral("fec0::1")).toBe(false);
  });

  it("only accepts bare addresses; bracketed IPv6 must be normalized first", () => {
    expect(isPrivateIpLiteral("[::1]")).toBe(false);
    expect(isPrivateIpLiteral(normalizeHostname("[::1]"))).toBe(true);
  });

  it("rejects non-IP strings", () => {
    expect(isPrivateIpLiteral("example.com")).toBe(false);
    expect(isPrivateIpLiteral("localhost")).toBe(false);
    expect(isPrivateIpLiteral("")).toBe(false);
  });
});

describe("isLoopbackHostname", () => {
  it("detects the bare localhost label", () => {
    expect(isLoopbackHostname("localhost")).toBe(true);
  });

  it("detects any .localhost name (RFC 6761)", () => {
    expect(isLoopbackHostname("app.localhost")).toBe(true);
    expect(isLoopbackHostname("a.b.localhost")).toBe(true);
  });

  it("is case-sensitive and does not strip a trailing dot; callers normalize first", () => {
    expect(isLoopbackHostname("LOCALHOST")).toBe(false);
    expect(isLoopbackHostname("localhost.")).toBe(false);
    expect(isLoopbackHostname(normalizeHostname("LOCALHOST"))).toBe(true);
  });

  it("does not treat IP literals as loopback hostnames; isPrivateIpLiteral covers those", () => {
    expect(isLoopbackHostname("127.0.0.1")).toBe(false);
    expect(isLoopbackHostname("::1")).toBe(false);
    expect(isLoopbackHostname("[::1]")).toBe(false);
  });

  it("rejects other names and look-alike suffixes", () => {
    expect(isLoopbackHostname("example.com")).toBe(false);
    expect(isLoopbackHostname("10.0.0.1")).toBe(false);
    expect(isLoopbackHostname("notlocalhost")).toBe(false);
    expect(isLoopbackHostname("localhost.example.com")).toBe(false);
    expect(isLoopbackHostname("")).toBe(false);
  });
});

describe("normalizeHostname", () => {
  it("lowercases hostnames", () => {
    expect(normalizeHostname("EXAMPLE.COM")).toBe("example.com");
  });

  it("strips brackets from IPv6 literals", () => {
    expect(normalizeHostname("[::1]")).toBe("::1");
    expect(normalizeHostname("[fe80::1]")).toBe("fe80::1");
    expect(normalizeHostname("[FE80::1]")).toBe("fe80::1");
  });

  it("leaves trailing dots alone", () => {
    expect(normalizeHostname("example.com.")).toBe("example.com.");
    expect(normalizeHostname("LOCALHOST.")).toBe("localhost.");
  });

  it("only strips brackets that wrap the whole value", () => {
    expect(normalizeHostname("[::1].")).toBe("::1].");
    expect(normalizeHostname("::1]")).toBe("::1");
    expect(normalizeHostname("[::1")).toBe("::1");
  });

  it("handles empty input", () => {
    expect(normalizeHostname("")).toBe("");
  });
});
