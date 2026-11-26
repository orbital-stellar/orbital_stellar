import { describe, expect, it } from "vitest";
import {
  LiveVerifier,
  computeVerdict,
  windowStartFor,
  type Verdict,
  type VerificationEvent,
} from "../../src/index.js";

const ALICE = "GAAAALICE";
const BOB = "GBBBBOB";

function event(
  ledger: number,
  subject: string,
  overrides: Partial<VerificationEvent> = {},
): VerificationEvent {
  return {
    ledger,
    closeTime: "2024-01-01T00:00:00Z",
    kind: "payment_sent",
    subject,
    counterparty: "GCCCCOUNTER",
    asset: "XLM",
    amount: "10.0000000",
    authorized: null,
    txHash: `tx-${subject}-${ledger}`,
    ...overrides,
  };
}

/** flush() order is not part of the contract; sort before asserting. */
function sorted(verdicts: Verdict[]): Verdict[] {
  return [...verdicts].sort(
    (a, b) => a.subject.localeCompare(b.subject) || a.window.startLedger - b.window.startLedger,
  );
}

const fingerprints = (verdicts: Verdict[]) => sorted(verdicts).map((v) => v.fingerprint);

describe("LiveVerifier", () => {
  it("buckets events into half-open ledger windows", () => {
    const lv = new LiveVerifier(100);
    lv.ingestAll([event(100, ALICE), event(199, ALICE), event(200, ALICE)]);

    const out = sorted(lv.flush());
    expect(out).toHaveLength(2);
    expect(out[0]?.window).toMatchObject({ startLedger: 100, endLedger: 200 });
    expect(out[0]?.metrics.eventCount).toBe(2);
    expect(out[1]?.window).toMatchObject({ startLedger: 200, endLedger: 300 });
    expect(out[1]?.metrics.eventCount).toBe(1);
    expect(windowStartFor(199, 100)).toBe(100);
    expect(windowStartFor(200, 100)).toBe(200);
  });

  it("produces one verdict per subject within a window, counting only that subject's events", () => {
    const lv = new LiveVerifier(100);
    lv.ingestAll([event(110, ALICE), event(120, BOB), event(130, ALICE), event(140, ALICE)]);

    const out = sorted(lv.flush());
    expect(out.map((v) => v.subject)).toEqual([ALICE, BOB]);
    for (const v of out) expect(v.window).toMatchObject({ startLedger: 100, endLedger: 200 });
    expect(out[0]?.metrics.eventCount).toBe(3);
    expect(out[1]?.metrics.eventCount).toBe(1);
  });

  it("marks verdicts as live and clears its buffers on flush", () => {
    const lv = new LiveVerifier(100);
    lv.ingestAll([event(100, ALICE), event(250, BOB)]);

    const first = lv.flush();
    expect(first).toHaveLength(2);
    for (const v of first) expect(v.source).toBe("live");

    expect(lv.flush()).toEqual([]);
  });

  it("only flushes events ingested after the previous flush", () => {
    const lv = new LiveVerifier(100);
    lv.ingest(event(100, ALICE));
    lv.flush();
    lv.ingest(event(150, ALICE));

    const out = lv.flush();
    expect(out).toHaveLength(1);
    expect(out[0]?.metrics.eventCount).toBe(1);
  });

  it("ingestAll gives the same fingerprints as ingesting one event at a time", () => {
    const events = [
      event(100, ALICE),
      event(105, BOB, { kind: "payment_received", counterparty: ALICE }),
      event(180, ALICE, { amount: "2.5000000" }),
      event(310, BOB, { kind: "mint", counterparty: null }),
    ];

    const batched = new LiveVerifier(100);
    batched.ingestAll(events);
    const single = new LiveVerifier(100);
    for (const e of events) single.ingest(e);

    const a = batched.flush();
    const b = single.flush();
    expect(a).toHaveLength(3);
    expect(fingerprints(a)).toEqual(fingerprints(b));
  });

  it("defaults to a window size of 1000", () => {
    const lv = new LiveVerifier();
    lv.ingest(event(1500, ALICE));

    const out = lv.flush();
    expect(out).toHaveLength(1);
    expect(out[0]?.window).toMatchObject({ startLedger: 1000, endLedger: 2000 });
  });

  it("matches computeVerdict called directly on the same events", () => {
    const events = [
      event(100, ALICE),
      event(150, ALICE, { kind: "payment_received", counterparty: BOB }),
      event(199, ALICE, { kind: "fee", counterparty: null, amount: "0.0000100" }),
    ];
    const lv = new LiveVerifier(100);
    lv.ingestAll(events);

    const [live] = lv.flush();
    const direct = computeVerdict(ALICE, { startLedger: 100, endLedger: 200 }, events, {
      source: "live",
    });

    expect(live?.fingerprint).toBe(direct.fingerprint);
    expect(live?.subject).toBe(direct.subject);
    expect(live?.window).toEqual(direct.window);
    expect(live?.metrics).toEqual(direct.metrics);
  });

  it("buckets by subject exactly as given, so case-only differences split into two verdicts", () => {
    // Documents current behaviour: LiveVerifier keys on the raw subject while
    // computeVerdict upper-cases it, so both verdicts report the same subject.
    const lv = new LiveVerifier(100);
    lv.ingestAll([event(100, ALICE), event(110, ALICE.toLowerCase())]);

    const out = lv.flush();
    expect(out).toHaveLength(2);
    expect(out.map((v) => v.subject)).toEqual([ALICE, ALICE]);
    for (const v of out) expect(v.metrics.eventCount).toBe(1);
  });
});
