import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { xdr } from "@stellar/stellar-sdk";
import {
  GalexieHistoricalSource,
  GalexieSourceError,
  galexieObjectKey,
  formatEventId,
  parseEventId,
} from "../src/GalexieHistoricalSource.js";
import type { GalexieExportLayout } from "../src/GalexieHistoricalSource.js";
import { SorobanRpcError } from "../src/errors.js";
import { EventEngine } from "../src/EventEngine.js";
import type { SorobanEvent, SorobanRpcLike } from "../src/SorobanSubscriber.js";

/**
 * Fixture: mainnet ledger 65655346 exactly as the public Galexie export
 * serves it (AWS Open Data, `v1.1/stellar/ledgers/pubnet`), re-compressed
 * from zstd to brotli so it decodes on every Node version CI runs.
 *
 * Golden: mainnet RPC's own `getEvents` answer for the same ledger, in both
 * formats, kept as SHA-256 hashes of the full response plus a few events
 * verbatim. See the `source` field in the golden file.
 */
const FIXTURES = fileURLToPath(new URL("./fixtures/galexie/", import.meta.url));
const LEDGER = 65655346;
const RAW_XDR = zlib.brotliDecompressSync(readFileSync(`${FIXTURES}${LEDGER}.xdr.br`));
const GOLDEN = JSON.parse(readFileSync(`${FIXTURES}${LEDGER}.rpc-golden.json`, "utf8"));

const BASE_URL = "https://example.test/v1.1/stellar/ledgers/pubnet";
const PUBNET = "Public Global Stellar Network ; September 2015";
const CONFIG_JSON = {
  networkPassphrase: PUBNET,
  version: "1.0",
  compression: "zstd",
  ledgersPerBatch: 1,
  batchesPerPartition: 64000,
};
const LAYOUT: GalexieExportLayout = { ledgersPerFile: 1, filesPerPartition: 64000 };
/** The XLM Stellar Asset Contract on mainnet; it emits this ledger's fee events. */
const XLM_SAC = "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA";

/** Decoding a real mainnet ledger takes about a second; leave room on a loaded CI runner. */
const SLOW = { timeout: 30_000 };

const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const symbolTopic = (name: string) => xdr.ScVal.scvSymbol(name).toXDR("base64");

/** Serves `.config.json` and the fixture ledger; every other object is a 404. Objects are stored uncompressed. */
function fakeExport(ledgers: Record<number, Uint8Array> = { [LEDGER]: RAW_XDR }) {
  const calls: string[] = [];
  const objects = new Map<string, Uint8Array>();
  for (const [seq, bytes] of Object.entries(ledgers)) {
    objects.set(`${BASE_URL}/${galexieObjectKey(Number(seq), LAYOUT)}`, bytes);
  }
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url === `${BASE_URL}/.config.json`) {
      return new Response(JSON.stringify(CONFIG_JSON), { status: 200 });
    }
    const body = objects.get(url);
    return body ? new Response(body, { status: 200 }) : new Response("not found", { status: 404 });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

function makeSource(
  overrides: Partial<ConstructorParameters<typeof GalexieHistoricalSource>[0]> = {},
  ledgers?: Record<number, Uint8Array>,
) {
  const { fetchImpl, calls } = fakeExport(ledgers);
  const source = new GalexieHistoricalSource({
    baseUrl: BASE_URL,
    fetch: fetchImpl,
    decompress: (data) => data,
    ...overrides,
  });
  return { source, calls };
}

const allEvents = (source: GalexieHistoricalSource, xdrFormat: "base64" | "json") =>
  source.getEvents({
    startLedger: LEDGER,
    endLedger: LEDGER + 1,
    pagination: { limit: 10_000 },
    xdrFormat,
  });

describe("GalexieHistoricalSource matches mainnet RPC getEvents", SLOW, () => {
  it("returns the same events as RPC in base64 format, byte for byte", async () => {
    const { source } = makeSource();
    const { events } = await allEvents(source, "base64");

    expect(events).toHaveLength(GOLDEN.count);
    expect(events[0]).toEqual(GOLDEN.samples.firstBase64);
    expect(events.at(-1)).toEqual(GOLDEN.samples.lastBase64);
    expect(sha256(events)).toBe(GOLDEN.sha256.base64);
  });

  it("returns the same events as RPC in json format, including SEP-51 string escapes", async () => {
    const { source } = makeSource();
    const { events } = await allEvents(source, "json");

    expect(events).toHaveLength(GOLDEN.count);
    expect(events[0]).toEqual(GOLDEN.samples.firstJson);
    expect(events.find((e) => e.id === GOLDEN.samples.escapedStringJson.id)).toEqual(
      GOLDEN.samples.escapedStringJson,
    );
    expect(sha256(events)).toBe(GOLDEN.sha256.json);
  });

  it("defaults to json, like SorobanRpcClient and RPC itself", async () => {
    const { source } = makeSource();
    const { events } = await source.getEvents({ startLedger: LEDGER, endLedger: LEDGER + 1 });
    expect(events[0]).toEqual(GOLDEN.samples.firstJson);
  });

  it("reads the real zstd object with node:zlib when this Node has zstd", async () => {
    if (typeof (zlib as { zstdCompressSync?: unknown }).zstdCompressSync !== "function") return;
    const zstd = (zlib as unknown as { zstdCompressSync: (b: Uint8Array) => Buffer })
      .zstdCompressSync;
    const { fetchImpl } = fakeExport({ [LEDGER]: zstd(RAW_XDR) });
    const source = new GalexieHistoricalSource({ baseUrl: BASE_URL, fetch: fetchImpl });
    const { events } = await allEvents(source, "base64");
    expect(sha256(events)).toBe(GOLDEN.sha256.base64);
  });
});

describe("paging and cursors", SLOW, () => {
  it("pages with RPC cursors: last event id on a full page, end of the window otherwise", async () => {
    const { source } = makeSource();
    const seen: unknown[] = [];
    let page = await source.getEvents({
      startLedger: LEDGER,
      endLedger: LEDGER + 1,
      pagination: { limit: 100 },
      xdrFormat: "base64",
    });
    for (;;) {
      seen.push(...page.events);
      if (page.events.length < 100) break;
      expect(page.cursor).toBe(page.events.at(-1)!.id);
      page = await source.getEvents({
        pagination: { cursor: page.cursor, limit: 100 },
        xdrFormat: "base64",
      });
    }
    expect(seen).toHaveLength(GOLDEN.count);
    expect(sha256(seen)).toBe(GOLDEN.sha256.base64);
    // Short page: the cursor is the end of the scanned window, as RPC returns.
    expect(page.cursor).toBe(
      formatEventId({ ledger: LEDGER, tx: 0xfffff, op: 0xfff, event: 0xffffffff }),
    );
  });

  it("downloads a ledger once while paging through it", async () => {
    const { source, calls } = makeSource();
    let cursor: string | undefined;
    for (let i = 0; i < 3; i++) {
      const page = await source.getEvents(
        cursor
          ? { pagination: { cursor, limit: 50 }, xdrFormat: "base64" }
          : {
              startLedger: LEDGER,
              endLedger: LEDGER + 1,
              pagination: { limit: 50 },
              xdrFormat: "base64",
            },
      );
      cursor = page.cursor;
    }
    // Three pages inside one ledger: one download, and no look-ahead past it.
    expect(calls.filter((u) => u.endsWith(".xdr.zst"))).toEqual([
      `${BASE_URL}/${galexieObjectKey(LEDGER, LAYOUT)}`,
    ]);
  });

  it("stops at the newest exported ledger and returns a cursor at the last one it read", async () => {
    const { source } = makeSource();
    const page = await source.getEvents({ startLedger: LEDGER, xdrFormat: "base64" });
    // No endLedger: the scan runs into ledger LEDGER+1, which the export does not have.
    expect(page.events).toHaveLength(100);
    const rest = await source.getEvents({
      pagination: { cursor: page.cursor, limit: 10_000 },
      xdrFormat: "base64",
    });
    expect(rest.events).toHaveLength(GOLDEN.count - 100);
    expect(rest.cursor).toBe(
      formatEventId({ ledger: LEDGER, tx: 0xfffff, op: 0xfff, event: 0xffffffff }),
    );
  });

  it("throws when the start ledger is not in the export", async () => {
    const { source } = makeSource();
    await expect(source.getEvents({ startLedger: LEDGER - 1 })).rejects.toThrow(
      /ledger 65655345 is not in the export/,
    );
  });

  it("rejects requests RPC rejects", async () => {
    const { source } = makeSource();
    await expect(source.getEvents({})).rejects.toThrow(/startLedger must be positive/);
    await expect(
      source.getEvents({ startLedger: LEDGER, pagination: { cursor: "0-0" } }),
    ).rejects.toThrow(/cannot both be set/);
    await expect(
      source.getEvents({ startLedger: LEDGER, pagination: { limit: 10_001 } }),
    ).rejects.toThrow(/limit/);
  });

  it("round-trips event ids", () => {
    const c = { ledger: LEDGER, tx: 25, op: 3, event: 7 };
    expect(parseEventId(formatEventId(c))).toEqual(c);
    expect(parseEventId(GOLDEN.samples.transferBase64.id)).toMatchObject({ ledger: LEDGER });
  });
});

describe("filters", SLOW, () => {
  const ids = (events: SorobanEvent[]) => events.map((e) => e.id);
  // One source for the block: it keeps the decoded ledger, so each case decodes nothing.
  const { source } = makeSource();
  const run = async (filters: unknown[]) => {
    const { events } = await source.getEvents({
      startLedger: LEDGER,
      endLedger: LEDGER + 1,
      pagination: { limit: 10_000 },
      xdrFormat: "base64",
      filters: filters as never,
    });
    return events;
  };

  it("filters by contract id", async () => {
    const events = await run([{ contractIds: [XLM_SAC] }]);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => e.contractId === XLM_SAC)).toBe(true);
  });

  it("matches RPC topic patterns, with * and a trailing **", async () => {
    const transfer = symbolTopic("transfer");
    const exact4 = await run([{ topics: [[transfer, "*", "*", "*"]] }]);
    const anyLength = await run([{ topics: [[transfer, "**"]] }]);
    const all = await run([]);
    const expected = all.filter((e) => e.topic[0] === transfer);
    expect(ids(anyLength)).toEqual(ids(expected));
    expect(ids(exact4)).toEqual(ids(expected.filter((e) => e.topic.length === 4)));
    expect(ids(anyLength)).toContain(GOLDEN.samples.transferBase64.id);
  });

  it("accepts pulse-core's topicFilters form, with null as a wildcard", async () => {
    const fee = symbolTopic("fee");
    const viaTopicFilters = await run([{ topicFilters: [fee, null] }]);
    const viaTopics = await run([{ topics: [[fee, "*"]] }]);
    expect(viaTopicFilters.length).toBeGreaterThan(0);
    expect(ids(viaTopicFilters)).toEqual(ids(viaTopics));
  });

  it("maps pulse-core's contract.emitted / contract.invoked onto RPC's contract / system", async () => {
    const emitted = await run([{ type: "contract.emitted" }]);
    const contract = await run([{ type: "contract" }]);
    const system = await run([{ type: "contract.invoked" }]);
    expect(ids(emitted)).toEqual(ids(contract));
    expect(emitted).toHaveLength(GOLDEN.count);
    expect(system).toHaveLength(0);
  });

  it("matches an event when any filter matches", async () => {
    const fee = symbolTopic("fee");
    const transfer = symbolTopic("transfer");
    const both = await run([{ topics: [[fee, "**"]] }, { topics: [[transfer, "**"]] }]);
    const fees = await run([{ topics: [[fee, "**"]] }]);
    const transfers = await run([{ topics: [[transfer, "**"]] }]);
    expect(both).toHaveLength(fees.length + transfers.length);
  });
});

describe("export layout", SLOW, () => {
  it("builds the object key the public mainnet export uses", () => {
    // Observed in the AWS Open Data bucket listing.
    expect(galexieObjectKey(65685169, LAYOUT)).toBe(
      "FC160BFF--65664000-65727999/FC15B94E--65685169.xdr.zst",
    );
  });

  it("handles multi-ledger files, no partitions, and the older zstd extension", () => {
    expect(galexieObjectKey(130, { ledgersPerFile: 64, filesPerPartition: 10 })).toBe(
      "FFFFFFFF--0-639/FFFFFF7F--128-191.xdr.zst",
    );
    expect(
      galexieObjectKey(5, { ledgersPerFile: 1, filesPerPartition: 1, fileExtension: "zstd" }),
    ).toBe("FFFFFFFA--5.xdr.zstd");
  });

  it("reads the layout from .config.json once", async () => {
    const { source, calls } = makeSource();
    await allEvents(source, "base64");
    await allEvents(source, "base64");
    expect(calls.filter((u) => u.endsWith(".config.json"))).toHaveLength(1);
  });

  it("refuses an export taken from a different network", async () => {
    const { source } = makeSource({ networkPassphrase: "Test SDF Network ; September 2015" });
    await expect(allEvents(source, "base64")).rejects.toThrow(GalexieSourceError);
    await expect(allEvents(source, "base64")).rejects.toThrow(/Public Global Stellar Network/);
  });

  it("says what to do when the export is not zstd and no decompress is given", async () => {
    const { fetchImpl } = fakeExport();
    const source = new GalexieHistoricalSource({
      baseUrl: BASE_URL,
      fetch: fetchImpl,
      layout: { ...LAYOUT, compression: "lz4" },
    });
    await expect(allEvents(source, "base64")).rejects.toThrow(/pass a decompress function/);
  });

  it("reports covered ledgers from its configured bounds without a network call", () => {
    const { source, calls } = makeSource({ earliestLedger: 1000, latestLedger: 2000 });
    expect(source.covers(999)).toBe(false);
    expect(source.covers(1000)).toBe(true);
    expect(source.covers(2000)).toBe(true);
    expect(source.covers(2001)).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("replayContracts with a Galexie historical source", SLOW, () => {
  it("continues a replay past RPC retention from the export", async () => {
    const outOfRetention = new SorobanRpcError(
      "startLedger must be within the ledger range: 65680000 - 65700000",
      { code: "invalid_request", retryable: false },
    );
    const primary: SorobanRpcLike = {
      getEvents: vi.fn(async () => {
        throw outOfRetention;
      }),
      getLatestLedger: vi.fn(async () => 65700000),
    };
    const { source } = makeSource();

    const engine = new EventEngine({ network: "mainnet" });
    const delivered: SorobanEvent[] = [];
    let done = false;
    const subscriber = engine.replayContracts({
      rpc: primary,
      historicalSource: source,
      startLedger: LEDGER,
      endLedger: LEDGER + 1,
      pageSize: 200,
      onEvent: async (event) => {
        delivered.push(event);
      },
      onDone: () => {
        done = true;
      },
    });
    for (let i = 0; i < 20 && !done; i++) await subscriber.pollOnce();

    expect(done).toBe(true);
    expect(primary.getEvents).toHaveBeenCalledTimes(1);
    // Every event of the ledger, in RPC's order. (replayContracts does not
    // pass its `filters` option to the subscriber, so the replay is unfiltered.)
    expect(delivered).toHaveLength(GOLDEN.count);
    expect(delivered[0]!.id).toBe(GOLDEN.samples.firstJson.id);
    expect(delivered.at(-1)!.id).toBe(GOLDEN.samples.lastBase64.id);
  });
});
