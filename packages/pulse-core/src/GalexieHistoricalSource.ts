/**
 * A {@link HistoricalSource} that reads contract events from a Galexie
 * ledger export (SEP-54 layout) instead of a Soroban RPC.
 *
 * Soroban RPC keeps about seven days of events. A Galexie export keeps every
 * ledger, so it can replay ranges no RPC still has. One public export is the
 * AWS Open Data copy of mainnet:
 * `https://aws-public-blockchain.s3.us-east-2.amazonaws.com/v1.1/stellar/ledgers/pubnet`.
 *
 * `getEvents` answers in the same shape as Stellar RPC's `getEvents`, so it
 * plugs into `EventEngine.replayContracts({ historicalSource })` and the
 * existing decode path unchanged. That covers the event IDs and their order,
 * the cursors, the scan window, `xdrFormat: "base64"` and `"json"`, and filter
 * matching. Event extraction follows stellar-rpc's own ingestion: per ledger,
 * every transaction's before-all-txs events, then each transaction's
 * per-operation and after-tx events, then every after-all-txs event.
 * The output was compared with mainnet RPC for every event in seven ledgers
 * and was identical in both formats.
 *
 * Cost: an export has no index, so a scan downloads one object per ledger
 * (about 200 KB compressed on mainnet today) whether or not it holds a
 * matching event. Like RPC, one call scans at most `ledgerScanLimit` ledgers
 * (10,000 by default, about 2 GB of downloads when nothing matches). Narrow
 * replays are cheap and long sparse ones are not. Lower the limit, or replay
 * shorter ranges, if that matters.
 */
import * as zlib from "node:zlib";
import { StrKey, xdr } from "@stellar/stellar-sdk";
import type { HistoricalSource } from "./HistoricalSource.js";
import type { SorobanEvent } from "./SorobanSubscriber.js";
import type {
  GetEventsOptions,
  SorobanGetEventsParams,
  SorobanRpcCallOptions,
  SorobanRpcEvent,
} from "./SorobanRpcClient.js";
import type { ContractSubscriptionFilter } from "./index.js";
import { scValToXdrJson } from "./xdrJson.js";

/** How objects are laid out in a Galexie export (its `.config.json`). */
export interface GalexieExportLayout {
  /** Ledgers in each object. 1 for the public mainnet export. */
  ledgersPerFile: number;
  /** Objects in each partition folder. A value of 1 means no partition folders. */
  filesPerPartition: number;
  /** Object extension after `.xdr.`. Defaults to `"zst"`; older exports used `"zstd"`. */
  fileExtension?: string;
  /** Network the export was taken from, when known. */
  networkPassphrase?: string;
  /** Compression named by the export. Only `"zstd"` is read without a custom `decompress`. */
  compression?: string;
}

/** Options for {@link GalexieHistoricalSource}. */
export interface GalexieHistoricalSourceConfig {
  /** URL of the export folder, the one holding `.config.json`. No trailing slash needed. */
  baseUrl: string;
  /**
   * The export's layout. When omitted it is read once from `<baseUrl>/.config.json`.
   */
  layout?: GalexieExportLayout;
  /**
   * Refuse to read an export whose `.config.json` names a different network,
   * so a testnet export is never replayed as mainnet.
   */
  networkPassphrase?: string;
  /** Fetch implementation. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /**
   * Decompresses one object. Defaults to `node:zlib`'s zstd, available from
   * Node 22.15 and 23.8. On older Node pass one, for example `fzstd`'s
   * `decompress`.
   */
  decompress?: (data: Uint8Array) => Uint8Array;
  /** First ledger the export holds, for {@link GalexieHistoricalSource.covers}. Defaults to 2. */
  earliestLedger?: number;
  /** Last ledger the export holds, for {@link GalexieHistoricalSource.covers}. Defaults to no bound. */
  latestLedger?: number;
  /** Most ledgers one `getEvents` call scans. Defaults to 10,000, the same as Stellar RPC. */
  ledgerScanLimit?: number;
  /** Objects downloaded in parallel during a scan. Defaults to 8. */
  concurrency?: number;
}

/** Thrown when the export cannot serve a request. */
export class GalexieSourceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(`[pulse-core] GalexieHistoricalSource: ${message}`, options);
    this.name = "GalexieSourceError";
  }
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 10_000;
const DEFAULT_LEDGER_SCAN_LIMIT = 10_000;
const DEFAULT_CONCURRENCY = 8;
const MAX_UINT32 = 0xffffffff;
/** toid's transaction and operation field masks, the sentinels RPC uses for stage events. */
const TX_MASK = 0xfffff;
const OP_MASK = 0xfff;

/** A position in the event stream, as encoded in an event ID. */
interface Cursor {
  ledger: number;
  tx: number;
  op: number;
  event: number;
}

function cmpCursor(a: Cursor, b: Cursor): number {
  return a.ledger - b.ledger || a.tx - b.tx || a.op - b.op || a.event - b.event;
}

/** Formats a cursor the way Stellar RPC does: `%019d-%010d` of toid and event index. */
export function formatEventId(c: Cursor): string {
  const toid = (BigInt(c.ledger) << 32n) | (BigInt(c.tx) << 12n) | BigInt(c.op);
  return `${toid.toString().padStart(19, "0")}-${c.event.toString().padStart(10, "0")}`;
}

/** Parses an RPC event ID or cursor. */
export function parseEventId(id: string): Cursor {
  const match = /^(\d+)-(\d+)$/.exec(id);
  if (!match) throw new GalexieSourceError(`invalid event id ${id}`);
  const toid = BigInt(match[1]!);
  return {
    ledger: Number(toid >> 32n),
    tx: Number((toid >> 12n) & BigInt(TX_MASK)),
    op: Number(toid & BigInt(OP_MASK)),
    event: Number(match[2]!),
  };
}

/** The object key holding `ledger`, per the Galexie datastore schema. */
export function galexieObjectKey(ledger: number, layout: GalexieExportLayout): string {
  const perFile = layout.ledgersPerFile;
  const partitionSize = perFile * layout.filesPerPartition;
  const hex = (n: number) => (MAX_UINT32 - n).toString(16).toUpperCase().padStart(8, "0");
  let key = "";
  if (layout.filesPerPartition > 1 && partitionSize <= MAX_UINT32) {
    const start = Math.floor(ledger / partitionSize) * partitionSize;
    const end = Math.min(start + partitionSize - 1, MAX_UINT32);
    key = `${hex(start)}--${start}-${end}/`;
  }
  const fileStart = Math.floor(ledger / perFile) * perFile;
  const fileEnd = Math.min(fileStart + perFile - 1, MAX_UINT32);
  key += `${hex(fileStart)}--${fileStart}`;
  if (fileStart !== fileEnd) key += `-${fileEnd}`;
  return `${key}.xdr.${layout.fileExtension ?? "zst"}`;
}

/** One contract event with its stream position, before rendering. */
interface LedgerEvent {
  cursor: Cursor;
  event: xdr.ContractEvent;
  txHash: string;
}

interface DecodedLedger {
  sequence: number;
  closedAt: string;
  events: LedgerEvent[];
}

type StageName =
  | "transactionEventStageBeforeAllTxes"
  | "transactionEventStageAfterTx"
  | "transactionEventStageAfterAllTxes";

const KNOWN_STAGES = new Set<string>([
  "transactionEventStageBeforeAllTxes",
  "transactionEventStageAfterTx",
  "transactionEventStageAfterAllTxes",
]);

interface TxEvents {
  hash: string;
  /** Top-level transaction events (meta v4). */
  txEvents: xdr.TransactionEvent[];
  /** Per-operation events. For meta v3, the Soroban events as operation 0. */
  opEvents: xdr.ContractEvent[][];
}

function txEventsFromMeta(meta: xdr.TransactionMeta, hash: string): TxEvents {
  switch (meta.switch()) {
    case 0:
    case 1:
    case 2:
      return { hash, txEvents: [], opEvents: [] };
    case 3: {
      const soroban = meta.v3().sorobanMeta();
      return { hash, txEvents: [], opEvents: soroban ? [soroban.events()] : [] };
    }
    case 4: {
      const v4 = meta.v4();
      return { hash, txEvents: v4.events(), opEvents: v4.operations().map((op) => op.events()) };
    }
    default:
      throw new GalexieSourceError(`unsupported TransactionMeta version ${meta.switch()}`);
  }
}

/**
 * Lists a ledger's contract events in Stellar RPC's cursor order, with the
 * same cursor positions RPC assigns (stellar-rpc `PayloadsFromLedgerEvents`).
 */
export function extractLedgerEvents(lcm: xdr.LedgerCloseMeta): DecodedLedger {
  const v = lcm.value() as xdr.LedgerCloseMetaV0 | xdr.LedgerCloseMetaV1 | xdr.LedgerCloseMetaV2;
  const header = v.ledgerHeader().header();
  const sequence = header.ledgerSeq();
  const closeTime = Number(header.scpValue().closeTime().toString());
  const closedAt = new Date(closeTime * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");

  const txs = (
    v.txProcessing() as Array<xdr.TransactionResultMeta | xdr.TransactionResultMetaV1>
  ).map((tp) =>
    txEventsFromMeta(tp.txApplyProcessing(), tp.result().transactionHash().toString("hex")),
  );

  for (const tx of txs) {
    for (const te of tx.txEvents) {
      if (!KNOWN_STAGES.has(te.stage().name)) {
        throw new GalexieSourceError(`unknown transaction event stage ${te.stage().name}`);
      }
    }
  }

  const events: LedgerEvent[] = [];
  const pushStage = (
    tx: TxEvents,
    stage: StageName,
    position: { tx: number; op: number },
    counter: { n: number },
  ) => {
    for (const te of tx.txEvents) {
      if (te.stage().name !== stage) continue;
      events.push({
        cursor: { ledger: sequence, tx: position.tx, op: position.op, event: counter.n++ },
        event: te.event(),
        txHash: tx.hash,
      });
    }
  };

  // 1. Every transaction's before-all-txs events, at (0, 0), counted ledger-wide.
  const before = { n: 0 };
  for (const tx of txs)
    pushStage(tx, "transactionEventStageBeforeAllTxes", { tx: 0, op: 0 }, before);

  // 2. Per transaction (1-based apply order): its operation events, then its after-tx events at (tx, OP_MASK).
  txs.forEach((tx, i) => {
    const txIndex = i + 1;
    tx.opEvents.forEach((opEvents, opIndex) => {
      opEvents.forEach((event, eventIndex) => {
        events.push({
          cursor: { ledger: sequence, tx: txIndex, op: opIndex, event: eventIndex },
          event,
          txHash: tx.hash,
        });
      });
    });
    pushStage(tx, "transactionEventStageAfterTx", { tx: txIndex, op: OP_MASK }, { n: 0 });
  });

  // 3. Every transaction's after-all-txs events, at (TX_MASK, 0), counted ledger-wide.
  const after = { n: 0 };
  for (const tx of txs)
    pushStage(tx, "transactionEventStageAfterAllTxes", { tx: TX_MASK, op: 0 }, after);

  return { sequence, closedAt, events };
}

const EVENT_TYPE_NAMES: Record<string, string> = {
  contract: "contract",
  system: "system",
  diagnostic: "diagnostic",
};

/** Renders one event exactly as Stellar RPC's `getEvents` does, including field order and omitted empty fields. */
function renderEvent(
  ledger: DecodedLedger,
  item: LedgerEvent,
  xdrFormat: "base64" | "json",
): SorobanRpcEvent {
  const ev = item.event;
  const body = ev.body().v0();
  const contractId = ev.contractId();
  const out: SorobanRpcEvent = {
    type: EVENT_TYPE_NAMES[ev.type().name] ?? ev.type().name,
    ledger: ledger.sequence,
    ledgerClosedAt: ledger.closedAt,
    contractId: contractId
      ? StrKey.encodeContract(Buffer.from(contractId as unknown as Uint8Array))
      : "",
    id: formatEventId(item.cursor),
    operationIndex: item.cursor.op,
    transactionIndex: item.cursor.tx,
    txHash: item.txHash,
  };
  const topics = body.topics();
  if (xdrFormat === "json") {
    if (topics.length > 0) out.topicJson = topics.map(scValToXdrJson);
    out.valueJson = scValToXdrJson(body.data());
  } else {
    if (topics.length > 0) out.topic = topics.map((t) => t.toXDR("base64"));
    out.value = body.data().toXDR("base64");
  }
  return out;
}

/** A compiled topic pattern: `null` matches any one segment; `trailingAny` is a final `**`. */
interface TopicPattern {
  segments: Array<Buffer | null>;
  trailingAny: boolean;
}

interface CompiledFilter {
  types: Set<string> | null;
  contractIds: Set<string> | null;
  topics: TopicPattern[] | null;
}

type AnyFilter = ContractSubscriptionFilter & {
  topics?: Array<Array<string | null>>;
  contractIds?: string[];
  type?: string;
};

/** `contract.emitted` / `contract.invoked` are pulse-core's names for RPC's `contract` / `system`. */
const TYPE_ALIASES: Record<string, string> = {
  contract: "contract",
  "contract.emitted": "contract",
  system: "system",
  "contract.invoked": "system",
  diagnostic: "diagnostic",
};

function compileTopicPattern(pattern: ReadonlyArray<string | null>): TopicPattern {
  const trailingAny = pattern.length > 0 && pattern[pattern.length - 1] === "**";
  const segments = (trailingAny ? pattern.slice(0, -1) : pattern).map((segment) => {
    if (segment === null || segment === "*" || segment === "**") return null;
    return Buffer.from(segment, "base64");
  });
  return { segments, trailingAny };
}

function compileFilters(filters: ReadonlyArray<AnyFilter> | undefined): CompiledFilter[] {
  return (filters ?? []).map((f) => {
    let types: Set<string> | null = null;
    if (f.type) {
      types = new Set(
        String(f.type)
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .map((t) => {
            const name = TYPE_ALIASES[t];
            if (!name) throw new GalexieSourceError(`unknown event type filter "${t}"`);
            return name;
          }),
      );
    }
    const contractIds =
      f.contractIds && f.contractIds.length > 0 ? new Set<string>(f.contractIds) : null;
    const patterns: TopicPattern[] = [];
    for (const p of f.topics ?? []) patterns.push(compileTopicPattern(p));
    if (f.topicFilters && f.topicFilters.length > 0) {
      patterns.push(compileTopicPattern(f.topicFilters));
    }
    return { types, contractIds, topics: patterns.length > 0 ? patterns : null };
  });
}

function topicMatches(pattern: TopicPattern, topics: Buffer[]): boolean {
  if (pattern.trailingAny) {
    if (topics.length < pattern.segments.length) return false;
  } else if (topics.length !== pattern.segments.length) {
    return false;
  }
  return pattern.segments.every((seg, i) => seg === null || seg.equals(topics[i]!));
}

function eventMatches(filters: CompiledFilter[], ev: xdr.ContractEvent): boolean {
  if (filters.length === 0) return true;
  const type = EVENT_TYPE_NAMES[ev.type().name] ?? ev.type().name;
  const cid = ev.contractId();
  const contractId = cid ? StrKey.encodeContract(Buffer.from(cid as unknown as Uint8Array)) : "";
  let topics: Buffer[] | undefined;
  return filters.some((f) => {
    if (f.types && !f.types.has(type)) return false;
    if (f.contractIds && !f.contractIds.has(contractId)) return false;
    if (!f.topics) return true;
    topics ??= ev
      .body()
      .v0()
      .topics()
      .map((t) => t.toXDR());
    return f.topics.some((p) => topicMatches(p, topics!));
  });
}

interface NormalizedRequest {
  startLedger?: number;
  endLedger?: number;
  cursor?: string;
  limit: number;
  filters: AnyFilter[];
  xdrFormat: "base64" | "json";
  signal?: AbortSignal;
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return (
    typeof value === "object" &&
    value !== null &&
    "aborted" in value &&
    typeof (value as AbortSignal).addEventListener === "function"
  );
}

/**
 * Accepts both `getEvents` call forms `SorobanRpcClient` supports: the
 * params object `SorobanSubscriber` uses, and the older positional form.
 */
function normalizeRequest(
  first: string | SorobanGetEventsParams | undefined,
  second: number | SorobanRpcCallOptions | undefined,
  third: AbortSignal | GetEventsOptions | undefined,
  fourth: ContractSubscriptionFilter[] | undefined,
  fifth: GetEventsOptions | AbortSignal | undefined,
): NormalizedRequest {
  if (typeof first === "object" && first !== null) {
    const p = first;
    const options = typeof second === "object" && second !== null ? second : undefined;
    return {
      ...(p.startLedger !== undefined ? { startLedger: p.startLedger } : {}),
      ...((p as { endLedger?: number }).endLedger !== undefined
        ? { endLedger: (p as { endLedger?: number }).endLedger! }
        : {}),
      ...((p.pagination?.cursor ?? p.cursor ?? p.startCursor) !== undefined
        ? { cursor: (p.pagination?.cursor ?? p.cursor ?? p.startCursor)! }
        : {}),
      limit: p.pagination?.limit ?? p.limit ?? DEFAULT_LIMIT,
      filters: (p.filters ?? []) as AnyFilter[],
      xdrFormat: p.xdrFormat ?? "json",
      ...(options?.signal ? { signal: options.signal } : {}),
    };
  }
  let xdrFormat: "base64" | "json" = "json";
  let signal: AbortSignal | undefined;
  for (const candidate of [third, fifth]) {
    if (candidate === undefined) continue;
    if (isAbortSignal(candidate)) signal = candidate;
    else {
      if (candidate.xdrFormat) xdrFormat = candidate.xdrFormat;
      if (candidate.signal) signal = candidate.signal;
    }
  }
  return {
    ...(first !== undefined ? { cursor: first } : {}),
    limit: typeof second === "number" ? second : DEFAULT_LIMIT,
    filters: (fourth ?? []) as AnyFilter[],
    xdrFormat,
    ...(signal ? { signal } : {}),
  };
}

/** Result of {@link GalexieHistoricalSource.getEvents}, in Stellar RPC's `getEvents` shape. */
export interface GalexieGetEventsResult {
  /**
   * Matching events. Stellar RPC no longer sends `pagingToken`, and neither
   * does this source; the `SorobanEvent` type still lists it.
   */
  events: SorobanEvent[];
  /** Resume point: the last event's ID on a full page, otherwise the end of the scanned window. */
  cursor: string;
}

/** See the module comment. */
export class GalexieHistoricalSource implements HistoricalSource {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly decompress: ((data: Uint8Array) => Uint8Array) | undefined;
  private readonly earliestLedger: number;
  private readonly latestLedger: number | undefined;
  private readonly ledgerScanLimit: number;
  private readonly concurrency: number;
  private layoutPromise: Promise<GalexieExportLayout> | undefined;
  /** The last few decoded ledgers, so paging through one ledger downloads it once. */
  private readonly recent = new Map<number, DecodedLedger>();

  constructor(private readonly config: GalexieHistoricalSourceConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = config.fetch ?? fetch.bind(globalThis);
    this.decompress = config.decompress;
    this.earliestLedger = config.earliestLedger ?? 2;
    this.latestLedger = config.latestLedger;
    this.ledgerScanLimit = config.ledgerScanLimit ?? DEFAULT_LEDGER_SCAN_LIMIT;
    this.concurrency = Math.max(1, config.concurrency ?? DEFAULT_CONCURRENCY);
    if (config.layout) this.layoutPromise = Promise.resolve(this.checkLayout(config.layout));
  }

  /** True when `ledger` is inside the configured `earliestLedger`..`latestLedger` bounds. No network call. */
  covers(ledger: number): boolean {
    return (
      ledger >= this.earliestLedger &&
      (this.latestLedger === undefined || ledger <= this.latestLedger)
    );
  }

  /** Reads contract events from the export, answering as Stellar RPC's `getEvents` would. */
  async getEvents(
    first?: string | SorobanGetEventsParams,
    second?: number | SorobanRpcCallOptions,
    third?: AbortSignal | GetEventsOptions,
    fourth?: ContractSubscriptionFilter[],
    fifth?: GetEventsOptions | AbortSignal,
  ): Promise<GalexieGetEventsResult> {
    const req = normalizeRequest(first, second, third, fourth, fifth);

    if (
      req.cursor !== undefined &&
      (req.startLedger !== undefined || req.endLedger !== undefined)
    ) {
      throw new GalexieSourceError("ledger ranges and cursor cannot both be set");
    }
    if (req.cursor === undefined && !(req.startLedger !== undefined && req.startLedger > 0)) {
      throw new GalexieSourceError("startLedger must be positive");
    }
    if (!Number.isInteger(req.limit) || req.limit < 1 || req.limit > MAX_LIMIT) {
      throw new GalexieSourceError(`limit must be between 1 and ${MAX_LIMIT}`);
    }

    let start: Cursor;
    if (req.cursor !== undefined) {
      const c = parseEventId(req.cursor);
      // Paging resumes at the item right after the cursor, as in RPC.
      start = { ...c, event: c.event + 1 };
    } else {
      start = { ledger: req.startLedger!, tx: 0, op: 0, event: 0 };
    }

    let scanEnd = start.ledger + this.ledgerScanLimit;
    if (req.endLedger !== undefined) scanEnd = Math.min(scanEnd, req.endLedger);

    const filters = compileFilters(req.filters);
    const layout = await this.layout();

    const results: SorobanRpcEvent[] = [];
    let full = false;
    let lastScanned = start.ledger - 1;

    const controller = new AbortController();
    const onAbort = () => controller.abort(req.signal?.reason);
    req.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const pending = new Map<number, Promise<DecodedLedger | null>>();
      let next = start.ledger;
      // Look ahead 1, 2, 4... ledgers, up to `concurrency`, so a page that
      // fills inside its first ledger does not download ledgers it never reads.
      let lookahead = 1;
      const fill = () => {
        while (next < scanEnd && pending.size < lookahead) {
          const load = this.loadLedger(next, layout, controller.signal);
          // A prefetch abandoned when the page fills is aborted; its rejection is expected.
          load.catch(() => {});
          pending.set(next, load);
          next++;
        }
      };

      for (let ledger = start.ledger; ledger < scanEnd && !full; ledger++) {
        fill();
        const decoded = await pending.get(ledger)!;
        pending.delete(ledger);
        if (!decoded) {
          if (ledger === start.ledger) {
            throw new GalexieSourceError(
              `ledger ${ledger} is not in the export at ${this.baseUrl}`,
            );
          }
          break; // past the newest exported ledger
        }
        for (const item of decoded.events) {
          if (cmpCursor(item.cursor, start) < 0) continue;
          if (!eventMatches(filters, item.event)) continue;
          results.push(renderEvent(decoded, item, req.xdrFormat));
          if (results.length === req.limit) {
            full = true;
            break;
          }
        }
        lastScanned = ledger;
        lookahead = Math.min(this.concurrency, lookahead * 2);
      }
    } finally {
      req.signal?.removeEventListener("abort", onAbort);
      controller.abort();
    }

    const cursor = full
      ? results[results.length - 1]!.id
      : formatEventId({
          ledger: Math.max(lastScanned, start.ledger - 1),
          tx: TX_MASK,
          op: OP_MASK,
          event: MAX_UINT32,
        });

    // Stellar RPC no longer sends `pagingToken`; SorobanEvent still declares it.
    return { events: results as unknown as SorobanEvent[], cursor };
  }

  private checkLayout(layout: GalexieExportLayout): GalexieExportLayout {
    if (!(layout.ledgersPerFile >= 1) || !(layout.filesPerPartition >= 1)) {
      throw new GalexieSourceError("ledgersPerFile and filesPerPartition must be at least 1");
    }
    if (
      this.config.networkPassphrase !== undefined &&
      layout.networkPassphrase !== undefined &&
      layout.networkPassphrase !== this.config.networkPassphrase
    ) {
      throw new GalexieSourceError(
        `export is for "${layout.networkPassphrase}", not "${this.config.networkPassphrase}"`,
      );
    }
    return layout;
  }

  private layout(): Promise<GalexieExportLayout> {
    this.layoutPromise ??= (async () => {
      const url = `${this.baseUrl}/.config.json`;
      const res = await this.fetchImpl(url);
      if (!res.ok) throw new GalexieSourceError(`HTTP ${res.status} reading ${url}`);
      const raw = (await res.json()) as Record<string, unknown>;
      return this.checkLayout({
        ledgersPerFile: Number(raw["ledgersPerBatch"]),
        filesPerPartition: Number(raw["batchesPerPartition"]),
        ...(typeof raw["fileExtension"] === "string"
          ? { fileExtension: raw["fileExtension"] }
          : {}),
        ...(typeof raw["networkPassphrase"] === "string"
          ? { networkPassphrase: raw["networkPassphrase"] }
          : {}),
        ...(typeof raw["compression"] === "string" ? { compression: raw["compression"] } : {}),
      });
    })();
    // A failed read is retried on the next call rather than cached.
    this.layoutPromise.catch(() => {
      this.layoutPromise = undefined;
    });
    return this.layoutPromise;
  }

  private decompressor(layout: GalexieExportLayout): (data: Uint8Array) => Uint8Array {
    if (this.decompress) return this.decompress;
    const compression = layout.compression ?? "zstd";
    if (compression !== "zstd") {
      throw new GalexieSourceError(
        `export uses "${compression}" compression; pass a decompress function for it`,
      );
    }
    const zstd = (zlib as { zstdDecompressSync?: (data: Uint8Array) => Buffer }).zstdDecompressSync;
    if (typeof zstd !== "function") {
      throw new GalexieSourceError(
        "this Node has no built-in zstd (added in 22.15 and 23.8); pass a decompress function",
      );
    }
    return (data) => zstd(data);
  }

  /** Downloads and decodes one ledger, or returns null when the export does not hold it (HTTP 404). */
  private async loadLedger(
    ledger: number,
    layout: GalexieExportLayout,
    signal: AbortSignal,
  ): Promise<DecodedLedger | null> {
    const cached = this.recent.get(ledger);
    if (cached) return cached;

    const url = `${this.baseUrl}/${galexieObjectKey(ledger, layout)}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, { signal });
    } catch (err) {
      throw new GalexieSourceError(`could not fetch ${url}`, { cause: err });
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new GalexieSourceError(`HTTP ${res.status} fetching ${url}`);

    let batch: xdr.LedgerCloseMetaBatch;
    try {
      const raw = this.decompressor(layout)(new Uint8Array(await res.arrayBuffer()));
      batch = xdr.LedgerCloseMetaBatch.fromXDR(Buffer.from(raw));
    } catch (err) {
      if (err instanceof GalexieSourceError) throw err;
      throw new GalexieSourceError(
        `could not decode ${url}; the network may be on a protocol newer than this @stellar/stellar-sdk`,
        { cause: err },
      );
    }

    const first = batch.startSequence();
    const metas = batch.ledgerCloseMeta();
    let found: DecodedLedger | null = null;
    metas.forEach((lcm, i) => {
      const decoded = extractLedgerEvents(lcm);
      if (decoded.sequence !== first + i) {
        throw new GalexieSourceError(`${url} is out of order at ledger ${decoded.sequence}`);
      }
      this.remember(decoded);
      if (decoded.sequence === ledger) found = decoded;
    });
    if (!found) throw new GalexieSourceError(`${url} does not contain ledger ${ledger}`);
    return found;
  }

  private remember(decoded: DecodedLedger): void {
    this.recent.delete(decoded.sequence);
    this.recent.set(decoded.sequence, decoded);
    while (this.recent.size > Math.max(4, this.concurrency * 2)) {
      this.recent.delete(this.recent.keys().next().value!);
    }
  }
}
