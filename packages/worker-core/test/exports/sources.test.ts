import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FileExportSource,
  MemoryExportSource,
  parseCdpLedger,
  parseGalexieLedger,
  type ExportLedger,
  type LedgerRange,
} from "../../src/index.js";

async function collect(iter: AsyncIterable<ExportLedger>): Promise<ExportLedger[]> {
  const out: ExportLedger[] = [];
  for await (const ledger of iter) out.push(ledger);
  return out;
}

const seqs = (ledgers: ExportLedger[]) => ledgers.map((l) => l.ledgerSequence);

const galexie = (seq: number) =>
  JSON.stringify({
    ledger_sequence: seq,
    close_time: `2024-01-01T00:00:${String(seq % 60).padStart(2, "0")}Z`,
  });
const cdp = (seq: number) =>
  JSON.stringify({
    ledger: seq,
    closed_at: `2024-01-01T00:00:${String(seq % 60).padStart(2, "0")}Z`,
  });

const ALL: LedgerRange = { startLedger: 0, endLedger: Number.MAX_SAFE_INTEGER };

function ledger(seq: number): ExportLedger {
  return { ledgerSequence: seq, closeTime: `t${seq}`, network: "mainnet", transactions: [] };
}

describe("FileExportSource", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "wc-export-sources-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reads only .jsonl files, in sorted filename order", async () => {
    // Written out of order so readdir order cannot accidentally match.
    await writeFile(join(dir, "b.jsonl"), [galexie(103), galexie(104)].join("\n"));
    await writeFile(join(dir, "a.jsonl"), [galexie(101), galexie(102)].join("\n"));
    await writeFile(join(dir, "c.jsonl"), galexie(105));
    await writeFile(join(dir, "ignored.json"), galexie(900));
    await writeFile(join(dir, "ignored.txt"), galexie(901));

    const out = await collect(
      new FileExportSource({ directory: dir, format: "galexie" }).read(ALL),
    );
    expect(seqs(out)).toEqual([101, 102, 103, 104, 105]);
  });

  it("orders by filename, not by ledger sequence", async () => {
    await writeFile(join(dir, "a.jsonl"), galexie(200));
    await writeFile(join(dir, "b.jsonl"), galexie(100));

    const out = await collect(
      new FileExportSource({ directory: dir, format: "galexie" }).read(ALL),
    );
    expect(seqs(out)).toEqual([200, 100]);
  });

  it("skips blank and whitespace-only lines", async () => {
    await writeFile(
      join(dir, "a.jsonl"),
      ["", galexie(101), "   ", "\t", galexie(102), "  \r", "", galexie(103), ""].join("\n"),
    );

    const out = await collect(
      new FileExportSource({ directory: dir, format: "galexie" }).read(ALL),
    );
    expect(seqs(out)).toEqual([101, 102, 103]);
  });

  it("parses galexie records via parseGalexieLedger", async () => {
    const records = [101, 102, 103].map((s) => ({
      ledger_sequence: s,
      close_time: `2024-01-01T00:00:0${s - 100}Z`,
    }));
    await writeFile(join(dir, "a.jsonl"), records.map((r) => JSON.stringify(r)).join("\n"));

    const out = await collect(
      new FileExportSource({ directory: dir, format: "galexie" }).read(ALL),
    );
    expect(seqs(out)).toEqual([101, 102, 103]);
    expect(out).toEqual(records.map((r) => parseGalexieLedger(r)));
  });

  it("parses cdp records via parseCdpLedger", async () => {
    const records = [101, 102, 103].map((s) => ({
      ledger: s,
      closed_at: `2024-01-01T00:00:0${s - 100}Z`,
    }));
    await writeFile(join(dir, "a.jsonl"), records.map((r) => JSON.stringify(r)).join("\n"));

    const out = await collect(new FileExportSource({ directory: dir, format: "cdp" }).read(ALL));
    expect(seqs(out)).toEqual([101, 102, 103]);
    expect(out).toEqual(records.map((r) => parseCdpLedger(r)));
  });

  it.each(["galexie", "cdp"] as const)(
    "treats the range as half-open [start, end) (%s)",
    async (format) => {
      const line = format === "galexie" ? galexie : cdp;
      await writeFile(join(dir, "a.jsonl"), [99, 100, 101, 102, 103, 104].map(line).join("\n"));

      const out = await collect(
        new FileExportSource({ directory: dir, format }).read({ startLedger: 100, endLedger: 103 }),
      );
      expect(seqs(out)).toEqual([100, 101, 102]);
    },
  );

  it("yields nothing for an empty range", async () => {
    await writeFile(join(dir, "a.jsonl"), [100, 101].map(galexie).join("\n"));

    const out = await collect(
      new FileExportSource({ directory: dir, format: "galexie" }).read({
        startLedger: 101,
        endLedger: 101,
      }),
    );
    expect(out).toEqual([]);
  });

  it("describe() defaults to the format and a file:// location", () => {
    expect(new FileExportSource({ directory: dir, format: "galexie" }).describe()).toEqual({
      kind: "galexie",
      location: `file://${dir}`,
    });
    expect(new FileExportSource({ directory: dir, format: "cdp" }).describe()).toEqual({
      kind: "cdp",
      location: `file://${dir}`,
    });
  });

  it("describe() returns the given location when one is passed", () => {
    expect(
      new FileExportSource({
        directory: dir,
        format: "cdp",
        location: "s3://bucket/exports",
      }).describe(),
    ).toEqual({ kind: "cdp", location: "s3://bucket/exports" });
  });

  it("rejects on a line that is not valid JSON", async () => {
    await writeFile(join(dir, "a.jsonl"), [galexie(101), "{not json"].join("\n"));

    await expect(
      collect(new FileExportSource({ directory: dir, format: "galexie" }).read(ALL)),
    ).rejects.toThrow(SyntaxError);
  });

  it("rejects when the directory does not exist", async () => {
    const missing = join(dir, "does-not-exist");

    await expect(
      collect(new FileExportSource({ directory: missing, format: "galexie" }).read(ALL)),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("MemoryExportSource", () => {
  it("yields ledgers in ascending order without reordering the caller's array", async () => {
    const input = [ledger(103), ledger(101), ledger(104), ledger(102)];
    const snapshot = [...input];

    const out = await collect(new MemoryExportSource(input).read(ALL));
    expect(seqs(out)).toEqual([101, 102, 103, 104]);
    expect(input).toEqual(snapshot);
    expect(seqs(input)).toEqual([103, 101, 104, 102]);
  });

  it("treats the range as half-open [start, end)", async () => {
    const source = new MemoryExportSource([99, 100, 101, 102, 103, 104].map(ledger));

    const out = await collect(source.read({ startLedger: 100, endLedger: 103 }));
    expect(seqs(out)).toEqual([100, 101, 102]);
  });

  it("describe() defaults to kind file and memory://export", () => {
    expect(new MemoryExportSource([]).describe()).toEqual({
      kind: "file",
      location: "memory://export",
    });
  });

  it("describe() returns the given location when one is passed", () => {
    expect(new MemoryExportSource([], { location: "memory://fixture" }).describe()).toEqual({
      kind: "file",
      location: "memory://fixture",
    });
  });
});
