import { describe, it, expect } from "vitest";
import { xdr } from "@stellar/stellar-sdk";
import { escapeSep51, encodeMuxedContract, scValToXdrJson } from "../src/xdrJson.js";

/**
 * The common arms (symbol, address, i128, u128, u256, string, map, vec, bool,
 * bytes, u32, i32, u64, void) are covered against real mainnet RPC output in
 * GalexieHistoricalSource.test.ts. These cover the rest, from the serde rules
 * in the Rust stellar-xdr crate that RPC's xdr2json uses.
 */

/** Key bytes from stellar-xdr's src/tests/str.rs strkey vectors. */
const KEY = Buffer.from("363eaa3867841fbad0f4ed88c779e4fe66e56a2470dc98c0ec9c073d05c7b103", "hex");

const i64 = (n: bigint) => xdr.Int64.fromString(n.toString());
const u64 = (n: bigint) => xdr.Uint64.fromString(n.toString());

describe("escapeSep51", () => {
  it("keeps printable ASCII and escapes everything else the SEP-51 way", () => {
    const bytes = Buffer.from([0x41, 0x00, 0x09, 0x0a, 0x0d, 0x5c, 0x7e, 0x7f, 0x20, 0xf0, 0x9f]);
    expect(escapeSep51(bytes)).toBe("A\\0\\t\\n\\r\\\\~\\x7f \\xf0\\x9f");
  });

  it("escapes a UTF-8 string byte by byte, as mainnet RPC does", () => {
    // Seen in mainnet RPC output: "🍯 account opened".
    expect(escapeSep51(Buffer.from("🍯 account opened", "utf8"))).toBe(
      "\\xf0\\x9f\\x8d\\xaf account opened",
    );
  });
});

describe("scValToXdrJson", () => {
  it("renders 64-bit integers, timepoint and duration as decimal strings", () => {
    expect(scValToXdrJson(xdr.ScVal.scvI64(i64(-5n)))).toEqual({ i64: "-5" });
    expect(scValToXdrJson(xdr.ScVal.scvU64(u64(18446744073709551615n)))).toEqual({
      u64: "18446744073709551615",
    });
    expect(scValToXdrJson(xdr.ScVal.scvTimepoint(u64(1700000000n)))).toEqual({
      timepoint: "1700000000",
    });
    expect(scValToXdrJson(xdr.ScVal.scvDuration(u64(60n)))).toEqual({ duration: "60" });
  });

  it("renders signed 128- and 256-bit integers, including negatives", () => {
    const i128 = xdr.ScVal.scvI128(new xdr.Int128Parts({ hi: i64(-1n), lo: u64(2n ** 64n - 3n) }));
    expect(scValToXdrJson(i128)).toEqual({ i128: "-3" });

    const i256 = xdr.ScVal.scvI256(
      new xdr.Int256Parts({
        hiHi: i64(-1n),
        hiLo: u64(2n ** 64n - 1n),
        loHi: u64(2n ** 64n - 1n),
        loLo: u64(2n ** 64n - 7n),
      }),
    );
    expect(scValToXdrJson(i256)).toEqual({ i256: "-7" });

    const u256max = xdr.ScVal.scvU256(
      new xdr.UInt256Parts({
        hiHi: u64(2n ** 64n - 1n),
        hiLo: u64(2n ** 64n - 1n),
        loHi: u64(2n ** 64n - 1n),
        loLo: u64(2n ** 64n - 1n),
      }),
    );
    expect(scValToXdrJson(u256max)).toEqual({ u256: (2n ** 256n - 1n).toString() });
  });

  it("renders null vec and map, and the unit arms", () => {
    expect(scValToXdrJson(xdr.ScVal.scvVec(null))).toEqual({ vec: null });
    expect(scValToXdrJson(xdr.ScVal.scvMap(null as unknown as xdr.ScMapEntry[]))).toEqual({
      map: null,
    });
    expect(scValToXdrJson(xdr.ScVal.scvVoid())).toBe("void");
    expect(scValToXdrJson(xdr.ScVal.scvLedgerKeyContractInstance())).toBe(
      "ledger_key_contract_instance",
    );
  });

  it("renders errors as snake_case type and code", () => {
    expect(scValToXdrJson(xdr.ScVal.scvError(xdr.ScError.sceContract(7)))).toEqual({
      error: { contract: 7 },
    });
    expect(
      scValToXdrJson(xdr.ScVal.scvError(xdr.ScError.sceWasmVm(xdr.ScErrorCode.scecArithDomain()))),
    ).toEqual({ error: { wasm_vm: "arith_domain" } });
    expect(
      scValToXdrJson(xdr.ScVal.scvError(xdr.ScError.sceAuth(xdr.ScErrorCode.scecInvalidAction()))),
    ).toEqual({ error: { auth: "invalid_action" } });
  });

  it("renders a ledger nonce key and an executable tag", () => {
    expect(
      scValToXdrJson(xdr.ScVal.scvLedgerKeyNonce(new xdr.ScNonceKey({ nonce: i64(-9n) }))),
    ).toEqual({ ledger_key_nonce: { nonce: "-9" } });
    expect(scValToXdrJson(xdr.ScVal.scvExecutableTag(Buffer.from("v1\n")))).toEqual({
      executable_tag: "v1\\n",
    });
  });

  it("renders a contract instance", () => {
    const instance = xdr.ScVal.scvContractInstance(
      new xdr.ScContractInstance({
        executable: xdr.ContractExecutable.contractExecutableWasm(KEY),
        storage: [new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("k"), val: xdr.ScVal.scvU32(1) })],
      }),
    );
    expect(scValToXdrJson(instance)).toEqual({
      contract_instance: {
        executable: { wasm: KEY.toString("hex") },
        storage: [{ key: { symbol: "k" }, val: { u32: 1 } }],
      },
    });
    const sac = xdr.ScVal.scvContractInstance(
      new xdr.ScContractInstance({
        executable: xdr.ContractExecutable.contractExecutableStellarAsset(),
        storage: null as unknown as xdr.ScMapEntry[],
      }),
    );
    expect(scValToXdrJson(sac)).toEqual({
      contract_instance: { executable: "stellar_asset", storage: null },
    });
  });

  it("renders every address type as the strkey stellar-xdr's tests expect", () => {
    const addr = (a: xdr.ScAddress) => scValToXdrJson(xdr.ScVal.scvAddress(a));
    expect(
      addr(
        xdr.ScAddress.scAddressTypeMuxedAccount(
          new xdr.MuxedEd25519Account({ id: u64(123_456n), ed25519: KEY }),
        ),
      ),
    ).toEqual({ address: "MA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAAAAAAAAAPCICBKU" });
    expect(addr(xdr.ScAddress.scAddressTypeLiquidityPool(KEY))).toEqual({
      address: "LA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGZ5J",
    });
    expect(
      addr(
        xdr.ScAddress.scAddressTypeClaimableBalance(
          xdr.ClaimableBalanceId.claimableBalanceIdTypeV0(KEY),
        ),
      ),
    ).toEqual({ address: "BAADMPVKHBTYIH522D2O3CGHPHSP4ZXFNISHBXEYYDWJYBZ5AXD3CA3GDE" });
    expect(
      addr(
        xdr.ScAddress.scAddressTypeMuxedContract(
          new xdr.MuxedContract({
            id: u64(123_456n),
            contractId: KEY as unknown as xdr.ContractId,
          }),
        ),
      ),
    ).toEqual({ address: "WA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAAAAAAAAAPCIA6IG" });
  });

  it("encodes a muxed contract strkey from its parts", () => {
    expect(encodeMuxedContract(KEY, 123_456n)).toBe(
      "WA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAAAAAAAAAPCIA6IG",
    );
  });
});
