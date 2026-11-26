import { describe, it, expect } from "vitest";
import { canonicalizeJson, CanonicalJsonError } from "../src/canonicalJson.js";

describe("canonicalizeJson", () => {
  it("sorts object members by UTF-16 code unit, recursively", () => {
    expect(canonicalizeJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("orders keys by UTF-16 code units, not code points", () => {
    // U+10000 is the surrogate pair D800 DC00, which sorts *before* U+FF5E.
    expect(canonicalizeJson({ "～": 1, "\u{10000}": 2 })).toBe('{"\u{10000}":2,"～":1}');
  });

  it("emits no insignificant whitespace and keeps array order", () => {
    expect(canonicalizeJson({ list: [3, 1, 2], nested: [{ z: 1, a: 2 }] })).toBe(
      '{"list":[3,1,2],"nested":[{"a":2,"z":1}]}',
    );
  });

  it("escapes only quote, backslash and control characters", () => {
    expect(canonicalizeJson('a"b\\c\n\t\u0001<>& \u007f')).toBe(
      '"a\\"b\\\\c\\n\\t\\u0001<>& \u007f"',
    );
  });

  it("writes integers and the JSON literals", () => {
    expect(canonicalizeJson([0, -0, 42, -7, 4294967295, true, false, null])).toBe(
      "[0,0,42,-7,4294967295,true,false,null]",
    );
  });

  it("treats an undefined object member as absent", () => {
    expect(canonicalizeJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("produces identical output regardless of insertion order", () => {
    expect(canonicalizeJson({ x: 1, y: [1, { q: 1, p: 2 }] })).toBe(
      canonicalizeJson({ y: [1, { p: 2, q: 1 }], x: 1 }),
    );
  });

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["a bigint", 1n],
    ["a symbol", Symbol("s")],
    ["a function", () => 1],
    ["top-level undefined", undefined],
    ["undefined in an array", [1, undefined]],
    ["a Date", new Date(0)],
    ["a Map", new Map()],
    ["a lone high surrogate", "\uD800"],
    ["a lone low surrogate", "\uDC00x"],
    ["an object key with a lone surrogate", { "\uD800": 1 }],
  ])("rejects %s", (_name, value) => {
    expect(() => canonicalizeJson(value)).toThrow(CanonicalJsonError);
  });

  it("accepts an object with a null prototype", () => {
    const o = Object.create(null) as Record<string, unknown>;
    o["k"] = 1;
    expect(canonicalizeJson(o)).toBe('{"k":1}');
  });

  it("rejects nesting deeper than the limit instead of overflowing the stack", () => {
    let v: unknown = 1;
    for (let i = 0; i < 200; i += 1) v = [v];
    expect(() => canonicalizeJson(v)).toThrow(/nesting deeper/);
  });

  it("names the path of the offending value", () => {
    expect(() => canonicalizeJson({ a: [{ b: Number.NaN }] })).toThrow("$.a[0].b");
  });
});
