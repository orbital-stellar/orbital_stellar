import { describe, expect, it, vi, beforeEach } from "vitest";
import { Keypair, StrKey } from "@stellar/stellar-sdk";

const { checkWebhookCooldown } = vi.hoisted(() => ({
  checkWebhookCooldown: vi.fn(),
}));

vi.mock("@/lib/demo-limits", () => ({
  checkWebhookCooldown,
  clientIp: () => "203.0.113.9",
}));

import { POST } from "@/app/api/webhook-sample/route";

function post(body?: unknown, contentType = "application/json") {
  return POST(
    new Request("http://localhost/api/webhook-sample", {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  checkWebhookCooldown.mockReset();
  checkWebhookCooldown.mockResolvedValue({ ok: true });
});

describe("webhook-sample validation", () => {
  it("uses valid Ed25519 public keys for the sample addresses", async () => {
    const res = await post();
    const data = (await res.json()) as {
      event: { from: string; to: string };
    };

    expect(StrKey.isValidEd25519PublicKey(data.event.from)).toBe(true);
    expect(StrKey.isValidEd25519PublicKey(data.event.to)).toBe(true);
  });

  it("rejects hex strings as G-addresses", () => {
    expect(StrKey.isValidEd25519PublicKey("G" + "A".repeat(55))).toBe(false);
  });

  it("rejects invalid base32 strings", () => {
    expect(StrKey.isValidEd25519PublicKey("GABC")).toBe(false);
    expect(StrKey.isValidEd25519PublicKey("H" + "A".repeat(55))).toBe(false);
  });
});

describe("webhook-sample API", () => {
  it("returns a valid sample event with valid G-addresses", async () => {
    const res = await post();

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      sample: boolean;
      event: {
        type: string;
        asset: string;
        amount: string;
        from: string;
        to: string;
      };
      headers: Record<string, string>;
    };

    expect(data.sample).toBe(true);
    expect(data.event.type).toBe("payment.received");
    expect(data.event.asset).toBe("XLM");
    expect(data.event.amount).toBe("10.0000000");
    expect(StrKey.isValidEd25519PublicKey(data.event.from)).toBe(true);
    expect(StrKey.isValidEd25519PublicKey(data.event.to)).toBe(true);
    expect(data.headers["x-orbital-signature"]).toBeDefined();
    expect(data.headers["x-orbital-timestamp"]).toBeDefined();
    expect(data.headers["x-orbital-attempt"]).toBe("1");
  });

  it("rejects an invalid caller-supplied address with 400", async () => {
    const res = await post({ address: "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV" });

    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("invalid_address");
  });

  it("accepts a valid caller-supplied address", async () => {
    const validAddress = Keypair.random().publicKey();
    const res = await post({ address: validAddress });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { event: { to: string } };
    expect(data.event.to).toBe(validAddress);
  });

  it("returns 503 when the cooldown limiter is not configured", async () => {
    checkWebhookCooldown.mockResolvedValue({
      ok: false,
      status: 503,
      body: {
        error: "rate_limiter_not_configured",
        message: "webhook-sample is not configured.",
      },
    });

    const res = await post();
    expect(res.status).toBe(503);
  });

  it("returns 429 with Retry-After when the cooldown is active", async () => {
    checkWebhookCooldown.mockResolvedValue({
      ok: false,
      status: 429,
      body: {
        error: "demo_limit_reached",
        reason: "rate_limit",
        message: "Try again shortly.",
        retryAfterMs: 5_000,
        upgradeUrl: "/cloud",
      },
    });

    const res = await post();
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("5");
  });
});
