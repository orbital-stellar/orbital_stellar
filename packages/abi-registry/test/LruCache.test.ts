import { describe, expect, it } from "vitest";
import { LruCache } from "../src/LruCache.js";

describe("LruCache", () => {
  it("returns undefined for a key that was never set", () => {
    const cache = new LruCache<string, number>(2);
    expect(cache.get("missing")).toBeUndefined();
    expect(cache.has("missing")).toBe(false);
  });

  it("stores and reads back values", () => {
    const cache = new LruCache<string, number>(2);
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
    expect(cache.has("a")).toBe(true);
    expect(cache.size).toBe(1);
  });

  it("distinguishes a stored undefined value from a missing key", () => {
    const cache = new LruCache<string, undefined>(2);
    cache.set("a", undefined);
    expect(cache.has("a")).toBe(true);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(1);
  });

  it("overwrites an existing key without growing", () => {
    const cache = new LruCache<string, number>(2);
    cache.set("a", 1);
    cache.set("a", 2);
    expect(cache.get("a")).toBe(2);
    expect(cache.size).toBe(1);
  });

  it("evicts the oldest entry once capacity is exceeded", () => {
    const cache = new LruCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.size).toBe(2);
    expect(cache.has("a")).toBe(false);
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
  });

  it("does not evict while at exactly capacity", () => {
    const cache = new LruCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.size).toBe(2);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(true);
  });

  it("refreshes recency on get so the read key survives eviction", () => {
    const cache = new LruCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.set("c", 3);
    expect(cache.has("b")).toBe(false);
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
  });

  it("refreshes recency on overwrite so the rewritten key survives eviction", () => {
    const cache = new LruCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 10);
    cache.set("c", 3);
    expect(cache.has("b")).toBe(false);
    expect(cache.get("a")).toBe(10);
  });

  it("does not refresh recency on has", () => {
    const cache = new LruCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.has("a");
    cache.set("c", 3);
    expect(cache.has("a")).toBe(false);
    expect(cache.has("b")).toBe(true);
  });

  it("a miss on get does not disturb the order", () => {
    const cache = new LruCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("nope");
    cache.set("c", 3);
    expect(cache.has("a")).toBe(false);
  });

  it("delete reports whether the key existed and frees a slot", () => {
    const cache = new LruCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.delete("a")).toBe(true);
    expect(cache.delete("a")).toBe(false);
    expect(cache.size).toBe(1);
    cache.set("c", 3);
    expect(cache.has("b")).toBe(true);
    expect(cache.has("c")).toBe(true);
  });

  it("clear empties the cache and it stays usable", () => {
    const cache = new LruCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeUndefined();
    cache.set("c", 3);
    expect(cache.get("c")).toBe(3);
  });

  it("with capacity 1 only the latest key is kept", () => {
    const cache = new LruCache<string, number>(1);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.size).toBe(1);
    expect(cache.has("a")).toBe(false);
    expect(cache.get("b")).toBe(2);
  });

  it("works with non-string keys by identity", () => {
    const cache = new LruCache<object, string>(2);
    const k1 = {};
    const k2 = {};
    cache.set(k1, "one");
    cache.set(k2, "two");
    expect(cache.get(k1)).toBe("one");
    expect(cache.get({})).toBeUndefined();
  });
});
