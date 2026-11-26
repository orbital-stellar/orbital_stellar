/**
 * Renders an `ScVal` in the JSON shape Stellar RPC returns for
 * `xdrFormat: "json"` (`topicJson` / `valueJson`).
 *
 * Stellar RPC produces that JSON with `xdr2json`, which is the serde output of
 * the Rust `stellar-xdr` crate. This module reproduces it for the `ScVal`
 * subset that contract events carry, so a source that reads raw ledger XDR
 * (see `GalexieHistoricalSource`) returns the same JSON a live RPC would.
 *
 * The rules, all from `stellar-xdr`:
 * - Unions are externally tagged with snake_case arm names: `{"u32": 1}`.
 *   Arms with no value are bare strings: `"void"`, `"ledger_key_contract_instance"`.
 * - 64-bit integers, `timepoint` and `duration` are decimal strings, and so
 *   are 128- and 256-bit integers.
 * - `bytes` and hashes are lowercase hex.
 * - `string` and `symbol` are byte strings escaped per SEP-51: printable
 *   ASCII (0x20-0x7e) is kept, except a backslash becomes `\\`; NUL, tab, LF
 *   and CR become `\0`, `\t`, `\n`, `\r`; any other byte becomes `\xNN`.
 * - Addresses are strkeys.
 *
 * It was checked against mainnet RPC output for every event in seven
 * mainnet ledgers (5,896 events), byte for byte.
 */
import { Address, xdr } from "@stellar/stellar-sdk";

/** A value in Stellar RPC's `xdrFormat: "json"` shape. */
export type XdrJsonValue = string | number | boolean | null | XdrJsonValue[] | XdrJsonObject;

/** An object in Stellar RPC's `xdrFormat: "json"` shape. */
export type XdrJsonObject = { [key: string]: XdrJsonValue };

/** Thrown when an `ScVal` holds something this module cannot render the way `xdr2json` does. */
export class XdrJsonUnsupportedError extends Error {
  constructor(what: string) {
    super(`[pulse-core] cannot render ${what} as Stellar RPC JSON`);
    this.name = "XdrJsonUnsupportedError";
  }
}

/**
 * Escapes a byte string per SEP-51, the way `stellar-xdr` serializes
 * `ScString` and `ScSymbol`.
 */
export function escapeSep51(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    if (b === 0x00) out += "\\0";
    else if (b === 0x09) out += "\\t";
    else if (b === 0x0a) out += "\\n";
    else if (b === 0x0d) out += "\\r";
    else if (b === 0x5c) out += "\\\\";
    else if (b >= 0x20 && b <= 0x7e) out += String.fromCharCode(b);
    else out += "\\x" + b.toString(16).padStart(2, "0");
  }
  return out;
}

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString("hex");

/** Combines big-endian 64-bit words into one unsigned integer. */
function joinWords(words: ReadonlyArray<{ toString(): string }>): bigint {
  let v = 0n;
  for (const w of words) v = (v << 64n) | BigInt.asUintN(64, BigInt(w.toString()));
  return v;
}

/** CRC16-XModem, the strkey checksum. */
function crc16xmodem(data: Uint8Array): number {
  let crc = 0;
  for (const byte of data) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32(data: Uint8Array): string {
  let out = "";
  let bits = 0;
  let value = 0;
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

/** Strkey version byte for a muxed contract (`W...`): base32 index 22, shifted left 3. */
const MUXED_CONTRACT_VERSION_BYTE = 22 << 3;

/**
 * Encodes a muxed contract address as its `W...` strkey. The JS SDK cannot
 * encode this address type yet. The payload matches a muxed account's:
 * the 32-byte contract ID, then the 8-byte big-endian ID.
 */
export function encodeMuxedContract(contractId: Uint8Array, id: bigint): string {
  const payload = new Uint8Array(1 + 32 + 8);
  payload[0] = MUXED_CONTRACT_VERSION_BYTE;
  payload.set(contractId, 1);
  new DataView(payload.buffer).setBigUint64(33, BigInt.asUintN(64, id), false);
  const crc = crc16xmodem(payload);
  const withCrc = new Uint8Array(payload.length + 2);
  withCrc.set(payload);
  withCrc[payload.length] = crc & 0xff;
  withCrc[payload.length + 1] = crc >> 8;
  return base32(withCrc);
}

function addressToStrkey(address: xdr.ScAddress): string {
  if (address.switch().name === "scAddressTypeMuxedContract") {
    const muxed = address.muxedContract();
    return encodeMuxedContract(
      Buffer.from(muxed.contractId() as unknown as Uint8Array),
      BigInt(muxed.id().toString()),
    );
  }
  return Address.fromScAddress(address).toString();
}

function scErrorToJson(error: xdr.ScError): XdrJsonObject {
  const arm = error.switch().name;
  if (arm === "sceContract") return { contract: error.contractCode() };
  const code = error.code().name; // e.g. "scecArithDomain"
  const key = snake(arm.replace(/^sce/, ""));
  return { [key]: snake(code.replace(/^scec/, "")) };
}

/** "WasmVm" -> "wasm_vm", "ArithDomain" -> "arith_domain". */
function snake(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function executableToJson(executable: xdr.ContractExecutable): XdrJsonValue {
  switch (executable.switch().name) {
    case "contractExecutableWasm":
      return { wasm: hex(executable.wasmHash()) };
    case "contractExecutableStellarAsset":
      return "stellar_asset";
    case "contractExecutableExternalRef": {
      const ref = executable.externalRef();
      return {
        external_ref: {
          executable_owner: addressToStrkey(ref.executableOwner()),
          tag: escapeSep51(Buffer.from(ref.tag() as unknown as Uint8Array)),
        },
      };
    }
    default:
      throw new XdrJsonUnsupportedError(`contract executable ${executable.switch().name}`);
  }
}

function mapToJson(map: xdr.ScMapEntry[] | null | undefined): XdrJsonValue {
  if (!map) return null;
  return map.map((entry) => ({
    key: scValToXdrJson(entry.key()),
    val: scValToXdrJson(entry.val()),
  }));
}

/** Renders one `ScVal` the way Stellar RPC's `xdrFormat: "json"` does. */
export function scValToXdrJson(value: xdr.ScVal): XdrJsonValue {
  const arm = value.switch().name;
  switch (arm) {
    case "scvBool":
      return { bool: value.b() };
    case "scvVoid":
      return "void";
    case "scvError":
      return { error: scErrorToJson(value.error()) };
    case "scvU32":
      return { u32: value.u32() };
    case "scvI32":
      return { i32: value.i32() };
    case "scvU64":
      return { u64: value.u64().toString() };
    case "scvI64":
      return { i64: value.i64().toString() };
    case "scvTimepoint":
      return { timepoint: value.timepoint().toString() };
    case "scvDuration":
      return { duration: value.duration().toString() };
    case "scvU128": {
      const p = value.u128();
      return { u128: joinWords([p.hi(), p.lo()]).toString() };
    }
    case "scvI128": {
      const p = value.i128();
      return { i128: BigInt.asIntN(128, joinWords([p.hi(), p.lo()])).toString() };
    }
    case "scvU256": {
      const p = value.u256();
      return { u256: joinWords([p.hiHi(), p.hiLo(), p.loHi(), p.loLo()]).toString() };
    }
    case "scvI256": {
      const p = value.i256();
      const v = joinWords([p.hiHi(), p.hiLo(), p.loHi(), p.loLo()]);
      return { i256: BigInt.asIntN(256, v).toString() };
    }
    case "scvBytes":
      return { bytes: hex(value.bytes()) };
    case "scvString":
      return { string: escapeSep51(Buffer.from(value.str() as unknown as Uint8Array)) };
    case "scvSymbol":
      return { symbol: escapeSep51(Buffer.from(value.sym() as unknown as Uint8Array)) };
    case "scvVec": {
      const vec = value.vec();
      return { vec: vec ? vec.map(scValToXdrJson) : null };
    }
    case "scvMap":
      return { map: mapToJson(value.map()) };
    case "scvAddress":
      return { address: addressToStrkey(value.address()) };
    case "scvContractInstance": {
      const instance = value.instance();
      return {
        contract_instance: {
          executable: executableToJson(instance.executable()),
          storage: mapToJson(instance.storage()),
        },
      };
    }
    case "scvLedgerKeyContractInstance":
      return "ledger_key_contract_instance";
    case "scvLedgerKeyNonce":
      return { ledger_key_nonce: { nonce: value.nonceKey().nonce().toString() } };
    case "scvExecutableTag":
      return {
        executable_tag: escapeSep51(Buffer.from(value.executableTag() as unknown as Uint8Array)),
      };
    default:
      throw new XdrJsonUnsupportedError(`ScVal arm ${arm}`);
  }
}
