import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { canonicalizeSpec } from "../src/spec.js";
import { Address, Keypair, Networks, rpc as SorobanRpc, StrKey, xdr } from "@stellar/stellar-sdk";
import {
  OnChainAbiRegistryClient,
  RegistryEntryArchivedError,
} from "../src/OnChainAbiRegistryClient.js";
import type { ContractSpec } from "../src/spec.js";

vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stellar/stellar-sdk")>();
  return {
    ...actual,
    rpc: { ...actual.rpc, Server: vi.fn() },
  };
});

// Real, checksum-valid strkeys - Address/Contract in stellar-sdk validate the
// checksum, so hand-typed placeholder addresses won't pass construction.
const REGISTRY_CONTRACT_ID = StrKey.encodeContract(Buffer.alloc(32, 7));
const TARGET_CONTRACT_ID = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";
const PUBLISHER_ADDRESS = Keypair.random().publicKey();

function testSpec(overrides: Partial<ContractSpec> = {}): ContractSpec {
  return {
    version: "1.0.0",
    name: "Test Token",
    contractId: TARGET_CONTRACT_ID,
    network: "mainnet",
    functions: [],
    events: [],
    types: {},
    ...overrides,
  };
}

/**
 * Hand-builds the exact ScVal shape soroban-sdk's `#[contracttype]` produces
 * for the registry's `SpecRecord` struct: an `scvMap` with `scvSymbol` keys
 * and per-field-typed values. Built at the XDR level (not via `nativeToScVal`
 * object inference) so the test fixture's wire shape is unambiguous and
 * doesn't depend on guessing `nativeToScVal`'s struct-typing conventions.
 */
function specRecordScVal(record: {
  version: string;
  specHash: Buffer;
  pointer: string;
  publisher: string;
  publishedAt?: bigint;
  publishedAtLedger?: number;
}): xdr.ScVal {
  const entry = (key: string, val: xdr.ScVal) =>
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val });

  return xdr.ScVal.scvMap([
    entry("version", xdr.ScVal.scvString(record.version)),
    entry("spec_hash", xdr.ScVal.scvBytes(record.specHash)),
    entry("pointer", xdr.ScVal.scvString(record.pointer)),
    entry("publisher", new Address(record.publisher).toScVal()),
    entry("published_at", xdr.ScVal.scvU64(new xdr.Uint64(record.publishedAt ?? 1000n))),
    entry("published_at_ledger", xdr.ScVal.scvU32(record.publishedAtLedger ?? 100)),
  ]);
}

type MockServer = {
  simulateTransaction: ReturnType<typeof vi.fn>;
};

function installMockServer(simulateTransaction: ReturnType<typeof vi.fn>): MockServer {
  const server: MockServer = { simulateTransaction };
  (SorobanRpc.Server as unknown as ReturnType<typeof vi.fn>).mockImplementation(function (
    this: unknown,
  ) {
    return server;
  });
  return server;
}

function installMockEventsServer(server: {
  getEvents: ReturnType<typeof vi.fn>;
  getLatestLedger: ReturnType<typeof vi.fn>;
}): void {
  (SorobanRpc.Server as unknown as ReturnType<typeof vi.fn>).mockImplementation(function (
    this: unknown,
  ) {
    return server;
  });
}

/**
 * Builds a `getEvents` record shaped like the registry's `SpecPublished`
 * event: `#[contractevent]` puts the snake_case event name in `topic[0]`,
 * then the `#[topic]` fields (`contract_id`, `version`); the other fields
 * live in `value`.
 */
function specPublishedEvent(record: {
  contractId: string;
  version: string;
  specHash: Buffer;
  pointer: string;
  publisher: string;
  ledger: number;
  eventName?: string;
}): { id: string; topic: xdr.ScVal[]; value: xdr.ScVal; ledger: number } {
  const entry = (key: string, val: xdr.ScVal) =>
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(key), val });

  return {
    id: `${record.ledger}-0`,
    topic: [
      xdr.ScVal.scvSymbol(record.eventName ?? "spec_published"),
      new Address(record.contractId).toScVal(),
      xdr.ScVal.scvString(record.version),
    ],
    value: xdr.ScVal.scvMap([
      entry("spec_hash", xdr.ScVal.scvBytes(record.specHash)),
      entry("pointer", xdr.ScVal.scvString(record.pointer)),
      entry("publisher", new Address(record.publisher).toScVal()),
    ]),
    ledger: record.ledger,
  };
}

const sha = (s: string) => createHash("sha256").update(s).digest();

const MAX_PAGE_SIZE = 25;

/** Routes simulateTransaction calls to list_versions / list_versions_paged / get_version based on the invoked function name. */
function routingSimulate(opts: { versions: string[]; records: Record<string, xdr.ScVal> }) {
  return vi
    .fn()
    .mockImplementation(
      async (tx: InstanceType<typeof import("@stellar/stellar-sdk").Transaction>) => {
        const op = tx.operations[0] as unknown as { func: xdr.HostFunction };
        const invocation = op.func.invokeContract();
        const fnName = invocation.functionName().toString();

        if (fnName === "list_versions_paged") {
          const args = invocation.args();
          const start = Number((args[2] as xdr.ScVal).u32());
          const limit = Math.min(Number((args[3] as xdr.ScVal).u32()), MAX_PAGE_SIZE);
          const page = opts.versions.slice(start, start + limit);
          const nextCursor = start + limit < opts.versions.length ? start + limit : null;
          return {
            result: {
              retval: xdr.ScVal.scvVec([
                xdr.ScVal.scvVec(page.map((v) => xdr.ScVal.scvString(v))),
                nextCursor !== null ? xdr.ScVal.scvU32(nextCursor) : xdr.ScVal.scvVoid(),
              ]),
            },
          };
        }

        if (fnName === "list_versions") {
          return {
            result: {
              retval: xdr.ScVal.scvVec(opts.versions.map((v) => xdr.ScVal.scvString(v))),
            },
          };
        }
        if (fnName === "get_version") {
          const args = invocation.args();
          const version = (args[2] as xdr.ScVal).str().toString();
          const retval = opts.records[version];
          return { result: { retval: retval ?? xdr.ScVal.scvVoid() } };
        }
        throw new Error(`unexpected function in test: ${fnName}`);
      },
    );
}

function makeClient(
  overrides: Partial<ConstructorParameters<typeof OnChainAbiRegistryClient>[0]> = {},
) {
  return new OnChainAbiRegistryClient({
    contractId: REGISTRY_CONTRACT_ID,
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: Networks.TESTNET,
    publisher: PUBLISHER_ADDRESS,
    ...overrides,
  });
}

describe("OnChainAbiRegistryClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no versions have been published for a contract", async () => {
    installMockServer(routingSimulate({ versions: [], records: {} }));
    const client = makeClient();

    expect(await client.getSpec(TARGET_CONTRACT_ID)).toBeNull();
  });

  it("resolves the latest published spec, verifying the blob's hash against the on-chain spec_hash", async () => {
    const spec = testSpec({ version: "2.0.0" });
    // Served pretty-printed, hashed canonically - exactly the shape the
    // seeding script produces, and the case that used to fail.
    const blob = JSON.stringify(spec, null, 2);
    const specHash = createHash("sha256").update(canonicalizeSpec(spec)).digest();

    installMockServer(
      routingSimulate({
        versions: ["1.0.0", "2.0.0"],
        records: {
          "1.0.0": specRecordScVal({
            version: "1.0.0",
            specHash: createHash("sha256").update("old").digest(),
            pointer: "https://example.com/old.json",
            publisher: PUBLISHER_ADDRESS,
            publishedAtLedger: 100,
          }),
          "2.0.0": specRecordScVal({
            version: "2.0.0",
            specHash,
            pointer: "https://example.com/spec.json",
            publisher: PUBLISHER_ADDRESS,
            publishedAtLedger: 200,
          }),
        },
      }),
    );

    const transport = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => blob,
    });
    const client = makeClient({ transport: transport as unknown as typeof fetch });

    const resolved = await client.getSpec(TARGET_CONTRACT_ID);
    expect(resolved).toEqual(spec);
    expect(transport).toHaveBeenCalledWith("https://example.com/spec.json");
  });

  it("throws when the fetched blob's hash does not match the on-chain spec_hash", async () => {
    const spec = testSpec();
    const blob = JSON.stringify(spec, null, 2);
    const wrongHash = createHash("sha256").update("tampered").digest();

    installMockServer(
      routingSimulate({
        versions: ["1.0.0"],
        records: {
          "1.0.0": specRecordScVal({
            version: "1.0.0",
            specHash: wrongHash,
            pointer: "https://example.com/spec.json",
            publisher: PUBLISHER_ADDRESS,
          }),
        },
      }),
    );
    const transport = vi.fn().mockResolvedValue({ ok: true, text: async () => blob });
    const client = makeClient({ transport: transport as unknown as typeof fetch });

    await expect(client.getSpec(TARGET_CONTRACT_ID)).rejects.toThrow(/spec_hash mismatch/);
  });

  it("getSpecAt resolves the version whose published_at_ledger is <= the requested ledger", async () => {
    const specV1 = testSpec({ version: "1.0.0" });
    const specV2 = testSpec({ version: "2.0.0" });
    const blobV1 = JSON.stringify(specV1, null, 2);
    const blobV2 = JSON.stringify(specV2, null, 2);

    installMockServer(
      routingSimulate({
        versions: ["1.0.0", "2.0.0"],
        records: {
          "1.0.0": specRecordScVal({
            version: "1.0.0",
            specHash: createHash("sha256").update(canonicalizeSpec(specV1)).digest(),
            pointer: "https://example.com/v1.json",
            publisher: PUBLISHER_ADDRESS,
            publishedAtLedger: 100,
          }),
          "2.0.0": specRecordScVal({
            version: "2.0.0",
            specHash: createHash("sha256").update(canonicalizeSpec(specV2)).digest(),
            pointer: "https://example.com/v2.json",
            publisher: PUBLISHER_ADDRESS,
            publishedAtLedger: 200,
          }),
        },
      }),
    );
    const transport = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      text: async () => (url.includes("v1") ? blobV1 : blobV2),
    }));
    const client = makeClient({ transport: transport as unknown as typeof fetch });

    expect(await client.getSpecAt(TARGET_CONTRACT_ID, 150)).toEqual(specV1);
    expect(await client.getSpecAt(TARGET_CONTRACT_ID, 250)).toEqual(specV2);
    expect(await client.getSpecAt(TARGET_CONTRACT_ID, 50)).toBeNull();
  });

  it("getSpecByVersion resolves one specific published version", async () => {
    const specV1 = testSpec({ version: "1.0.0" });
    const specV2 = testSpec({ version: "2.0.0" });
    const blobV1 = JSON.stringify(specV1);
    const blobV2 = JSON.stringify(specV2);

    installMockServer(
      routingSimulate({
        versions: ["1.0.0", "2.0.0"],
        records: {
          "1.0.0": specRecordScVal({
            version: "1.0.0",
            specHash: createHash("sha256").update(canonicalizeSpec(specV1)).digest(),
            pointer: "https://example.com/v1.json",
            publisher: PUBLISHER_ADDRESS,
          }),
          "2.0.0": specRecordScVal({
            version: "2.0.0",
            specHash: createHash("sha256").update(canonicalizeSpec(specV2)).digest(),
            pointer: "https://example.com/v2.json",
            publisher: PUBLISHER_ADDRESS,
          }),
        },
      }),
    );
    const transport = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      text: async () => (url.includes("v1") ? blobV1 : blobV2),
    }));
    const client = makeClient({ transport: transport as unknown as typeof fetch });

    expect(await client.getSpecByVersion(TARGET_CONTRACT_ID, "1.0.0")).toEqual(specV1);
    expect(await client.getSpecByVersion(TARGET_CONTRACT_ID, "2.0.0")).toEqual(specV2);
  });

  it("getSpecByVersion returns null for a version that was never published", async () => {
    installMockServer(routingSimulate({ versions: ["1.0.0"], records: {} }));
    const client = makeClient();

    expect(await client.getSpecByVersion(TARGET_CONTRACT_ID, "9.9.9")).toBeNull();
  });

  it("getRecords returns every published version's on-chain record, without fetching or verifying blobs", async () => {
    const specHashV1 = createHash("sha256").update("v1").digest();
    const specHashV2 = createHash("sha256").update("v2").digest();
    installMockServer(
      routingSimulate({
        versions: ["1.0.0", "2.0.0"],
        records: {
          "1.0.0": specRecordScVal({
            version: "1.0.0",
            specHash: specHashV1,
            pointer: "https://example.com/v1.json",
            publisher: PUBLISHER_ADDRESS,
            publishedAtLedger: 100,
          }),
          "2.0.0": specRecordScVal({
            version: "2.0.0",
            specHash: specHashV2,
            pointer: "https://example.com/v2.json",
            publisher: PUBLISHER_ADDRESS,
            publishedAtLedger: 200,
          }),
        },
      }),
    );
    // No transport mock installed - getRecords must never call it, since it
    // does not fetch or hash-verify the pointed-at blob.
    const client = makeClient();

    const records = await client.getRecords(TARGET_CONTRACT_ID);

    expect(records).toHaveLength(2);
    expect(records.map((r) => r.version)).toEqual(["1.0.0", "2.0.0"]);
    expect(records[0]).toMatchObject({
      version: "1.0.0",
      specHash: specHashV1.toString("hex"),
      pointer: "https://example.com/v1.json",
      publishedAtLedger: 100,
    });
    expect(records[1]).toMatchObject({
      version: "2.0.0",
      specHash: specHashV2.toString("hex"),
      pointer: "https://example.com/v2.json",
      publishedAtLedger: 200,
    });
  });

  it("getRecords returns an empty array for a contract with no published versions", async () => {
    installMockServer(routingSimulate({ versions: [], records: {} }));
    const client = makeClient();

    expect(await client.getRecords(TARGET_CONTRACT_ID)).toEqual([]);
  });

  it("clears cached records and specs so a subsequent lookup re-reads the chain", async () => {
    const spec = testSpec();
    const blob = JSON.stringify(spec, null, 2);
    const simulate = routingSimulate({
      versions: ["1.0.0"],
      records: {
        "1.0.0": specRecordScVal({
          version: "1.0.0",
          specHash: createHash("sha256").update(canonicalizeSpec(spec)).digest(),
          pointer: "https://example.com/spec.json",
          publisher: PUBLISHER_ADDRESS,
        }),
      },
    });
    installMockServer(simulate);
    const transport = vi.fn().mockResolvedValue({ ok: true, text: async () => blob });
    const client = makeClient({ transport: transport as unknown as typeof fetch });

    await client.getSpec(TARGET_CONTRACT_ID);
    client.clearCache();
    await client.getSpec(TARGET_CONTRACT_ID);

    expect(simulate).toHaveBeenCalledTimes(4); // list_versions + get_version, twice total
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("caches resolved specs - a second getSpec call does not re-simulate", async () => {
    const spec = testSpec();
    const blob = JSON.stringify(spec, null, 2);
    const simulate = routingSimulate({
      versions: ["1.0.0"],
      records: {
        "1.0.0": specRecordScVal({
          version: "1.0.0",
          specHash: createHash("sha256").update(canonicalizeSpec(spec)).digest(),
          pointer: "https://example.com/spec.json",
          publisher: PUBLISHER_ADDRESS,
        }),
      },
    });
    installMockServer(simulate);
    const transport = vi.fn().mockResolvedValue({ ok: true, text: async () => blob });
    const client = makeClient({ transport: transport as unknown as typeof fetch });

    await client.getSpec(TARGET_CONTRACT_ID);
    await client.getSpec(TARGET_CONTRACT_ID);

    expect(simulate).toHaveBeenCalledTimes(2); // list_versions + get_version, once total
    expect(transport).toHaveBeenCalledTimes(1);
  });
});

describe("OnChainAbiRegistryClient archival", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws a restorable error, not null, when the RPC answers with a restore preamble", async () => {
    installMockServer(
      vi.fn().mockResolvedValue({
        result: { retval: xdr.ScVal.scvVoid() },
        restorePreamble: {
          minResourceFee: "9182736",
          transactionData: { toXDR: () => "AAAABase64RestoreData" },
        },
      }),
    );

    const client = makeClient();
    const error = await client.getSpec(TARGET_CONTRACT_ID).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RegistryEntryArchivedError);
    const archived = error as RegistryEntryArchivedError;
    expect(archived.contractId).toBe(TARGET_CONTRACT_ID);
    expect(archived.publisher).toBe(PUBLISHER_ADDRESS);
    expect(archived.fn).toBe("list_versions_paged");
    expect(archived.minResourceFee).toBe("9182736");
    expect(archived.restoreTransactionData).toBe("AAAABase64RestoreData");
    expect(archived.message).toContain("archived");
  });

  it("treats a simulation error naming an archived entry as restorable too", async () => {
    installMockServer(
      vi.fn().mockResolvedValue({
        error: "host invocation failed: entry archived: ContractData(...)",
      }),
    );

    const client = makeClient();
    await expect(client.getSpec(TARGET_CONTRACT_ID)).rejects.toBeInstanceOf(
      RegistryEntryArchivedError,
    );
  });

  it("keeps an unrelated simulation failure a plain error", async () => {
    installMockServer(vi.fn().mockResolvedValue({ error: "unreachable rpc endpoint" }));

    const client = makeClient();
    const error = await client.getSpec(TARGET_CONTRACT_ID).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(RegistryEntryArchivedError);
  });

  it("still reports a never-published contract as null rather than archived", async () => {
    installMockServer(routingSimulate({ versions: [], records: {} }));

    const client = makeClient();
    await expect(client.getSpec(TARGET_CONTRACT_ID)).resolves.toBeNull();
  });
});

describe("OnChainAbiRegistryClient - transport retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** A simulate that throws the way undici does - a bare Error, no cause - n times, then works. */
  function flakySimulate(failures: number, inner: ReturnType<typeof vi.fn>) {
    let seen = 0;
    return vi.fn().mockImplementation(async (...args: unknown[]) => {
      if (seen++ < failures) throw new Error("fetch failed");
      return inner(...args);
    });
  }

  it("survives a dropped connection and resolves on a later attempt", async () => {
    // Measured against the public testnet RPC: roughly one cold read in eight
    // fails this way. Five contracts per page then has about even odds of at
    // least one failing, which is what made the explorer report an empty
    // registry against a registry holding four specs.
    const simulate = flakySimulate(2, routingSimulate({ versions: [], records: {} }));
    installMockServer(simulate);

    expect(await makeClient().getSpec(TARGET_CONTRACT_ID)).toBeNull();
    expect(simulate).toHaveBeenCalledTimes(3);
  });

  it("gives up after the configured attempts and names the cause", async () => {
    const simulate = flakySimulate(99, vi.fn());
    installMockServer(simulate);

    await expect(makeClient({ transportRetries: 1 }).getSpec(TARGET_CONTRACT_ID)).rejects.toThrow(
      /RPC unreachable .* after 2 attempts/,
    );
    expect(simulate).toHaveBeenCalledTimes(2);
  });

  it("does not retry when the RPC answered", async () => {
    // A simulation error is deterministic - the same call fails the same way.
    // Retrying only multiplies the wait before reporting what was already
    // known, so it must propagate on the first attempt.
    const simulate = vi.fn().mockResolvedValue({ error: "some contract error" });
    installMockServer(simulate);

    await expect(makeClient().getSpec(TARGET_CONTRACT_ID)).rejects.toThrow(/simulation of/);
    expect(simulate).toHaveBeenCalledTimes(1);
  });
});

describe("OnChainAbiRegistryClient.listRegisteredContracts", () => {
  const OTHER_CONTRACT_ID = StrKey.encodeContract(Buffer.alloc(32, 9));
  const OTHER_PUBLISHER = Keypair.random().publicKey();

  it("returns one summary per contract, keeping the highest-ledger publication", async () => {
    const getLatestLedger = vi.fn().mockResolvedValue({ sequence: 50_000 });
    const getEvents = vi.fn().mockResolvedValue({
      events: [
        specPublishedEvent({
          contractId: TARGET_CONTRACT_ID,
          version: "2.0.0",
          specHash: sha("v2"),
          pointer: "https://example.com/v2.json",
          publisher: PUBLISHER_ADDRESS,
          ledger: 200,
        }),
        specPublishedEvent({
          contractId: TARGET_CONTRACT_ID,
          version: "1.0.0",
          specHash: sha("v1"),
          pointer: "https://example.com/v1.json",
          publisher: PUBLISHER_ADDRESS,
          ledger: 100,
        }),
      ],
      cursor: "",
      latestLedger: 50_000,
    });
    installMockEventsServer({ getEvents, getLatestLedger });

    const result = await makeClient().listRegisteredContracts();

    expect(result).toEqual([
      {
        contractId: TARGET_CONTRACT_ID,
        publisher: PUBLISHER_ADDRESS,
        latestVersion: "2.0.0",
        specHash: sha("v2").toString("hex"),
        pointer: "https://example.com/v2.json",
        publishedAtLedger: 200,
      },
    ]);
    expect(getEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        startLedger: 50_000 - 17_280,
        filters: [{ type: "contract", contractIds: [REGISTRY_CONTRACT_ID] }],
      }),
    );
  });

  it("clamps the scan start to ledger 1 on a young chain", async () => {
    const getLatestLedger = vi.fn().mockResolvedValue({ sequence: 1000 });
    const getEvents = vi.fn().mockResolvedValue({ events: [], cursor: "", latestLedger: 1000 });
    installMockEventsServer({ getEvents, getLatestLedger });

    await makeClient().listRegisteredContracts();

    expect(getEvents.mock.calls[0]![0]).toEqual(expect.objectContaining({ startLedger: 1 }));
  });

  it("filters out publications by a different publisher", async () => {
    const getLatestLedger = vi.fn().mockResolvedValue({ sequence: 1000 });
    const getEvents = vi.fn().mockResolvedValue({
      events: [
        specPublishedEvent({
          contractId: OTHER_CONTRACT_ID,
          version: "1.0.0",
          specHash: sha("other"),
          pointer: "https://example.com/other.json",
          publisher: OTHER_PUBLISHER,
          ledger: 150,
        }),
      ],
      cursor: "",
      latestLedger: 1000,
    });
    installMockEventsServer({ getEvents, getLatestLedger });
    const client = makeClient();

    expect(await client.listRegisteredContracts()).toEqual([]);
    expect(await client.listRegisteredContracts({ publisher: OTHER_PUBLISHER })).toHaveLength(1);
  });

  it("skips the registry's other events", async () => {
    const getLatestLedger = vi.fn().mockResolvedValue({ sequence: 1000 });
    const getEvents = vi.fn().mockResolvedValue({
      events: ["worker_registered", "operator_registered"].map((eventName, i) =>
        specPublishedEvent({
          contractId: OTHER_CONTRACT_ID,
          version: "1.0.0",
          specHash: sha(eventName),
          pointer: "https://example.com/x.json",
          publisher: PUBLISHER_ADDRESS,
          ledger: 150 + i,
          eventName,
        }),
      ),
      cursor: "",
      latestLedger: 1000,
    });
    installMockEventsServer({ getEvents, getLatestLedger });

    expect(await makeClient().listRegisteredContracts()).toEqual([]);
  });

  it("pages through getEvents with the returned cursor until a short page", async () => {
    const getLatestLedger = vi.fn().mockResolvedValue({ sequence: 1000 });
    const page1 = [0, 1].map((i) =>
      specPublishedEvent({
        contractId: TARGET_CONTRACT_ID,
        version: `1.${i}.0`,
        specHash: sha(`p1-${i}`),
        pointer: `https://example.com/p1-${i}.json`,
        publisher: PUBLISHER_ADDRESS,
        ledger: 100 + i,
      }),
    );
    const getEvents = vi
      .fn()
      .mockResolvedValueOnce({ events: page1, cursor: "cursor-1", latestLedger: 1000 })
      .mockResolvedValueOnce({
        events: [
          specPublishedEvent({
            contractId: OTHER_CONTRACT_ID,
            version: "1.0.0",
            specHash: sha("p2"),
            pointer: "https://example.com/p2.json",
            publisher: PUBLISHER_ADDRESS,
            ledger: 300,
          }),
        ],
        cursor: "cursor-2",
        latestLedger: 1000,
      });
    installMockEventsServer({ getEvents, getLatestLedger });

    const result = await makeClient().listRegisteredContracts({ pageLimit: 2 });

    expect(getEvents).toHaveBeenCalledTimes(2);
    const second = getEvents.mock.calls[1]![0];
    expect(second).toEqual(expect.objectContaining({ cursor: "cursor-1" }));
    expect(second).not.toHaveProperty("startLedger");
    expect(result.map((r) => r.contractId)).toEqual([TARGET_CONTRACT_ID, OTHER_CONTRACT_ID].sort());
    expect(result.find((r) => r.contractId === TARGET_CONTRACT_ID)?.latestVersion).toBe("1.1.0");
  });

  it("stops paging when the RPC hands back the same cursor", async () => {
    const getLatestLedger = vi.fn().mockResolvedValue({ sequence: 1000 });
    const full = [0, 1].map((i) =>
      specPublishedEvent({
        contractId: TARGET_CONTRACT_ID,
        version: `1.${i}.0`,
        specHash: sha(`s-${i}`),
        pointer: `https://example.com/s-${i}.json`,
        publisher: PUBLISHER_ADDRESS,
        ledger: 100 + i,
      }),
    );
    const getEvents = vi
      .fn()
      .mockResolvedValue({ events: full, cursor: "stuck", latestLedger: 1000 });
    installMockEventsServer({ getEvents, getLatestLedger });

    await makeClient().listRegisteredContracts({ pageLimit: 2 });

    expect(getEvents).toHaveBeenCalledTimes(2);
  });
});
