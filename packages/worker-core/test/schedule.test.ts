import { describe, expect, it } from "vitest";

import { dueTimesBetween, nextDue } from "../src/schedule";

const at = (iso: string): Date => new Date(iso);
const iso = (date: Date): string => date.toISOString();

describe("nextDue - interval schedules", () => {
  it("adds the interval to the reference time", () => {
    expect(iso(nextDue({ type: "interval", intervalMs: 60_000 }, at("2026-01-01T00:00:00Z")))).toBe(
      "2026-01-01T00:01:00.000Z",
    );
  });

  it("handles one-millisecond and one-day intervals", () => {
    expect(
      iso(nextDue({ type: "interval", intervalMs: 1 }, at("2026-01-01T00:00:00.999Z"))),
    ).toBe("2026-01-01T00:00:01.000Z");
    expect(
      iso(nextDue({ type: "interval", intervalMs: 86_400_000 }, at("2026-01-01T00:00:00Z"))),
    ).toBe("2026-01-02T00:00:00.000Z");
  });
});

describe("nextDue - cron schedules", () => {
  it("returns the next matching UTC instant", () => {
    expect(iso(nextDue({ type: "cron", expression: "0 * * * *", timezone: "UTC" }, at("2026-01-01T00:30:00Z")))).toBe(
      "2026-01-01T01:00:00.000Z",
    );
    expect(
      iso(nextDue({ type: "cron", expression: "30 2 * * *", timezone: "UTC" }, at("2026-01-01T03:00:00Z"))),
    ).toBe("2026-01-02T02:30:00.000Z");
  });

  it("interprets the expression in the configured timezone", () => {
    // 12:00 America/New_York is 17:00 UTC in winter (EST) and 16:00 UTC in
    // summer (EDT), so an expression in local time must shift with the season.
    expect(
      iso(
        nextDue(
          { type: "cron", expression: "0 12 * * *", timezone: "America/New_York" },
          at("2026-01-15T00:00:00Z"),
        ),
      ),
    ).toBe("2026-01-15T17:00:00.000Z");
    expect(
      iso(
        nextDue(
          { type: "cron", expression: "0 12 * * *", timezone: "America/New_York" },
          at("2026-07-15T00:00:00Z"),
        ),
      ),
    ).toBe("2026-07-15T16:00:00.000Z");
  });

  it("advances correctly across the spring-forward DST transition", () => {
    // 2026-03-08: America/New_York jumps 02:00 -> 03:00, so a daily local
    // 12:00 run moves from 17:00Z to 16:00Z.
    const before = nextDue(
      { type: "cron", expression: "0 12 * * *", timezone: "America/New_York" },
      at("2026-03-07T17:00:00Z"),
    );
    expect(iso(before)).toBe("2026-03-08T16:00:00.000Z");
    const after = nextDue(
      { type: "cron", expression: "0 12 * * *", timezone: "America/New_York" },
      before,
    );
    expect(iso(after)).toBe("2026-03-09T16:00:00.000Z");
  });
});

describe("dueTimesBetween - interval schedules", () => {
  it("returns every interval boundary in (after, to]", () => {
    const times = dueTimesBetween(
      { type: "interval", intervalMs: 60_000 },
      at("2026-01-01T00:00:00Z"),
      at("2026-01-01T00:03:00Z"),
    );
    expect(times.map(iso)).toEqual([
      "2026-01-01T00:01:00.000Z",
      "2026-01-01T00:02:00.000Z",
      "2026-01-01T00:03:00.000Z",
    ]);
  });

  it("returns an empty array when the window is empty or inverted", () => {
    expect(
      dueTimesBetween(
        { type: "interval", intervalMs: 1_000 },
        at("2026-01-01T00:00:01Z"),
        at("2026-01-01T00:00:01Z"),
      ),
    ).toEqual([]);
    expect(
      dueTimesBetween(
        { type: "interval", intervalMs: 1_000 },
        at("2026-01-01T00:00:02Z"),
        at("2026-01-01T00:00:00Z"),
      ),
    ).toEqual([]);
  });

  it("aligns to ledger close times, deduplicates, and stops past the window", () => {
    const align = (date: Date): Date =>
      new Date(Math.ceil(date.getTime() / 10_000) * 10_000);
    const times = dueTimesBetween(
      { type: "interval", intervalMs: 6_000 },
      at("2026-01-01T00:00:00Z"),
      at("2026-01-01T00:00:20Z"),
      align,
    );
    // Nominal 06/12/18s align to 10/20/20s, so the result is 10s and 20s.
    expect(times.map(iso)).toEqual([
      "2026-01-01T00:00:10.000Z",
      "2026-01-01T00:00:20.000Z",
    ]);
  });
});

describe("dueTimesBetween - cron schedules", () => {
  it("returns every matching time in the window", () => {
    const times = dueTimesBetween(
      { type: "cron", expression: "0 * * * *", timezone: "UTC" },
      at("2026-01-01T00:00:00Z"),
      at("2026-01-01T03:00:00Z"),
    );
    expect(times.map(iso)).toEqual([
      "2026-01-01T01:00:00.000Z",
      "2026-01-01T02:00:00.000Z",
      "2026-01-01T03:00:00.000Z",
    ]);
  });

  it("returns an empty array when to is not after", () => {
    expect(
      dueTimesBetween(
        { type: "cron", expression: "* * * * *", timezone: "UTC" },
        at("2026-01-01T00:01:00Z"),
        at("2026-01-01T00:00:00Z"),
      ),
    ).toEqual([]);
  });

  it("dedupes ledger-aligned cron times and stops when alignment passes the window", () => {
    const align = (date: Date): Date => new Date(date.getTime() + 30 * 60_000);
    const times = dueTimesBetween(
      { type: "cron", expression: "0 * * * *", timezone: "UTC" },
      at("2026-01-01T00:00:00Z"),
      at("2026-01-01T02:30:00Z"),
      align,
    );
    // Nominal 01:00/02:00 align to 01:30/02:30; the 03:00 run aligns past the
    // window and stops the walk.
    expect(times.map(iso)).toEqual([
      "2026-01-01T01:30:00.000Z",
      "2026-01-01T02:30:00.000Z",
    ]);
  });
});

describe("ledger alignment and timezone boundaries", () => {
  it("stops when a ledger-aligned interval passes the window", () => {
    const align = (date: Date): Date => new Date(date.getTime() + 10_000);
    const times = dueTimesBetween(
      { type: "interval", intervalMs: 6_000 },
      at("2026-01-01T00:00:00Z"),
      at("2026-01-01T00:00:15Z"),
      align,
    );
    // The first nominal time (06s) aligns to 16s, past the window, so the walk
    // stops without emitting anything.
    expect(times).toEqual([]);
  });

  it("stops when a ledger-aligned cron run passes the window", () => {
    const align = (date: Date): Date => new Date(date.getTime() + 30 * 60_000);
    const times = dueTimesBetween(
      { type: "cron", expression: "0 * * * *", timezone: "UTC" },
      at("2026-01-01T00:00:00Z"),
      at("2026-01-01T00:45:00Z"),
      align,
    );
    expect(times).toEqual([]);
  });

  it("supports a cron expression without an explicit timezone", () => {
    const reference = at("2026-01-01T00:00:00Z");
    const due = nextDue({ type: "cron", expression: "* * * * *" }, reference);
    expect(due.getTime()).toBeGreaterThan(reference.getTime());
  });
});