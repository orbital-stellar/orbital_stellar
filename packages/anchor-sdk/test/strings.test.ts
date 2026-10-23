import { describe, expect, it } from "vitest";
import { stripInlineComment, stripScheme, stripTrailingSlashes } from "../src/strings.js";

describe("stripTrailingSlashes", () => {
  it("returns the empty string unchanged", () => {
    expect(stripTrailingSlashes("")).toBe("");
  });

  it("leaves a value with no trailing slash alone", () => {
    expect(stripTrailingSlashes("https://anchor.example")).toBe("https://anchor.example");
  });

  it("removes a single trailing slash", () => {
    expect(stripTrailingSlashes("https://anchor.example/")).toBe("https://anchor.example");
  });

  it("removes repeated trailing slashes", () => {
    expect(stripTrailingSlashes("https://anchor.example///")).toBe("https://anchor.example");
  });

  it("keeps interior slashes", () => {
    expect(stripTrailingSlashes("https://anchor.example/a//b/")).toBe(
      "https://anchor.example/a//b",
    );
  });

  it("reduces an all-slash value to the empty string", () => {
    expect(stripTrailingSlashes("////")).toBe("");
  });

  it("handles a very long run of slashes in linear time", () => {
    const start = Date.now();
    expect(stripTrailingSlashes("a" + "/".repeat(200_000))).toBe("a");
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe("stripScheme", () => {
  it("returns the empty string unchanged", () => {
    expect(stripScheme("")).toBe("");
  });

  it("removes https://", () => {
    expect(stripScheme("https://anchor.example/path")).toBe("anchor.example/path");
  });

  it("removes http://", () => {
    expect(stripScheme("http://anchor.example")).toBe("anchor.example");
  });

  it("is case-insensitive and keeps the rest of the value's case", () => {
    expect(stripScheme("HTTPS://Anchor.Example")).toBe("Anchor.Example");
    expect(stripScheme("HtTp://Anchor.Example")).toBe("Anchor.Example");
  });

  it("leaves a scheme-less host alone", () => {
    expect(stripScheme("anchor.example")).toBe("anchor.example");
  });

  it("only strips a leading scheme, not one further in", () => {
    expect(stripScheme("anchor.example/?next=https://other.example")).toBe(
      "anchor.example/?next=https://other.example",
    );
  });

  it("does not strip other schemes", () => {
    expect(stripScheme("ftp://anchor.example")).toBe("ftp://anchor.example");
    expect(stripScheme("http:/anchor.example")).toBe("http:/anchor.example");
  });

  it("strips only one scheme", () => {
    expect(stripScheme("https://https://anchor.example")).toBe("https://anchor.example");
  });
});

describe("stripInlineComment", () => {
  it("returns the empty string unchanged", () => {
    expect(stripInlineComment("")).toBe("");
  });

  it("trims a value with no comment", () => {
    expect(stripInlineComment("  value  ")).toBe("value");
  });

  it("drops a comment that follows a space", () => {
    expect(stripInlineComment('"value" # note')).toBe('"value"');
  });

  it("drops a comment that follows a tab", () => {
    expect(stripInlineComment('"value"\t# note')).toBe('"value"');
  });

  it("keeps a # that is not preceded by whitespace", () => {
    expect(stripInlineComment('"abc#def"')).toBe('"abc#def"');
    expect(stripInlineComment("https://anchor.example/#frag")).toBe("https://anchor.example/#frag");
  });

  it("keeps a quoted # and still drops a real trailing comment", () => {
    expect(stripInlineComment('"a#b" # trailing')).toBe('"a#b"');
  });

  it("cuts at the first comment marker", () => {
    expect(stripInlineComment("one # two # three")).toBe("one");
  });

  it("does not treat a # at index 0 as a comment", () => {
    expect(stripInlineComment("#value")).toBe("#value");
  });

  it("returns an empty string when the comment follows only whitespace", () => {
    expect(stripInlineComment(" # only a comment")).toBe("");
  });

  it("handles a long run of whitespace in linear time", () => {
    const start = Date.now();
    expect(stripInlineComment("a" + " ".repeat(100_000) + "b")).toBe(
      "a" + " ".repeat(100_000) + "b",
    );
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
