import { describe, expect, it } from "vitest";
import { xdr, Address, scValToNative } from "@stellar/stellar-sdk";
import { scvalToJs, jsToScval } from "../src/scval.js";

const ACCOUNT = "GAPMH4R4OLAAT4YSTPXUUEQYPPC3NB7P6A3W3YQIRIW33U3B4AW46HDY";
const CONTRACT = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";

const switchName = (val: xdr.ScVal) => val.switch().name;
const native = (val: xdr.ScVal) => scValToNative(val);
const errorArm = (val: xdr.ScVal) => (val.value() as xdr.ScError).switch().name;
const errorCode = (val: xdr.ScVal) => (val.value() as xdr.ScError).value().value;

describe("scvalToJs structural variants", () => {
  it("returns an ScVal unchanged when passed back to jsToScval", () => {
    const val = xdr.ScVal.scvU32(7);
    expect(jsToScval(val, "u32")).toBe(val);
    expect(jsToScval(val)).toBe(val);
  });

  it("annotates contract errors with the exact XDR union arm", () => {
    const js = scvalToJs(xdr.ScVal.scvError(xdr.ScError.sceContract(1234)));
    expect(js).toEqual({ type: "contract", code: 1234, errorType: "sceContract" });
  });

  it("annotates system errors with the exact XDR union arm", () => {
    const js = scvalToJs(
      xdr.ScVal.scvError(xdr.ScError.sceContext(xdr.ScErrorCode.scecIndexBounds())),
    );
    expect(js.errorType).toBe("sceContext");
    expect(js.type).toBe("system");
    expect(js.code).toBe(1);
    expect(js.value).toBe("scecIndexBounds");
  });

  it("decodes ledger key contract instance", () => {
    expect(scvalToJs(xdr.ScVal.scvLedgerKeyContractInstance())).toEqual({
      type: "ledgerKeyContractInstance",
    });
  });

  it("decodes ledger key nonce as a bigint", () => {
    const js = scvalToJs(
      xdr.ScVal.scvLedgerKeyNonce(new xdr.ScNonceKey({ nonce: new xdr.Int64(12345n) })),
    );
    expect(js).toEqual({ type: "ledgerKeyNonce", nonce: 12345n });
  });

  it("decodes a contract instance with a wasm hash and storage", () => {
    const wasmHash = Buffer.alloc(32, 0xab);
    const inst = new xdr.ScContractInstance({
      executable: xdr.ContractExecutable.contractExecutableWasm(wasmHash),
      storage: [
        new xdr.ScMapEntry({ key: xdr.ScVal.scvString("count"), val: xdr.ScVal.scvU32(3) }),
      ],
    });

    const js = scvalToJs(xdr.ScVal.scvContractInstance(inst));
    expect(js.type).toBe("contractInstance");
    expect(js.executable).toBe("contractExecutableWasm");
    expect(js.wasmHash).toBe(wasmHash.toString("hex"));
    expect(js.storage).toEqual({ count: 3 });
  });

  it("decodes a stellar-asset contract instance without a wasm hash", () => {
    const inst = new xdr.ScContractInstance({
      executable: xdr.ContractExecutable.contractExecutableStellarAsset(),
      storage: null,
    });

    const js = scvalToJs(xdr.ScVal.scvContractInstance(inst));
    expect(js.executable).toBe("contractExecutableStellarAsset");
    expect(js.wasmHash).toBeUndefined();
    expect(js.storage).toBeNull();
  });

  it("falls through to the native decoder for ordinary values", () => {
    expect(scvalToJs(xdr.ScVal.scvString("hi"))).toBe("hi");
    expect(scvalToJs(xdr.ScVal.scvU32(9))).toBe(9);
    expect(scvalToJs(xdr.ScVal.scvVoid())).toBeNull();
    expect(native(xdr.ScVal.scvBytes(Buffer.from([1, 2])))).toEqual(Buffer.from([1, 2]));
  });
});

describe("jsToScval bytes handling", () => {
  it("accepts a Buffer", () => {
    expect(native(jsToScval(Buffer.from([1, 2, 3]), "bytes"))).toEqual(Buffer.from([1, 2, 3]));
  });

  it("accepts a Uint8Array", () => {
    const val = jsToScval(new Uint8Array([4, 5]), "bytes");
    expect(native(val)).toEqual(Buffer.from([4, 5]));
  });

  it("decodes even-length hex strings as hex", () => {
    expect(native(jsToScval("0a0b", "bytes"))).toEqual(Buffer.from([10, 11]));
  });

  it("treats an empty string as empty bytes", () => {
    expect(native(jsToScval("", "bytes"))).toEqual(Buffer.alloc(0));
  });

  it("falls back to utf-8 when the string is not hex", () => {
    expect(native(jsToScval("hi", "bytes"))).toEqual(Buffer.from("hi", "utf-8"));
  });

  it("falls back to utf-8 for odd-length hex-looking strings", () => {
    expect(native(jsToScval("abc", "bytes"))).toEqual(Buffer.from("abc", "utf-8"));
  });

  it("accepts an array of byte values", () => {
    expect(native(jsToScval([1, 2, 255], "bytes"))).toEqual(Buffer.from([1, 2, 255]));
  });

  it("rejects unsupported byte values", () => {
    expect(() => jsToScval(5, "bytes")).toThrow(/Unsupported bytes value/);
  });
});

describe("jsToScval address handling", () => {
  it("accepts an xdr.ScAddress", () => {
    const scAddress = Address.fromString(CONTRACT).toScAddress();
    const val = jsToScval(scAddress, "address");
    expect(switchName(val)).toBe("scvAddress");
    expect(native(val)).toBe(CONTRACT);
  });

  it("accepts a Stellar Address for both account and contract ids", () => {
    const account = jsToScval(Address.fromString(ACCOUNT), "address");
    expect(switchName(account)).toBe("scvAddress");
    expect(native(account)).toBe(ACCOUNT);

    const contract = jsToScval(Address.fromString(CONTRACT), "address");
    expect(switchName(contract)).toBe("scvAddress");
    expect(native(contract)).toBe(CONTRACT);
  });

  it("accepts a strkey string", () => {
    expect(native(jsToScval(CONTRACT, "address"))).toBe(CONTRACT);
  });

  it("rejects unsupported address values", () => {
    expect(() => jsToScval(42, "address")).toThrow(/Unsupported address value/);
  });
});

describe("jsToScval error handling", () => {
  it("builds a contract error from an explicit errorType and numeric code", () => {
    const val = jsToScval({ errorType: "sceContract", code: 77 }, "error");
    expect(switchName(val)).toBe("scvError");
    expect(native(val)).toEqual({ type: "contract", code: 77 });
  });

  it("defaults to sceContract when type is contract", () => {
    expect(native(jsToScval({ type: "contract", code: 5 }, "error"))).toEqual({
      type: "contract",
      code: 5,
    });
  });

  it("defaults to sceWasmVm for other object shapes", () => {
    const val = jsToScval({ type: "system", code: 2 }, "error");
    expect(errorArm(val)).toBe("sceWasmVm");
    expect(errorCode(val)).toBe(2);
  });

  it("resolves a system error from the code name when code is not a number", () => {
    const val = jsToScval({ errorType: "sceWasmVm", value: "scecIndexBounds" }, "error");
    expect(errorArm(val)).toBe("sceWasmVm");
    expect(errorCode(val)).toBe(1);
  });

  it("looks up the numeric error code from the enum when no value is given", () => {
    const val = jsToScval({ errorType: "sceContext", code: 1 }, "error");
    expect(errorArm(val)).toBe("sceContext");
    expect(errorCode(val)).toBe(1);
  });

  it("falls back to scecArithDomain for unknown numeric codes", () => {
    const val = jsToScval({ errorType: "sceContext", code: 9999 }, "error");
    expect(errorArm(val)).toBe("sceContext");
    expect(errorCode(val)).toBe(0);
  });

  it("falls back to scecArithDomain when neither code nor value is present", () => {
    const val = jsToScval({ errorType: "sceStorage" }, "error");
    expect(errorArm(val)).toBe("sceStorage");
    expect(errorCode(val)).toBe(0);
  });

  it("rejects non-object error values", () => {
    expect(() => jsToScval("boom", "error")).toThrow(/Unsupported error value/);
    expect(() => jsToScval(null, "error")).toThrow(/Unsupported error value/);
  });

  it("round-trips every system error arm", () => {
    const arms = [
      "sceWasmVm",
      "sceContext",
      "sceStorage",
      "sceObject",
      "sceCrypto",
      "sceEvents",
      "sceBudget",
      "sceValue",
      "sceAuth",
    ] as const;

    for (const arm of arms) {
      const original = (xdr.ScError as any)[arm](xdr.ScErrorCode.scecIndexBounds());
      const roundTripped = jsToScval(scvalToJs(xdr.ScVal.scvError(original)), "error");
      expect(roundTripped.toXDR().equals(xdr.ScVal.scvError(original).toXDR())).toBe(true);
    }
  });
});

describe("jsToScval collection handling", () => {
  it("rejects non-array vec values", () => {
    expect(() => jsToScval("nope", "vec<u32>")).toThrow(/must be an array for vec type/);
  });

  it("builds an empty vec", () => {
    expect(native(jsToScval([], "vec<u32>"))).toEqual([]);
  });

  it("applies the element spec to every vec member", () => {
    const val = jsToScval(["a", "b"], "vec<symbol>");
    expect(native(val)).toEqual(["a", "b"]);
    expect(val.value().every((v: xdr.ScVal) => switchName(v) === "scvSymbol")).toBe(true);
  });

  it("accepts a Map instance", () => {
    const val = jsToScval(
      new Map<string, number>([
        ["a", 1],
        ["b", 2],
      ]),
      "map<string, u32>",
    );
    expect(native(val)).toEqual({ a: 1, b: 2 });
  });

  it("accepts an array of key/value pairs", () => {
    const val = jsToScval([["a", 1]], "map<string, u32>");
    expect(native(val)).toEqual({ a: 1 });
  });

  it("accepts an array of { key, val } objects", () => {
    const val = jsToScval([{ key: "a", val: 1 }], "map<string, u32>");
    expect(native(val)).toEqual({ a: 1 });
  });

  it("accepts a plain object", () => {
    const val = jsToScval({ a: 1 }, "map<string, u32>");
    expect(native(val)).toEqual({ a: 1 });
  });

  it("builds an empty map", () => {
    expect(native(jsToScval(new Map(), "map"))).toEqual({});
  });

  it("rejects arrays that are neither pairs nor { key, val } objects", () => {
    expect(() => jsToScval([1, 2, 3], "map")).toThrow(/Invalid array format for map type/);
  });

  it("rejects scalar map values", () => {
    expect(() => jsToScval(7, "map")).toThrow(/must be a Map, Object, or Array of entries/);
  });

  it("rejects non-array tuples", () => {
    expect(() => jsToScval({ nope: true }, "tuple")).toThrow(/must be an array for tuple type/);
  });

  it("infers tuple elements when no per-element spec is available", () => {
    expect(native(jsToScval([1, "two"], "tuple"))).toEqual([1, "two"]);
  });

  it("applies per-element specs from an ScSpecTypeTuple", () => {
    const tupleSpec = new xdr.ScSpecTypeTuple({
      values: [xdr.ScSpecTypeDef.scSpecTypeU32(), xdr.ScSpecTypeDef.scSpecTypeString()],
    });
    const typeDef = xdr.ScSpecTypeDef.scSpecTypeTuple(tupleSpec);
    const val = jsToScval([1, "two"], typeDef);
    expect(switchName(val.value()[0])).toBe("scvU32");
    expect(switchName(val.value()[1])).toBe("scvString");
  });

  it("leaves generic strings other than vec<> and map<> to inference", () => {
    // resolveSpec only parses vec<> and map<> out of string specs, so a
    // "tuple<...>" string is not a recognised type and inference takes over.
    expect(native(jsToScval([1, "two"], "tuple<u32, string>"))).toEqual([1, "two"]);
  });

  it("maps a null option to void", () => {
    expect(switchName(jsToScval(null, "option<i32>"))).toBe("scvVoid");
    expect(switchName(jsToScval(undefined, "option<i32>"))).toBe("scvVoid");
  });

  it("unwraps the option type def for a present value", () => {
    const optionSpec = new xdr.ScSpecTypeOption({ typeDef: xdr.ScSpecTypeDef.scSpecTypeU32() });
    const typeDef = xdr.ScSpecTypeDef.scSpecTypeOption(optionSpec);
    expect(native(jsToScval(5, typeDef))).toBe(5);
    expect(switchName(jsToScval(5, typeDef))).toBe("scvU32");
  });

  it("wraps result errors", () => {
    const resultSpec = new xdr.ScSpecTypeResult({
      ok: xdr.ScSpecTypeDef.scSpecTypeU32(),
      error: 0 as any,
    });
    const typeDef = xdr.ScSpecTypeDef.scSpecTypeResult(resultSpec);

    expect(switchName(jsToScval(new Error("boom"), typeDef))).toBe("scvError");
    expect(switchName(jsToScval({ type: "error" }, typeDef))).toBe("scvError");
  });

  it("uses the ok type def for result values", () => {
    const resultSpec = new xdr.ScSpecTypeResult({
      ok: xdr.ScSpecTypeDef.scSpecTypeU32(),
      error: 0 as any,
    });
    const typeDef = xdr.ScSpecTypeDef.scSpecTypeResult(resultSpec);
    const val = jsToScval(9, typeDef);
    expect(switchName(val)).toBe("scvU32");
    expect(native(val)).toBe(9);
  });
});

describe("jsToScval inference without a spec", () => {
  it("maps null and undefined to void", () => {
    expect(switchName(jsToScval(null))).toBe("scvVoid");
    expect(switchName(jsToScval(undefined))).toBe("scvVoid");
  });

  it("maps booleans to bool", () => {
    expect(native(jsToScval(true))).toBe(true);
    expect(native(jsToScval(false))).toBe(false);
  });

  it("maps integers and fractions to i32", () => {
    expect(switchName(jsToScval(42))).toBe("scvI32");
    expect(native(jsToScval(42))).toBe(42);
    expect(native(jsToScval(1.9))).toBe(1);
  });

  it("delegates bigints to nativeToScVal", () => {
    expect(switchName(jsToScval(7n))).toBe("scvU64");
    expect(switchName(jsToScval(-7n))).toBe("scvI64");
  });

  it("infers addresses from valid 56-character strkeys", () => {
    expect(native(jsToScval(ACCOUNT))).toBe(ACCOUNT);
    expect(native(jsToScval(CONTRACT))).toBe(CONTRACT);
  });

  it("keeps invalid or short strkey-like strings as strings", () => {
    const invalid = `G${"A".repeat(55)}`;
    expect(invalid).toHaveLength(56);
    expect(native(jsToScval(invalid))).toBe(invalid);
    expect(native(jsToScval("hi"))).toBe("hi");
  });

  it("infers bytes from buffers and typed arrays", () => {
    expect(native(jsToScval(Buffer.from([7, 8])))).toEqual(Buffer.from([7, 8]));
    expect(native(jsToScval(new Uint8Array([9])))).toEqual(Buffer.from([9]));
  });

  it("infers vec from arrays", () => {
    expect(native(jsToScval([1, "two"]))).toEqual([1, "two"]);
  });

  it("infers map from Map instances and plain objects", () => {
    expect(native(jsToScval(new Map([["a", 1]])))).toEqual({ a: 1 });
    expect(native(jsToScval({ a: 1 }))).toEqual({ a: 1 });
  });

  it("restores preserved error shapes", () => {
    expect(switchName(jsToScval({ type: "contract", code: 3 }))).toBe("scvError");
    expect(switchName(jsToScval({ type: "system", code: 3 }))).toBe("scvError");
  });

  it("restores ledger key and contract instance shapes", () => {
    expect(switchName(jsToScval({ type: "ledgerKeyContractInstance" }))).toBe(
      "scvLedgerKeyContractInstance",
    );
    expect(switchName(jsToScval({ type: "ledgerKeyNonce", nonce: 5n }))).toBe("scvLedgerKeyNonce");
    expect(
      switchName(
        jsToScval({ type: "contractInstance", executable: "contractExecutableStellarAsset" }),
      ),
    ).toBe("scvContractInstance");
  });

  it("rejects values it cannot infer", () => {
    expect(() => jsToScval(() => undefined)).toThrow(/Unable to infer ScVal for value/);
    // A symbol never reaches the throw: interpolating it into the message
    // raises a TypeError first.
    expect(() => jsToScval(Symbol("s"))).toThrow(TypeError);
  });
});

describe("jsToScval contract instance and nonce specs", () => {
  it("rejects non-object contract instances", () => {
    expect(() => jsToScval("nope", "contractinstance")).toThrow(
      /Unsupported contract instance value/,
    );
  });

  it("treats any non-wasm executable as a stellar asset", () => {
    const val = jsToScval({ executable: "unknownExecutable" }, "contractinstance");
    expect(val.value().executable().switch().name).toBe("contractExecutableStellarAsset");
    expect(val.value().storage()).toBeNull();
  });

  it("accepts a bare nonce value", () => {
    const val = jsToScval(1234, "ledgerkeynonce");
    expect(val.value()._attributes.nonce.toString()).toBe("1234");
  });

  it("omits storage when it is falsy", () => {
    const val = jsToScval(
      { executable: "contractExecutableStellarAsset", storage: undefined },
      "contractinstance",
    );
    expect(val.value().storage()).toBeNull();
  });
});

describe("jsToScval spec resolution", () => {
  it("parses generic type strings with surrounding whitespace and case", () => {
    expect(switchName(jsToScval(1, "  STRING  "))).toBe("scvString");
    expect(native(jsToScval({ a: 1 }, "  MAP<String, U32>  "))).toEqual({ a: 1 });
  });

  it("parses vec<> specs regardless of case", () => {
    expect(switchName(jsToScval([], "VEC<u32>"))).toBe("scvVec");
  });

  it("parses map<> specs and tolerates a missing key or value", () => {
    expect(native(jsToScval({ a: 1 }, "map<string, u32>"))).toEqual({ a: 1 });
    // "map<>" yields empty key and value specs, which resolve back to inference.
    expect(native(jsToScval({ a: 1 }, "map<>"))).toEqual({ a: 1 });
    // "map<u32>" applies u32 to keys and leaves values to inference.
    const val = jsToScval({ a: 1 }, "map<u32>");
    expect(switchName(val.value()[0].key())).toBe("scvU32");
    expect(switchName(val.value()[0].val())).toBe("scvI32");
  });

  it("accepts a plain object spec with a type field", () => {
    const val = jsToScval("x", { type: "SYMBOL" });
    expect(switchName(val)).toBe("scvSymbol");
    expect(native(val)).toBe("x");
  });

  it("falls back to inference for unusable specs", () => {
    expect(switchName(jsToScval(5, {}))).toBe("scvI32");
    expect(switchName(jsToScval(5, 7 as any))).toBe("scvI32");
  });

  it("maps every scalar ScSpecTypeDef arm", () => {
    const cases: Array<[xdr.ScSpecTypeDef, any, string]> = [
      [xdr.ScSpecTypeDef.scSpecTypeBool(), 1, "scvBool"],
      [xdr.ScSpecTypeDef.scSpecTypeVoid(), 1, "scvVoid"],
      [xdr.ScSpecTypeDef.scSpecTypeU32(), 1, "scvU32"],
      [xdr.ScSpecTypeDef.scSpecTypeI32(), 1, "scvI32"],
      [xdr.ScSpecTypeDef.scSpecTypeU64(), 1, "scvU64"],
      [xdr.ScSpecTypeDef.scSpecTypeI64(), 1, "scvI64"],
      [xdr.ScSpecTypeDef.scSpecTypeTimepoint(), 1, "scvTimepoint"],
      [xdr.ScSpecTypeDef.scSpecTypeDuration(), 1, "scvDuration"],
      [xdr.ScSpecTypeDef.scSpecTypeU128(), 1, "scvU128"],
      [xdr.ScSpecTypeDef.scSpecTypeI128(), 1, "scvI128"],
      [xdr.ScSpecTypeDef.scSpecTypeU256(), 1, "scvU256"],
      [xdr.ScSpecTypeDef.scSpecTypeI256(), 1, "scvI256"],
      [xdr.ScSpecTypeDef.scSpecTypeBytes(), [1], "scvBytes"],
      [xdr.ScSpecTypeDef.scSpecTypeString(), "s", "scvString"],
      [xdr.ScSpecTypeDef.scSpecTypeSymbol(), "s", "scvSymbol"],
      [xdr.ScSpecTypeDef.scSpecTypeAddress(), CONTRACT, "scvAddress"],
      [xdr.ScSpecTypeDef.scSpecTypeMuxedAddress(), CONTRACT, "scvAddress"],
      [xdr.ScSpecTypeDef.scSpecTypeError(), { type: "contract", code: 1 }, "scvError"],
    ];

    for (const [typeDef, value, expected] of cases) {
      expect(switchName(jsToScval(value, typeDef)), typeDef.switch().name).toBe(expected);
    }
  });

  it("maps the val arm back to inference", () => {
    expect(switchName(jsToScval(5, xdr.ScSpecTypeDef.scSpecTypeVal()))).toBe("scvI32");
  });

  it("maps bytesN to the bytes handling", () => {
    const bytesN = new xdr.ScSpecTypeBytesN({ n: 4 });
    const typeDef = xdr.ScSpecTypeDef.scSpecTypeBytesN(bytesN);
    const val = jsToScval([1, 2, 3, 4], typeDef);
    expect(native(val)).toEqual(Buffer.from([1, 2, 3, 4]));
  });

  it("maps the vec arm to the vec handling", () => {
    const vecSpec = new xdr.ScSpecTypeVec({ element: xdr.ScSpecTypeDef.scSpecTypeU32() });
    const typeDef = xdr.ScSpecTypeDef.scSpecTypeVec(vecSpec);
    const val = jsToScval([1, 2], typeDef);
    expect(native(val)).toEqual([1, 2]);
    expect(switchName(val.value()[0])).toBe("scvU32");
  });

  it("maps the map arm to the map handling", () => {
    const mapSpec = new xdr.ScSpecTypeMap({
      key: xdr.ScSpecTypeDef.scSpecTypeSymbol(),
      value: xdr.ScSpecTypeDef.scSpecTypeU32(),
    });
    const typeDef = xdr.ScSpecTypeDef.scSpecTypeMap(mapSpec);
    const val = jsToScval([["a", 1]], typeDef);
    expect(val.value()[0].key().switch().name).toBe("scvSymbol");
    expect(val.value()[0].val().switch().name).toBe("scvU32");
  });

  it("falls back to inference for the unresolved udt arm", () => {
    const udtSpec = new xdr.ScSpecTypeUdt({ name: "MyType" });
    const typeDef = xdr.ScSpecTypeDef.scSpecTypeUdt(udtSpec);
    expect(switchName(jsToScval(3, typeDef))).toBe("scvI32");
  });
});

describe("128-bit and 256-bit conversion boundaries", () => {
  it("round-trips the maximum u128", () => {
    const max = 2n ** 128n - 1n;
    const val = jsToScval(max, "u128");
    expect(native(val)).toBe(max);
  });

  it("round-trips the minimum i128", () => {
    const min = -(2n ** 127n);
    const val = jsToScval(min, "i128");
    expect(native(val)).toBe(min);
  });

  it("round-trips the maximum u256", () => {
    const max = 2n ** 256n - 1n;
    const val = jsToScval(max, "u256");
    expect(native(val)).toBe(max);
  });

  it("round-trips the i256 boundaries", () => {
    const min = -(2n ** 255n);
    const max = 2n ** 255n - 1n;
    expect(native(jsToScval(min, "i256"))).toBe(min);
    expect(native(jsToScval(max, "i256"))).toBe(max);
  });

  it("accepts string and bigint inputs for wide integers", () => {
    expect(native(jsToScval("123456789012345678901234567890", "u128"))).toBe(
      123456789012345678901234567890n,
    );
  });

  it("rejects negative values for unsigned wide integers", () => {
    expect(() => jsToScval(-1n, "u128")).toThrow(/Cannot represent negative value as u128/);
    expect(() => jsToScval(-1n, "u256")).toThrow(/Cannot represent negative value as u256/);
  });
});
