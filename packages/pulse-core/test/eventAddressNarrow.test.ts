import { describe, expect, it } from "vitest";

import { describeEvent } from "../src/eventAddressNarrow.js";
import type { NormalizedEvent } from "../src/index.js";

describe("eventAddressNarrow", () => {
  describe("describeEvent", () => {
    it("describes payment events (payment.received, payment.sent, payment.self)", () => {
      const received = {
        type: "payment.received",
        from: "GSRC123",
        to: "GDEST456",
      } as unknown as NormalizedEvent;
      expect(describeEvent(received)).toBe("Payment payment.received from GSRC123 to GDEST456");

      const sent = {
        type: "payment.sent",
        from: "GSRC123",
        to: "GDEST456",
      } as unknown as NormalizedEvent;
      expect(describeEvent(sent)).toBe("Payment payment.sent from GSRC123 to GDEST456");

      const self = {
        type: "payment.self",
        from: "GSRC123",
        to: "GSRC123",
      } as unknown as NormalizedEvent;
      expect(describeEvent(self)).toBe("Payment payment.self from GSRC123 to GSRC123");
    });

    it("describes account.options_changed events", () => {
      const event = {
        type: "account.options_changed",
        source: "GACCOUNT123",
      } as unknown as NormalizedEvent;
      expect(describeEvent(event)).toBe("Account options changed for GACCOUNT123");
    });

    it("describes account.created events", () => {
      const event = {
        type: "account.created",
        account: "GNEWACC",
        funder: "GFUNDERACC",
      } as unknown as NormalizedEvent;
      expect(describeEvent(event)).toBe("Account created: GNEWACC funded by GFUNDERACC");
    });

    it("describes trustline events (added, removed, updated)", () => {
      const added = {
        type: "trustline.added",
        account: "GACC123",
      } as unknown as NormalizedEvent;
      expect(describeEvent(added)).toBe("Trustline trustline.added for GACC123");

      const removed = {
        type: "trustline.removed",
        account: "GACC123",
      } as unknown as NormalizedEvent;
      expect(describeEvent(removed)).toBe("Trustline trustline.removed for GACC123");

      const updated = {
        type: "trustline.updated",
        account: "GACC123",
      } as unknown as NormalizedEvent;
      expect(describeEvent(updated)).toBe("Trustline trustline.updated for GACC123");
    });

    it("describes account.merged events", () => {
      const event = {
        type: "account.merged",
        source: "GSOURCE",
        destination: "GDEST",
      } as unknown as NormalizedEvent;
      expect(describeEvent(event)).toBe("Account merged: GSOURCE -> GDEST");
    });

    it("describes offer events (created, updated, deleted)", () => {
      const created = {
        type: "offer.created",
        source: "GTRADER",
      } as unknown as NormalizedEvent;
      expect(describeEvent(created)).toBe("Offer offer.created by GTRADER");

      const updated = {
        type: "offer.updated",
        source: "GTRADER",
      } as unknown as NormalizedEvent;
      expect(describeEvent(updated)).toBe("Offer offer.updated by GTRADER");

      const deleted = {
        type: "offer.deleted",
        source: "GTRADER",
      } as unknown as NormalizedEvent;
      expect(describeEvent(deleted)).toBe("Offer offer.deleted by GTRADER");
    });

    it("describes account.bump_sequence events", () => {
      const event = {
        type: "account.bump_sequence",
        source: "GACC",
      } as unknown as NormalizedEvent;
      expect(describeEvent(event)).toBe("Bump sequence for GACC");
    });

    it("describes data events (set, cleared)", () => {
      const set = {
        type: "data.set",
        source: "GACC",
      } as unknown as NormalizedEvent;
      expect(describeEvent(set)).toBe("Data data.set for GACC");

      const cleared = {
        type: "data.cleared",
        source: "GACC",
      } as unknown as NormalizedEvent;
      expect(describeEvent(cleared)).toBe("Data data.cleared for GACC");
    });

    it("describes claimable balance events (created, claimed)", () => {
      const created = {
        type: "claimable.created",
        sponsor: "GSPONSOR",
      } as unknown as NormalizedEvent;
      expect(describeEvent(created)).toBe("Claimable created by GSPONSOR");

      const claimed = {
        type: "claimable.claimed",
        claimant: "GCLAIMANT",
      } as unknown as NormalizedEvent;
      expect(describeEvent(claimed)).toBe("Claimable claimed by GCLAIMANT");
    });

    it("describes liquidity pool events (deposited, withdrawn)", () => {
      const dep = {
        type: "lp.deposited",
        source: "GLPPROVIDER",
      } as unknown as NormalizedEvent;
      expect(describeEvent(dep)).toBe("Liquidity pool deposit by GLPPROVIDER");

      const withdr = {
        type: "lp.withdrawn",
        source: "GLPPROVIDER",
      } as unknown as NormalizedEvent;
      expect(describeEvent(withdr)).toBe("Liquidity pool withdrawal by GLPPROVIDER");
    });

    it("describes trustline authorization events (authorized, deauthorized)", () => {
      const auth = {
        type: "trustline.authorized",
        trustor: "GTRUSTOR",
        issuer: "GISSUER",
      } as unknown as NormalizedEvent;
      expect(describeEvent(auth)).toBe("Trust trustline.authorized between GTRUSTOR and GISSUER");

      const deauth = {
        type: "trustline.deauthorized",
        trustor: "GTRUSTOR",
        issuer: "GISSUER",
      } as unknown as NormalizedEvent;
      expect(describeEvent(deauth)).toBe(
        "Trust trustline.deauthorized between GTRUSTOR and GISSUER",
      );
    });

    it("describes asset.clawback events", () => {
      const event = {
        type: "asset.clawback",
        from: "GHOLDER",
      } as unknown as NormalizedEvent;
      expect(describeEvent(event)).toBe("Clawback from GHOLDER");
    });

    it("describes fee.incurred events", () => {
      const event = {
        type: "fee.incurred",
        from: "GFEEACCOUNT",
      } as unknown as NormalizedEvent;
      expect(describeEvent(event)).toBe("Fee incurred by GFEEACCOUNT");
    });

    it("describes contract events (invoked, emitted)", () => {
      const invoked = {
        type: "contract.invoked",
        contractId: "CCONTRACT123",
      } as unknown as NormalizedEvent;
      expect(describeEvent(invoked)).toBe("Contract invoked CCONTRACT123");

      const emitted = {
        type: "contract.emitted",
        contractId: "CCONTRACT456",
      } as unknown as NormalizedEvent;
      expect(describeEvent(emitted)).toBe("Contract emitted CCONTRACT456");
    });

    it("describes anchor transaction_status_changed events", () => {
      const event = {
        type: "anchor.transaction_status_changed",
        transaction_id: "tx_abc123",
        status: "pending_anchor",
      } as unknown as NormalizedEvent;
      expect(describeEvent(event)).toBe(
        "Anchor transaction tx_abc123 status changed to pending_anchor",
      );
    });

    it("describes anchor deposit events across all stages", () => {
      const stages = ["initiated", "pending", "completed", "refunded", "failed"] as const;
      for (const stage of stages) {
        const type = `anchor.deposit.${stage}` as const;
        const event = {
          type,
          transactionId: `tx_dep_${stage}`,
          stage,
          protocolStatus: "completed",
        } as unknown as NormalizedEvent;
        expect(describeEvent(event)).toBe(`Anchor deposit tx_dep_${stage} ${stage} (completed)`);
      }
    });

    it("describes anchor withdrawal events across all stages", () => {
      const stages = ["initiated", "pending", "completed", "refunded", "failed"] as const;
      for (const stage of stages) {
        const type = `anchor.withdrawal.${stage}` as const;
        const event = {
          type,
          transactionId: `tx_with_${stage}`,
          stage,
          protocolStatus: "pending_user_transfer_start",
        } as unknown as NormalizedEvent;
        expect(describeEvent(event)).toBe(
          `Anchor withdrawal tx_with_${stage} ${stage} (pending_user_transfer_start)`,
        );
      }
    });

    it("describes anchor payment events across all stages", () => {
      const stages = ["initiated", "pending", "completed", "refunded", "failed"] as const;
      for (const stage of stages) {
        const type = `anchor.payment.${stage}` as const;
        const event = {
          type,
          transactionId: `tx_pay_${stage}`,
          stage,
          protocolStatus: "settled",
        } as unknown as NormalizedEvent;
        expect(describeEvent(event)).toBe(`Anchor payment tx_pay_${stage} ${stage} (settled)`);
      }
    });

    it("handles fallback default branch when given an unknown event type", () => {
      const unknownEvent = {
        type: "unknown.event_type",
      } as unknown as NormalizedEvent;
      expect(describeEvent(unknownEvent)).toBe(unknownEvent);
    });
  });
});
