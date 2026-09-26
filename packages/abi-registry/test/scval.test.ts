import { describe, expect, it } from "vitest";
import { xdr, Address } from "@stellar/stellar-sdk";
import { scvalToJs, jsToScval } from "../src/scval.js";

describe("Soroban ScVal typed helpers", () => {
  // Helper to assert perfect XDR round-tripping
  function assertRoundTrip(original: xdr.ScVal, spec?: any, checkInference = true) {
    const jsVal = scvalToJs(original);
    const roundTripped = jsToScval(jsVal, spec);

    expect(
      roundTripped.toXDR().equals(original.toXDR()),
      `Failed round-trip with spec for ${original.switch().name}`,
    ).toBe(true);

    if (checkInference) {
      const inferred = jsToScval(jsVal);
      expect(
        inferred.toXDR().equals(original.toXDR()),
        `Failed round-trip with inferred spec for ${original.switch().name}`,
      ).toBe(true);
    }
  }

  describe("Primitives & Numeric Types", () => {
    it("handles Void", () => {
      const original = xdr.ScVal.scvVoid();
      assertRoundTrip(original, "void");
    });

    it("handles Bool", () => {
      assertRoundTrip(xdr.ScVal.scvBool(true), "bool");
      assertRoundTrip(xdr.ScVal.scvBool(false), "bool");
    });

    it("handles U32", () => {
      assertRoundTrip(xdr.ScVal.scvU32(0), "u32", false);
      assertRoundTrip(xdr.ScVal.scvU32(4294967295), "u32", false);
    });

    it("handles I32", () => {
      assertRoundTrip(xdr.ScVal.scvI32(0), "i32");
      assertRoundTrip(xdr.ScVal.scvI32(-2147483648), "i32");
      assertRoundTrip(xdr.ScVal.scvI32(2147483647), "i32");
    });

    it("handles U64", () => {
      assertRoundTrip(xdr.ScVal.scvU64(new xdr.Uint64(0n)), "u64");
      assertRoundTrip(xdr.ScVal.scvU64(new xdr.Uint64(18446744073709551615n)), "u64");
    });

    it("handles I64", () => {
      assertRoundTrip(xdr.ScVal.scvI64(new xdr.Int64(0n)), "i64", false);
      assertRoundTrip(xdr.ScVal.scvI64(new xdr.Int64(-9223372036854775808n)), "i64", false);
      assertRoundTrip(xdr.ScVal.scvI64(new xdr.Int64(9223372036854775807n)), "i64", false);
    });

    it("handles Timepoint", () => {
      assertRoundTrip(xdr.ScVal.scvTimepoint(new xdr.Uint64(123456n)), "timepoint", false);
    });

    it("handles Duration", () => {
      assertRoundTrip(xdr.ScVal.scvDuration(new xdr.Uint64(999999n)), "duration", false);
    });
  });

  describe("Large Integers (128-bit & 256-bit)", () => {
    it("handles U128", () => {
      const parts = new xdr.UInt128Parts({
        hi: new xdr.Uint64(12345n),
        lo: new xdr.Uint64(67890n),
      });
      assertRoundTrip(xdr.ScVal.scvU128(parts), "u128", true);
    });

    it("handles I128", () => {
      const parts = new xdr.Int128Parts({
        hi: new xdr.Int64(-12345n),
        lo: new xdr.Uint64(67890n),
      });
      assertRoundTrip(xdr.ScVal.scvI128(parts), "i128", true);
    });

    it("handles U256", () => {
      const parts = new xdr.UInt256Parts({
        hiHi: new xdr.Uint64(1n),
        hiLo: new xdr.Uint64(2n),
        loHi: new xdr.Uint64(3n),
        loLo: new xdr.Uint64(4n),
      });
      assertRoundTrip(xdr.ScVal.scvU256(parts), "u256", true);
    });

    it("handles I256", () => {
      const parts = new xdr.Int256Parts({
        hiHi: new xdr.Int64(-1n),
        hiLo: new xdr.Uint64(2n),
        loHi: new xdr.Uint64(3n),
        loLo: new xdr.Uint64(4n),
      });
      assertRoundTrip(xdr.ScVal.scvI256(parts), "i256", true);
    });
  });

  describe("Strings, Symbols, Bytes & Addresses", () => {
    it("handles Bytes", () => {
      assertRoundTrip(xdr.ScVal.scvBytes(Buffer.from([1, 2, 3, 4])), "bytes");
      assertRoundTrip(xdr.ScVal.scvBytes(Buffer.alloc(0)), "bytes");
    });

    it("handles String", () => {
      assertRoundTrip(xdr.ScVal.scvString("hello world"), "string");
      assertRoundTrip(xdr.ScVal.scvString(""), "string");
    });

    it("handles Symbol", () => {
      assertRoundTrip(xdr.ScVal.scvSymbol("my_symbol"), "symbol", false);
    });

    it("handles Address", () => {
      const accountAddr = Address.fromString(
        "GAPMH4R4OLAAT4YSTPXUUEQYPPC3NB7P6A3W3YQIRIW33U3B4AW46HDY",
      );
      assertRoundTrip(accountAddr.toScVal(), "address", true);

      const contractAddr = Address.fromString(
        "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
      );
      assertRoundTrip(contractAddr.toScVal(), "address", true);
    });
  });

  describe("Collections (Vec & Map)", () => {
    it("handles Vec", () => {
      const original = xdr.ScVal.scvVec([xdr.ScVal.scvU32(10), xdr.ScVal.scvU32(20)]);
      assertRoundTrip(original, "Vec<u32>", false);
    });

    it("handles Vec of unambiguous elements", () => {
      const original = xdr.ScVal.scvVec([xdr.ScVal.scvString("a"), xdr.ScVal.scvString("b")]);
      assertRoundTrip(original, "vec", true);
    });

    it("handles Vec with element spec", () => {
      const original = xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("a"), xdr.ScVal.scvSymbol("b")]);
      assertRoundTrip(original, "Vec<Symbol>", false);
    });

    it("handles Map", () => {
      const original = xdr.ScVal.scvMap([
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvString("key1"),
          val: xdr.ScVal.scvU32(100),
        }),
      ]);
      assertRoundTrip(original, "Map<String, u32>", false);
    });

    it("handles Map of unambiguous elements", () => {
      const original = xdr.ScVal.scvMap([
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvString("key1"),
          val: xdr.ScVal.scvString("val1"),
        }),
      ]);
      assertRoundTrip(original, "map", true);
    });

    it("handles Map with custom specs", () => {
      const original = xdr.ScVal.scvMap([
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol("symKey"),
          val: xdr.ScVal.scvI64(new xdr.Int64(-999n)),
        }),
      ]);
      assertRoundTrip(original, "Map<Symbol, i64>", false);
    });
  });

  describe("Errors", () => {
    it("handles contract error", () => {
      const err = xdr.ScError.sceContract(1234);
      const original = xdr.ScVal.scvError(err);
      assertRoundTrip(original, "error", true);
    });

    it("handles system error (sceContext)", () => {
      const err = xdr.ScError.sceContext(xdr.ScErrorCode.scecInvalidInput());
      const original = xdr.ScVal.scvError(err);
      assertRoundTrip(original, "error", true);
    });

    it("handles system error (sceWasmVm)", () => {
      const err = xdr.ScError.sceWasmVm(xdr.ScErrorCode.scecArithDomain());
      const original = xdr.ScVal.scvError(err);
      assertRoundTrip(original, "error", true);
    });
  });

  describe("Soroban Ledger & Instance Edge Cases", () => {
    it("handles LedgerKeyContractInstance", () => {
      const original = xdr.ScVal.scvLedgerKeyContractInstance();
      assertRoundTrip(original, "ledgerKeyContractInstance", true);
    });

    it("handles LedgerKeyNonce", () => {
      const nonce = new xdr.ScNonceKey({ nonce: new xdr.Int64(12345n) });
      const original = xdr.ScVal.scvLedgerKeyNonce(nonce);
      assertRoundTrip(original, "ledgerKeyNonce", true);
    });

    it("handles ContractInstance (Stellar Asset)", () => {
      const inst = new xdr.ScContractInstance({
        executable: xdr.ContractExecutable.contractExecutableStellarAsset(),
        storage: null,
      });
      const original = xdr.ScVal.scvContractInstance(inst);
      assertRoundTrip(original, "contractInstance", true);
    });

    it("handles ContractInstance (Wasm Hash with Storage)", () => {
      const inst = new xdr.ScContractInstance({
        executable: xdr.ContractExecutable.contractExecutableWasm(Buffer.alloc(32, 7)),
        storage: [
          new xdr.ScMapEntry({
            key: xdr.ScVal.scvString("admin"),
            val: Address.fromString(
              "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
            ).toScVal(),
          }),
        ],
      });
      const original = xdr.ScVal.scvContractInstance(inst);
      assertRoundTrip(original, "contractInstance", true);
    });
  });

  describe("Soroban xdr.ScSpecTypeDef integration", () => {
    it("converts using an ScSpecTypeDef spec parameter", () => {
      const symTypeDef = xdr.ScSpecTypeDef.scSpecTypeSymbol();
      const vecSpec = new xdr.ScSpecTypeVec({ element: symTypeDef });
      const typeDef = xdr.ScSpecTypeDef.scSpecTypeVec(vecSpec);

      const original = xdr.ScVal.scvVec([
        xdr.ScVal.scvSymbol("first"),
        xdr.ScVal.scvSymbol("second"),
      ]);

      const jsVal = scvalToJs(original);
      const roundTripped = jsToScval(jsVal, typeDef);

      expect(roundTripped.toXDR().equals(original.toXDR())).toBe(true);
    });

    it("handles ScSpecTypeDef variants for primitives and numbers", () => {
      expect(jsToScval(123, xdr.ScSpecTypeDef.scSpecTypeVal()).switch().name).toBe("scvI32");
      expect(jsToScval(true, xdr.ScSpecTypeDef.scSpecTypeBool()).switch().name).toBe("scvBool");
      expect(jsToScval(null, xdr.ScSpecTypeDef.scSpecTypeVoid()).switch().name).toBe("scvVoid");
      expect(jsToScval(10, xdr.ScSpecTypeDef.scSpecTypeU32()).switch().name).toBe("scvU32");
      expect(jsToScval(-10, xdr.ScSpecTypeDef.scSpecTypeI32()).switch().name).toBe("scvI32");
      expect(jsToScval(100n, xdr.ScSpecTypeDef.scSpecTypeU64()).switch().name).toBe("scvU64");
      expect(jsToScval(-100n, xdr.ScSpecTypeDef.scSpecTypeI64()).switch().name).toBe("scvI64");
      expect(jsToScval(1000n, xdr.ScSpecTypeDef.scSpecTypeTimepoint()).switch().name).toBe(
        "scvTimepoint",
      );
      expect(jsToScval(500n, xdr.ScSpecTypeDef.scSpecTypeDuration()).switch().name).toBe(
        "scvDuration",
      );
      expect(jsToScval(10n, xdr.ScSpecTypeDef.scSpecTypeU128()).switch().name).toBe("scvU128");
      expect(jsToScval(-10n, xdr.ScSpecTypeDef.scSpecTypeI128()).switch().name).toBe("scvI128");
      expect(jsToScval(10n, xdr.ScSpecTypeDef.scSpecTypeU256()).switch().name).toBe("scvU256");
      expect(jsToScval(-10n, xdr.ScSpecTypeDef.scSpecTypeI256()).switch().name).toBe("scvI256");
      expect(jsToScval("hello", xdr.ScSpecTypeDef.scSpecTypeString()).switch().name).toBe(
        "scvString",
      );
      expect(jsToScval("sym", xdr.ScSpecTypeDef.scSpecTypeSymbol()).switch().name).toBe(
        "scvSymbol",
      );
      expect(jsToScval(Buffer.from("abc"), xdr.ScSpecTypeDef.scSpecTypeBytes()).switch().name).toBe(
        "scvBytes",
      );
      const addr = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";
      expect(jsToScval(addr, xdr.ScSpecTypeDef.scSpecTypeAddress()).switch().name).toBe(
        "scvAddress",
      );
    });

    it("handles ScSpecTypeDef composite types (Option, Result, Map, Tuple, BytesN, Udt)", () => {
      const optSpec = new xdr.ScSpecTypeOption({ typeDef: xdr.ScSpecTypeDef.scSpecTypeU32() });
      const optTypeDef = xdr.ScSpecTypeDef.scSpecTypeOption(optSpec);
      expect(jsToScval(null, optTypeDef).switch().name).toBe("scvVoid");
      expect(jsToScval(42, optTypeDef).switch().name).toBe("scvU32");

      const resSpec = new xdr.ScSpecTypeResult({
        ok: xdr.ScSpecTypeDef.scSpecTypeString(),
        error: xdr.ScSpecTypeDef.scSpecTypeError(),
      });
      const resTypeDef = xdr.ScSpecTypeDef.scSpecTypeResult(resSpec);
      expect(jsToScval("success", resTypeDef).switch().name).toBe("scvString");
      expect(jsToScval(new Error("fail"), resTypeDef).switch().name).toBe("scvError");

      const mapSpec = new xdr.ScSpecTypeMap({
        key: xdr.ScSpecTypeDef.scSpecTypeString(),
        value: xdr.ScSpecTypeDef.scSpecTypeU32(),
      });
      const mapTypeDef = xdr.ScSpecTypeDef.scSpecTypeMap(mapSpec);
      const resMap = jsToScval({ k1: 99 }, mapTypeDef);
      expect(resMap.switch().name).toBe("scvMap");

      const tupleSpec = new xdr.ScSpecTypeTuple({
        values: [xdr.ScSpecTypeDef.scSpecTypeU32(), xdr.ScSpecTypeDef.scSpecTypeString()],
      });
      const tupleTypeDef = xdr.ScSpecTypeDef.scSpecTypeTuple(tupleSpec);
      const resTuple = jsToScval([10, "test"], tupleTypeDef);
      expect(resTuple.switch().name).toBe("scvVec");

      const bytesNSpec = new xdr.ScSpecTypeBytesN({ n: 32 });
      const bytesNTypeDef = xdr.ScSpecTypeDef.scSpecTypeBytesN(bytesNSpec);
      expect(jsToScval(Buffer.alloc(32), bytesNTypeDef).switch().name).toBe("scvBytes");

      const udtSpec = new xdr.ScSpecTypeUdt({ name: "MyType" });
      const udtTypeDef = xdr.ScSpecTypeDef.scSpecTypeUdt(udtSpec);
      expect(jsToScval("val", udtTypeDef).switch().name).toBe("scvString");
    });
  });

  describe("Branch & Coverage Edge Cases", () => {
    it("handles bytes input formats (Buffer, Uint8Array, hex, utf-8, array)", () => {
      expect(jsToScval(new Uint8Array([1, 2, 3]), "bytes").switch().name).toBe("scvBytes");
      expect(jsToScval("0a0b0c", "bytes").switch().name).toBe("scvBytes");
      expect(jsToScval("plain_string", "bytes").switch().name).toBe("scvBytes");
      expect(jsToScval([1, 2, 3], "bytes").switch().name).toBe("scvBytes");
      expect(() => jsToScval(12345, "bytes")).toThrow("Unsupported bytes value");
    });

    it("handles Address input variants and invalid values", () => {
      const str = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";
      const addrObj = Address.fromString(str);
      expect(jsToScval(addrObj.toScAddress(), "address").switch().name).toBe("scvAddress");
      expect(jsToScval(addrObj, "address").switch().name).toBe("scvAddress");
      expect(jsToScval(str, "address").switch().name).toBe("scvAddress");
      expect(() => jsToScval(123, "address")).toThrow("Unsupported address value");
    });

    it("handles Map with various collection representations", () => {
      const fromMap = new Map([["keyA", "valA"]]);
      expect(jsToScval(fromMap, "map").switch().name).toBe("scvMap");

      const fromPairArray = [["keyB", "valB"]];
      expect(jsToScval(fromPairArray, "map").switch().name).toBe("scvMap");

      const fromKeyValueObjects = [{ key: "keyC", val: "valC" }];
      expect(jsToScval(fromKeyValueObjects, "map").switch().name).toBe("scvMap");

      expect(() => jsToScval([1, 2, 3], "map")).toThrow("Invalid array format for map type");
      expect(() => jsToScval("invalid", "map")).toThrow("Value must be a Map, Object, or Array");
    });

    it("handles negative values in unsigned 128 and 256 bits", () => {
      expect(() => jsToScval(-1n, "u128")).toThrow("Cannot represent negative value as u128");
      expect(() => jsToScval(-1n, "u256")).toThrow("Cannot represent negative value as u256");
    });

    it("handles tuple type validation and option handling", () => {
      expect(() => jsToScval("not_array", "tuple")).toThrow(
        "Value must be an array for tuple type",
      );
      expect(() => jsToScval("not_array", "vec")).toThrow("Value must be an array for vec type");

      expect(jsToScval(undefined, "option").switch().name).toBe("scvVoid");
      expect(jsToScval(null, "option").switch().name).toBe("scvVoid");

      expect(jsToScval({ type: "error" }, "result").switch().name).toBe("scvError");
    });

    it("handles smart inference fallback for numbers, contracts, and primitives", () => {
      expect(jsToScval(null).switch().name).toBe("scvVoid");
      expect(jsToScval(undefined).switch().name).toBe("scvVoid");
      expect(jsToScval(3.14).switch().name).toBe("scvI32");
      expect(jsToScval(new Uint8Array([5, 6])).switch().name).toBe("scvBytes");
      expect(jsToScval([1, 2, 3]).switch().name).toBe("scvVec");
      expect(jsToScval(new Map([["a", 1]])).switch().name).toBe("scvMap");
      expect(jsToScval({ a: 1 }).switch().name).toBe("scvMap");

      const contractAddr = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";
      expect(jsToScval(contractAddr).switch().name).toBe("scvAddress");

      const existingScVal = xdr.ScVal.scvVoid();
      expect(jsToScval(existingScVal)).toBe(existingScVal);
    });

    it("throws on unsupported error input", () => {
      expect(() => jsToScval("invalid_error", "error")).toThrow("Unsupported error value");
    });
  });
});
