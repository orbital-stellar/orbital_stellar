import { describe, it, expect } from "vitest";
import { Account, Address, MuxedAccount, StrKey, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import {
  decodeTopicScVal,
  decodeAddressTopic,
  decodeI128,
  decodeBool,
  decodeSymbolTopic,
  decodeStringTopic,
  decodeEventValueScVal,
  decodeSingleAddressAssetEvent,
} from "../src/cap67/scval.js";

// Same real addresses as test/decodeMintBurnClawback.test.ts, so checksums pass.
const ASSET = "CAP67:GASDKEGVDZFF423H4MX27UHZUX35PBQBJBZTGCS7IVNVKG2LQTVVO7R7";
const ALICE = "GAVGVP6NG2YE3XCUZLJ6XTC3MF6SBSX7GSN4RELD4JIIKEP2YK3C3WLF";
const BOB = "GD6USNRQFJHMFL3KY56F6BKG4N2EXVCQLTXAQ3NGJUVNZ5T3K4XZU4IX";
const MUXED = new MuxedAccount(new Account(BOB, "0"), "42").accountId();
const CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 1));

// 3 bytes: too short for an ScVal discriminant, so fromXDR always throws.
const BAD_XDR = "AAAA";

const makeError = (reason: string) => new Error(reason);
const b64 = (v: xdr.ScVal) => v.toXDR("base64");
const sym = (s: string) => b64(xdr.ScVal.scvSymbol(s));
const str = (s: string) => b64(xdr.ScVal.scvString(s));
const addr = (a: string) => b64(Address.fromString(a).toScVal());
const u32 = (n: number) => xdr.ScVal.scvU32(n);
const i128 = (n: bigint) => nativeToScVal(n, { type: "i128" });
const event = (topic: string[], value: unknown) => ({ topic, value }) as never;

function buildUnrecognizedAddressScVal(): xdr.ScVal | undefined {
  try {
    const lp = StrKey.encodeLiquidityPool(Buffer.alloc(32, 7));
    return Address.fromString(lp).toScVal();
  } catch {
    return undefined;
  }
}
const UNRECOGNIZED = buildUnrecognizedAddressScVal();

describe("decodeTopicScVal", () => {
  it("returns the ScVal for valid base64 XDR", () => {
    const out = decodeTopicScVal(sym("mint"), 0, makeError);
    expect(out.switch()).toBe(xdr.ScValType.scvSymbol());
    expect(out.sym().toString()).toBe("mint");
  });

  it("throws malformed topic[<index>] XDR for bad input", () => {
    expect(() => decodeTopicScVal(BAD_XDR, 3, makeError)).toThrow(/malformed topic\[3\] XDR/);
  });
});

describe("decodeAddressTopic", () => {
  it("returns a G account address", () => {
    const sv = Address.fromString(ALICE).toScVal();
    expect(decodeAddressTopic(sv, 1, makeError)).toBe(ALICE);
  });

  it("returns an M muxed address", () => {
    const sv = Address.fromString(MUXED).toScVal();
    expect(decodeAddressTopic(sv, 1, makeError)).toBe(MUXED);
  });

  it("returns a C contract address", () => {
    const sv = Address.fromString(CONTRACT).toScVal();
    expect(decodeAddressTopic(sv, 1, makeError)).toBe(CONTRACT);
  });

  it("throws for a non-address ScVal", () => {
    expect(() => decodeAddressTopic(u32(1), 1, makeError)).toThrow(
      /topic\[1\] is not a valid address/,
    );
  });

  it.runIf(UNRECOGNIZED !== undefined)("throws for an address that is not G, M or C", () => {
    expect(() => decodeAddressTopic(UNRECOGNIZED as xdr.ScVal, 1, makeError)).toThrow(
      /topic\[1\] address ".*" has an unrecognized form/,
    );
  });
});

describe("decodeI128", () => {
  it("returns a bigint for positive, negative and > 2^64 values", () => {
    expect(decodeI128(i128(123n), "amount", makeError)).toBe(123n);
    expect(decodeI128(i128(-5n), "amount", makeError)).toBe(-5n);
    const big = 2n ** 64n + 7n;
    expect(decodeI128(i128(big), "amount", makeError)).toBe(big);
  });

  it("throws for any other type", () => {
    expect(() => decodeI128(u32(1), "amount", makeError)).toThrow(
      /expected amount to be an i128, got scvU32/,
    );
  });
});

describe("decodeBool", () => {
  it("returns true and false for bool ScVals", () => {
    expect(decodeBool(xdr.ScVal.scvBool(true), "flag", makeError)).toBe(true);
    expect(decodeBool(xdr.ScVal.scvBool(false), "flag", makeError)).toBe(false);
  });

  it("throws for anything else", () => {
    expect(() => decodeBool(u32(1), "flag", makeError)).toThrow(
      /expected flag to be a bool, got scvU32/,
    );
  });
});

describe("decodeSymbolTopic", () => {
  it("passes when the symbol matches", () => {
    expect(() => decodeSymbolTopic(sym("mint"), 0, "mint", makeError)).not.toThrow();
  });

  it("throws when the symbol does not match", () => {
    expect(() => decodeSymbolTopic(sym("burn"), 0, "mint", makeError)).toThrow(
      /expected topic\[0\] to be "mint", got "burn"/,
    );
  });
});

describe("decodeStringTopic", () => {
  it("returns the string", () => {
    expect(decodeStringTopic(str(ASSET), 2, makeError)).toBe(ASSET);
  });

  it("also accepts a scvSymbol, which decodes to a string", () => {
    expect(decodeStringTopic(sym("native"), 2, makeError)).toBe("native");
  });

  it("throws for a non-string ScVal such as scvU32", () => {
    expect(() => decodeStringTopic(b64(u32(9)), 2, makeError)).toThrow(
      /expected topic\[2\] to be a string, got number/,
    );
  });
});

describe("decodeEventValueScVal", () => {
  it("returns the ScVal for a valid value", () => {
    const out = decodeEventValueScVal({ value: b64(i128(10n)) }, makeError);
    expect(out.switch()).toBe(xdr.ScValType.scvI128());
  });

  it("throws when value is not a string", () => {
    expect(() => decodeEventValueScVal(event([], 42), makeError)).toThrow(
      /expected event value to be a base64 XDR string/,
    );
  });

  it("throws malformed value XDR for bad base64", () => {
    expect(() => decodeEventValueScVal({ value: BAD_XDR }, makeError)).toThrow(
      /malformed value XDR/,
    );
  });
});

describe("decodeSingleAddressAssetEvent", () => {
  const topics = [sym("mint"), addr(ALICE), str(ASSET)];

  it("returns { address, asset, amount } for a valid event", () => {
    const ev = event(topics, b64(i128(10_000_000_000n)));
    expect(decodeSingleAddressAssetEvent(ev, "mint", makeError)).toEqual({
      address: ALICE,
      asset: ASSET,
      amount: 10_000_000_000n,
    });
  });

  it("throws on the wrong topic count", () => {
    const ev = event(topics.slice(0, 2), b64(i128(1n)));
    expect(() => decodeSingleAddressAssetEvent(ev, "mint", makeError)).toThrow(
      /expected 3 topics, got 2/,
    );
  });

  it("throws on the wrong symbol", () => {
    const ev = event(topics, b64(i128(1n)));
    expect(() => decodeSingleAddressAssetEvent(ev, "burn", makeError)).toThrow(
      /expected topic\[0\] to be "burn", got "mint"/,
    );
  });

  it("throws on a non-string asset topic", () => {
    const ev = event([sym("mint"), addr(ALICE), b64(u32(1))], b64(i128(1n)));
    expect(() => decodeSingleAddressAssetEvent(ev, "mint", makeError)).toThrow(
      /expected topic\[2\] asset to be a string/,
    );
  });

  it("throws on a non-string value", () => {
    const ev = event(topics, undefined);
    expect(() => decodeSingleAddressAssetEvent(ev, "mint", makeError)).toThrow(
      /expected event value to be a base64 XDR string/,
    );
  });

  it("throws on malformed value XDR", () => {
    const ev = event(topics, BAD_XDR);
    expect(() => decodeSingleAddressAssetEvent(ev, "mint", makeError)).toThrow(
      /malformed value XDR/,
    );
  });

  it("throws on a non-i128 value", () => {
    const ev = event(topics, b64(u32(1)));
    expect(() => decodeSingleAddressAssetEvent(ev, "mint", makeError)).toThrow(
      /expected mint value to be an i128, got scvU32/,
    );
  });
});
