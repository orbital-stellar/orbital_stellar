import { describe, expect, it, vi } from "vitest";
import { dueTimesBetween, nextDue, type Schedule } from "../src/schedule.js";

const iso = (dates: Date[]): string[] => dates.map((d) => d.toISOString());
const at = (value: string): Date => new Date(value);

/** Rounds up to the next 5-second boundary, like Stellar's ~5s ledger close. */
const closeAt5s = (after: Date): Date => new Date(Math.ceil(after.getTime() / 5000) * 5000);

describe("nextDue", () => {
  describe("interval", () => {
    const schedule: Schedule = { type: "interval", intervalMs: 60_000 };

    it("adds the interval to the reference time", () => {
      expect(nextDue(schedule, at("2026-01-01T00:00:00Z")).toISOString()).toBe(
        "2026-01-01T00:01:00.000Z",
      );
    });

    it("does not mutate the reference date", () => {
      const after = at("2026-01-01T00:00:00Z");
      nextDue(schedule, after);
      expect(after.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    });

    it("aligns the due time to the ledger close callback", () => {
      const callback = vi.fn(closeAt5s);
      const due = nextDue(
        { type: "interval", intervalMs: 1_000 },
        at("2026-01-01T00:00:00.500Z"),
        callback,
      );
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(at("2026-01-01T00:00:01.500Z"));
      expect(due.toISOString()).toBe("2026-01-01T00:00:05.000Z");
    });
  });

  describe("cron", () => {
    it("finds the next occurrence in UTC by default", () => {
      const due = nextDue({ type: "cron", expression: "*/15 * * * *" }, at("2026-01-01T10:07:00Z"));
      expect(due.toISOString()).toBe("2026-01-01T10:15:00.000Z");
    });

    it("moves strictly past a reference time that is already on a boundary", () => {
      const due = nextDue({ type: "cron", expression: "0 * * * *" }, at("2026-01-01T10:00:00Z"));
      expect(due.toISOString()).toBe("2026-01-01T11:00:00.000Z");
    });

    it("interprets the expression in the given timezone", () => {
      // 09:00 in Tokyo (UTC+9, no DST) is 00:00 UTC.
      const due = nextDue(
        { type: "cron", expression: "0 9 * * *", timezone: "Asia/Tokyo" },
        at("2026-06-01T00:30:00Z"),
      );
      expect(due.toISOString()).toBe("2026-06-02T00:00:00.000Z");
    });

    it("tracks the UTC offset change across a DST boundary", () => {
      const schedule: Schedule = {
        type: "cron",
        expression: "0 9 * * *",
        timezone: "America/New_York",
      };
      // Before spring-forward (EST, UTC-5), then after it (EDT, UTC-4).
      expect(nextDue(schedule, at("2026-03-07T00:00:00Z")).toISOString()).toBe(
        "2026-03-07T14:00:00.000Z",
      );
      expect(nextDue(schedule, at("2026-03-09T00:00:00Z")).toISOString()).toBe(
        "2026-03-09T13:00:00.000Z",
      );
    });

    it("shifts a nonexistent local time forward instead of dropping the run", () => {
      // 02:30 does not exist on 2026-03-08 in New York (02:00 -> 03:00): the run
      // lands at 03:30 EDT (07:30Z), and the next day is back to 02:30 EDT.
      const schedule: Schedule = {
        type: "cron",
        expression: "30 2 * * *",
        timezone: "America/New_York",
      };
      expect(
        iso(dueTimesBetween(schedule, at("2026-03-08T00:00:00Z"), at("2026-03-10T00:00:00Z"))),
      ).toEqual(["2026-03-08T07:30:00.000Z", "2026-03-09T06:30:00.000Z"]);
    });

    it("yields one run for a repeated local time on fall-back", () => {
      // 01:30 happens twice on 2026-11-01 in New York (EDT then EST).
      const schedule: Schedule = {
        type: "cron",
        expression: "30 1 * * *",
        timezone: "America/New_York",
      };
      const runs = dueTimesBetween(
        schedule,
        at("2026-11-01T00:00:00Z"),
        at("2026-11-01T12:00:00Z"),
      );
      expect(runs).toHaveLength(1);
    });

    it("aligns the cron occurrence to the ledger close callback", () => {
      const due = nextDue(
        { type: "cron", expression: "* * * * *" },
        at("2026-01-01T00:00:10Z"),
        () => at("2026-01-01T00:01:03Z"),
      );
      expect(due.toISOString()).toBe("2026-01-01T00:01:03.000Z");
    });

    it("throws on an invalid expression", () => {
      expect(() =>
        nextDue({ type: "cron", expression: "not a cron" }, at("2026-01-01T00:00:00Z")),
      ).toThrow();
    });

    it("throws on an unknown timezone", () => {
      expect(() =>
        nextDue(
          { type: "cron", expression: "0 * * * *", timezone: "Mars/Olympus" },
          at("2026-01-01T00:00:00Z"),
        ),
      ).toThrow();
    });
  });
});

describe("dueTimesBetween", () => {
  describe("guards", () => {
    it("returns nothing when `to` equals `after`", () => {
      const t = at("2026-01-01T00:00:00Z");
      expect(dueTimesBetween({ type: "interval", intervalMs: 1000 }, t, t)).toEqual([]);
    });

    it("returns nothing when `to` is before `after`", () => {
      expect(
        dueTimesBetween(
          { type: "cron", expression: "* * * * *" },
          at("2026-01-01T00:10:00Z"),
          at("2026-01-01T00:00:00Z"),
        ),
      ).toEqual([]);
    });
  });

  describe("interval", () => {
    const schedule: Schedule = { type: "interval", intervalMs: 60_000 };

    it("lists every due time in the window, excluding `after` and including `to`", () => {
      const runs = dueTimesBetween(
        schedule,
        at("2026-01-01T00:00:00Z"),
        at("2026-01-01T00:03:00Z"),
      );
      expect(iso(runs)).toEqual([
        "2026-01-01T00:01:00.000Z",
        "2026-01-01T00:02:00.000Z",
        "2026-01-01T00:03:00.000Z",
      ]);
    });

    it("returns nothing when the window is shorter than one interval", () => {
      expect(
        dueTimesBetween(schedule, at("2026-01-01T00:00:00Z"), at("2026-01-01T00:00:59Z")),
      ).toEqual([]);
    });

    it("keeps the nominal cadence rather than drifting through the callback", () => {
      const runs = dueTimesBetween(
        { type: "interval", intervalMs: 3_000 },
        at("2026-01-01T00:00:00Z"),
        at("2026-01-01T00:00:15Z"),
        closeAt5s,
      );
      // nominal 3,6,9,12,15 -> closes 5,10,10,15,15 -> de-duplicated.
      expect(iso(runs)).toEqual([
        "2026-01-01T00:00:05.000Z",
        "2026-01-01T00:00:10.000Z",
        "2026-01-01T00:00:15.000Z",
      ]);
    });

    it("stops once an aligned due time falls past `to`", () => {
      const callback = vi.fn(closeAt5s);
      const runs = dueTimesBetween(
        { type: "interval", intervalMs: 1_000 },
        at("2026-01-01T00:00:00Z"),
        at("2026-01-01T00:00:04Z"),
        callback,
      );
      // First nominal time (00:00:01) aligns to 00:00:05 > to, so it ends at once.
      expect(runs).toEqual([]);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe("cron", () => {
    it("lists each occurrence in the window", () => {
      const runs = dueTimesBetween(
        { type: "cron", expression: "*/10 * * * *" },
        at("2026-01-01T00:00:00Z"),
        at("2026-01-01T00:35:00Z"),
      );
      expect(iso(runs)).toEqual([
        "2026-01-01T00:10:00.000Z",
        "2026-01-01T00:20:00.000Z",
        "2026-01-01T00:30:00.000Z",
      ]);
    });

    it("includes an occurrence that lands exactly on `to`", () => {
      const runs = dueTimesBetween(
        { type: "cron", expression: "0 * * * *" },
        at("2026-01-01T00:30:00Z"),
        at("2026-01-01T02:00:00Z"),
      );
      expect(iso(runs)).toEqual(["2026-01-01T01:00:00.000Z", "2026-01-01T02:00:00.000Z"]);
    });

    it("returns nothing when no occurrence falls in the window", () => {
      expect(
        dueTimesBetween(
          { type: "cron", expression: "0 0 1 1 *" },
          at("2026-02-01T00:00:00Z"),
          at("2026-03-01T00:00:00Z"),
        ),
      ).toEqual([]);
    });

    it("applies the timezone when walking the window", () => {
      const runs = dueTimesBetween(
        { type: "cron", expression: "0 9 * * *", timezone: "Asia/Tokyo" },
        at("2026-06-01T00:30:00Z"),
        at("2026-06-03T00:30:00Z"),
      );
      expect(iso(runs)).toEqual(["2026-06-02T00:00:00.000Z", "2026-06-03T00:00:00.000Z"]);
    });

    it("de-duplicates occurrences that align to the same ledger close", () => {
      const runs = dueTimesBetween(
        { type: "cron", expression: "* * * * *" },
        at("2026-01-01T00:00:00Z"),
        at("2026-01-01T00:05:00Z"),
        // Collapse every minute in the first 150 seconds onto one close time.
        (after) =>
          after.getTime() <= at("2026-01-01T00:02:30Z").getTime()
            ? at("2026-01-01T00:02:30Z")
            : after,
      );
      expect(iso(runs)).toEqual([
        "2026-01-01T00:02:30.000Z",
        "2026-01-01T00:03:00.000Z",
        "2026-01-01T00:04:00.000Z",
        "2026-01-01T00:05:00.000Z",
      ]);
    });

    it("stops once an aligned due time falls past `to`", () => {
      const callback = vi.fn((after: Date) => new Date(after.getTime() + 10_000));
      const runs = dueTimesBetween(
        { type: "cron", expression: "* * * * *" },
        at("2026-01-01T00:00:00Z"),
        at("2026-01-01T00:03:00Z"),
        callback,
      );
      // Occurrences at :01 and :02 align to :01:10 and :02:10; :03 aligns to :03:10 > to.
      expect(iso(runs)).toEqual(["2026-01-01T00:01:10.000Z", "2026-01-01T00:02:10.000Z"]);
      expect(callback).toHaveBeenCalledTimes(3);
    });
  });
});
