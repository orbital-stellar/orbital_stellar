import { describe, expect, it } from "vitest";

import {
  evaluatePredicate,
  isClaimPredicateType,
  normalizeClaimPredicate,
  type ClaimPredicate,
} from "../src/claimPredicate.js";

describe("claimPredicate", () => {
  describe("isClaimPredicateType", () => {
    it("correctly identifies unconditional predicate", () => {
      const pred: ClaimPredicate = { type: "unconditional" };
      expect(isClaimPredicateType(pred, "unconditional")).toBe(true);
      expect(isClaimPredicateType(pred, "not")).toBe(false);
      expect(isClaimPredicateType(pred, "and")).toBe(false);
      expect(isClaimPredicateType(pred, "or")).toBe(false);
      expect(isClaimPredicateType(pred, "abs_before")).toBe(false);
      expect(isClaimPredicateType(pred, "rel_before")).toBe(false);
    });

    it("correctly identifies not predicate", () => {
      const pred: ClaimPredicate = {
        type: "not",
        predicate: { type: "unconditional" },
      };
      expect(isClaimPredicateType(pred, "not")).toBe(true);
      expect(isClaimPredicateType(pred, "unconditional")).toBe(false);
    });

    it("correctly identifies and predicate", () => {
      const pred: ClaimPredicate = {
        type: "and",
        predicates: [{ type: "unconditional" }],
      };
      expect(isClaimPredicateType(pred, "and")).toBe(true);
      expect(isClaimPredicateType(pred, "or")).toBe(false);
    });

    it("correctly identifies or predicate", () => {
      const pred: ClaimPredicate = {
        type: "or",
        predicates: [{ type: "unconditional" }],
      };
      expect(isClaimPredicateType(pred, "or")).toBe(true);
      expect(isClaimPredicateType(pred, "and")).toBe(false);
    });

    it("correctly identifies abs_before predicate", () => {
      const pred: ClaimPredicate = {
        type: "abs_before",
        timestamp: "2026-05-01T00:00:00Z",
      };
      expect(isClaimPredicateType(pred, "abs_before")).toBe(true);
      expect(isClaimPredicateType(pred, "rel_before")).toBe(false);
    });

    it("correctly identifies rel_before predicate", () => {
      const pred: ClaimPredicate = {
        type: "rel_before",
        seconds: "3600",
      };
      expect(isClaimPredicateType(pred, "rel_before")).toBe(true);
      expect(isClaimPredicateType(pred, "abs_before")).toBe(false);
    });
  });

  describe("evaluatePredicate", () => {
    const fixedNow = new Date("2026-06-01T12:00:00.000Z"); // 1780315200 seconds

    it("evaluates unconditional predicate to true", () => {
      expect(evaluatePredicate({ type: "unconditional" }, fixedNow)).toBe(true);
    });

    it("evaluates not predicate", () => {
      expect(
        evaluatePredicate(
          {
            type: "not",
            predicate: { type: "unconditional" },
          },
          fixedNow,
        ),
      ).toBe(false);

      expect(
        evaluatePredicate(
          {
            type: "not",
            predicate: {
              type: "abs_before",
              timestamp: "2026-01-01T00:00:00Z", // Past date, so inner is false
            },
          },
          fixedNow,
        ),
      ).toBe(true);
    });

    it("evaluates and predicate", () => {
      expect(
        evaluatePredicate(
          {
            type: "and",
            predicates: [
              { type: "unconditional" },
              { type: "abs_before", timestamp: "2026-12-31T00:00:00Z" },
            ],
          },
          fixedNow,
        ),
      ).toBe(true);

      expect(
        evaluatePredicate(
          {
            type: "and",
            predicates: [
              { type: "unconditional" },
              { type: "abs_before", timestamp: "2026-01-01T00:00:00Z" }, // False
            ],
          },
          fixedNow,
        ),
      ).toBe(false);

      // Empty and evaluates to true (vacuous truth / Array.every)
      expect(evaluatePredicate({ type: "and", predicates: [] }, fixedNow)).toBe(true);
    });

    it("evaluates or predicate", () => {
      expect(
        evaluatePredicate(
          {
            type: "or",
            predicates: [
              { type: "abs_before", timestamp: "2026-01-01T00:00:00Z" }, // False
              { type: "unconditional" }, // True
            ],
          },
          fixedNow,
        ),
      ).toBe(true);

      expect(
        evaluatePredicate(
          {
            type: "or",
            predicates: [
              { type: "abs_before", timestamp: "2026-01-01T00:00:00Z" },
              { type: "abs_before", timestamp: "2026-02-01T00:00:00Z" },
            ],
          },
          fixedNow,
        ),
      ).toBe(false);

      // Empty or evaluates to false (Array.some)
      expect(evaluatePredicate({ type: "or", predicates: [] }, fixedNow)).toBe(false);
    });

    it("evaluates abs_before predicate", () => {
      // Before deadline -> true
      expect(
        evaluatePredicate(
          {
            type: "abs_before",
            timestamp: "2026-06-01T12:00:01.000Z",
          },
          fixedNow,
        ),
      ).toBe(true);

      // At deadline -> false (must be strictly before)
      expect(
        evaluatePredicate(
          {
            type: "abs_before",
            timestamp: "2026-06-01T12:00:00.000Z",
          },
          fixedNow,
        ),
      ).toBe(false);

      // After deadline -> false
      expect(
        evaluatePredicate(
          {
            type: "abs_before",
            timestamp: "2026-06-01T11:59:59.000Z",
          },
          fixedNow,
        ),
      ).toBe(false);
    });

    it("evaluates rel_before predicate", () => {
      const nowSeconds = Math.floor(fixedNow.getTime() / 1000);

      // nowSeconds < beforeSeconds -> true
      expect(
        evaluatePredicate(
          {
            type: "rel_before",
            seconds: String(nowSeconds + 60),
          },
          fixedNow,
        ),
      ).toBe(true);

      // nowSeconds == beforeSeconds -> false
      expect(
        evaluatePredicate(
          {
            type: "rel_before",
            seconds: String(nowSeconds),
          },
          fixedNow,
        ),
      ).toBe(false);

      // nowSeconds > beforeSeconds -> false
      expect(
        evaluatePredicate(
          {
            type: "rel_before",
            seconds: String(nowSeconds - 60),
          },
          fixedNow,
        ),
      ).toBe(false);
    });

    it("evaluates complex nested predicates", () => {
      const complex: ClaimPredicate = {
        type: "and",
        predicates: [
          {
            type: "not",
            predicate: {
              type: "abs_before",
              timestamp: "2026-01-01T00:00:00Z", // false -> not false is true
            },
          },
          {
            type: "or",
            predicates: [
              {
                type: "rel_before",
                seconds: "0", // false
              },
              {
                type: "unconditional", // true
              },
            ],
          },
        ],
      };

      expect(evaluatePredicate(complex, fixedNow)).toBe(true);
    });

    it("handles fallback default branch when given an unexpected type", () => {
      const invalid = { type: "unknown_pred" } as unknown as ClaimPredicate;
      expect(evaluatePredicate(invalid, fixedNow)).toBe(invalid);
    });
  });

  describe("normalizeClaimPredicate", () => {
    it("normalizes unconditional predicate", () => {
      const result = normalizeClaimPredicate({ unconditional: true });
      expect(result).toEqual({ type: "unconditional" });
    });

    it("normalizes not predicate", () => {
      const result = normalizeClaimPredicate({
        not: { unconditional: true },
      });
      expect(result).toEqual({
        type: "not",
        predicate: { type: "unconditional" },
      });
    });

    it("normalizes and predicate with nested elements", () => {
      const result = normalizeClaimPredicate({
        and: [{ unconditional: true }, { abs_before: "2026-12-31T23:59:59Z" }],
      });
      expect(result).toEqual({
        type: "and",
        predicates: [
          { type: "unconditional" },
          { type: "abs_before", timestamp: "2026-12-31T23:59:59Z" },
        ],
      });
    });

    it("normalizes or predicate with nested elements", () => {
      const result = normalizeClaimPredicate({
        or: [{ rel_before: "7200" }, { unconditional: true }],
      });
      expect(result).toEqual({
        type: "or",
        predicates: [{ type: "rel_before", seconds: "7200" }, { type: "unconditional" }],
      });
    });

    it("normalizes abs_before predicate", () => {
      const result = normalizeClaimPredicate({
        abs_before: "2026-09-25T12:00:00Z",
      });
      expect(result).toEqual({
        type: "abs_before",
        timestamp: "2026-09-25T12:00:00Z",
      });
    });

    it("normalizes rel_before predicate", () => {
      const result = normalizeClaimPredicate({
        rel_before: "86400",
      });
      expect(result).toEqual({
        type: "rel_before",
        seconds: "86400",
      });
    });

    it("throws error for invalid or empty predicate", () => {
      expect(() => normalizeClaimPredicate({})).toThrowError(
        /Invalid or ambiguous claim predicate/,
      );
      expect(() => normalizeClaimPredicate({ unconditional: false })).toThrowError(
        /Invalid or ambiguous claim predicate/,
      );
      expect(() => normalizeClaimPredicate({ invalidField: "123" })).toThrowError(
        /Invalid or ambiguous claim predicate/,
      );
    });
  });
});
