import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseInterval,
  nextIntervalRun,
  parseCron,
  nextCronRun,
  isDue,
  alignToLedgerClose,
} from '../src/schedule.js';

describe('parseInterval', () => {
  it('parses minutes', () => {
    expect(parseInterval('5m')).toEqual(300_000);
  });

  it('parses hours', () => {
    expect(parseInterval('2h')).toEqual(7200_000);
  });

  it('parses seconds', () => {
    expect(parseInterval('30s')).toEqual(30_000);
  });

  it('parses milliseconds', () => {
    expect(parseInterval('250ms')).toEqual(250);
  });

  it('parses days', () => {
    expect(parseInterval('1d')).toEqual(86400_000);
  });

  it('parses compound intervals', () => {
    expect(parseInterval('1h7m')).toEqual(3600_000 + 7 * 60_000);
  });

  it('throws on invalid input', () => {
    expect(() => parseInterval('abc')).toThrow();
  });

  it('throws on empty input', () => {
    expect(() => parseInterval('')).toThrow();
  });
});

describe('nextIntervalRun', () => {
  it('returns now plus interval when no last run', () => {
    const now = new Date('2024-01-01T00:00:00Z');
    const next = nextIntervalRun('5m', null, now);
    expect(next.getTime()).toEqual(now.getTime() + 300_000);
  });

  it('returns last run plus interval when in the future', () => {
    const now = new Date('2024-01-01T00:00:00Z');
    const last = new Date('2024-01-01T00:00:00Z');
    const next = nextIntervalRun('5m', last, now);
    expect(next.getTime()).toEqual(last.getTime() + 300_000);
  });

  it('rolls forward when last run is in the past', () => {
    const now = new Date('2024-01-01T00:10:00Z');
    const last = new Date('2024-01-01T00:00:00Z');
    const next = nextIntervalRun('5m', last, now);
    expect(next.getTime()).toBeGreaterThan(now.getTime());
    expect(next.getTime()).toEqual(last.getTime() + 300_000);
  });
});

describe('parseCron', () => {
  it('parses a simple cron expression', () => {
    const cron = parseCron(0, 0, '* * * * *');
    expect(cron).toBeDefined();
  });

  it('throws on invalid cron expression', () => {
    expect(() => parseCron(0, 0, '* * * * * *')).toThrow();
  });
});

describe('nextCronRun', () => {
  it('returns the next minute for * * * * *', () => {
    const now = new Date('2024-01-01T00:00:30Z');
    const next = nextCronRun(0, 0, '* * * * *', now);
    expect(next.getTime()).toEqual(new Date('2024-01-01T00:01:00Z').getTime());
  });

  it('respects the hour field', () => {
    const now = new Date('2024-01-01T00:00:00Z');
    const next = nextCronRun(0, 0, '0 * * * *', now);
    expect(next.getTime()).toEqual(new Date('2024-01-01T01:00:00Z').getTime());
  });

  it('respects the day of week field', () => {
    const now = new Date('2024-01-01T00:00:00Z'); // Monday
    const next = nextCronRun(0, 0, '0 * * 1', now);
    expect(next.getTime()).toEqual(new Date('2024-01-08T00:00:00Z').getTime());
  });

  it('respects the month field', () => {
    const now = new Date('2024-01-01T00:00:00Z');
    const next = nextCronRun(0, 0, '0 0 2 * *', now);
    expect(next.getTime()).toEqual(new Date('2024-02-01T00:00:00Z').getTime());
  });
});

describe('isDue', () => {
  it('returns true when now is at or after the next run', () => {
    const now = new Date('2024-01-01T00:05:00Z');
    const next = new Date('2024-01-01T00:05:00Z');
    expect(isDue(next, now)).toBe(true);
  });

  it('returns false when now is before the next run', () => {
    const now = new Date('2024-01-01T00:04:00Z');
    const next = new Date('2024-01-01T00:05:00Z');
    expect(isDue(next, now)).toBe(false);
  });
});

describe('alignToLedgerClose', () => {
  it('aligns to the next ledger close', () => {
    const now = new Date('2024-01-01T00:00:00Z');
    const aligned = alignToLedgerClose(now, 5);
    expect(aligned.getTime()).toEqual(new Date('2024-01-01T00:05:00Z').getTime());
  });

  it('returns the same time when already aligned', () => {
    const now = new Date('2024-01-01T00:05:00Z');
    const aligned = alignToLedgerClose(now, 5);
    expect(aligned.getTime()).toEqual(now.getTime());
  });

  it('respects timezone offsets', () => {
    const now = new Date('2024-01-01T00:00:00+02:00');
    const aligned = alignToLedgerClose(now, 5);
    expect(aligned.getTime()).toEqual(new Date('2024-01-01T00:05:00+02:00').getTime());
  });
});
