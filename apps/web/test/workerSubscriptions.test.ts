import { createHash } from "node:crypto";
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { GET, POST } from "@/app/api/workers/subscriptions/route";

const PATH = "/api/workers/subscriptions";
const ORIGIN = "https://orbital.example";
const MINUTE = 60_000;

const SUBSCRIPTION = JSON.stringify({
  offering: "payroll-backstop",
  webhookTarget: "https://hooks.example.com/orbital",
});

/**
 * Signs a request the way issue #1400 specifies. Written out here, not
 * imported from `lib/subscriberAuth`, so these tests check the route against
 * the scheme rather than against its own helper.
 */
function sign(
  signer: Keypair,
  request: { method: string; pathAndQuery: string; body?: string; timestamp?: string },
): Record<string, string> {
  const timestamp = request.timestamp ?? String(Date.now());
  const bodyHash = request.body
    ? createHash("sha256").update(request.body, "utf8").digest("hex")
    : "";
  const message = [
    "orbital-subscriptions-v1",
    request.method,
    request.pathAndQuery,
    timestamp,
    bodyHash,
  ].join("\n");
  const digest = createHash("sha256")
    .update("Stellar Signed Message:\n" + message, "utf8")
    .digest();
  return {
    "x-orbital-subscriber": signer.publicKey(),
    "x-orbital-timestamp": timestamp,
    "x-orbital-signature": signer.sign(digest).toString("base64"),
  };
}

function get(pathAndQuery: string, headers: Record<string, string>): Promise<Response> {
  return GET(new NextRequest(ORIGIN + pathAndQuery, { headers }));
}

function post(headers: Record<string, string>, body?: string): Promise<Response> {
  return POST(new NextRequest(ORIGIN + PATH, { method: "POST", headers, body }));
}

/** A correctly signed create, for tests that need a subscription to exist. */
async function subscribe(signer: Keypair, body = SUBSCRIPTION): Promise<Response> {
  return post(sign(signer, { method: "POST", pathAndQuery: PATH, body }), body);
}

async function listed(res: Response): Promise<Array<{ subscriber: string; offering: string }>> {
  return ((await res.json()) as { subscriptions: Array<{ subscriber: string; offering: string }> })
    .subscriptions;
}

const UNAUTHENTICATED = {
  error: "unauthenticated",
  message:
    "Sign the request as the subscriber: send x-orbital-subscriber, x-orbital-timestamp and x-orbital-signature.",
};

async function expectRefused(res: Response): Promise<void> {
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual(UNAUTHENTICATED);
}

/** The same address with its last character swapped, so only the checksum is wrong. */
function withWrongChecksum(address: string): string {
  return address.slice(0, -1) + (address.endsWith("A") ? "B" : "A");
}

describe("POST /api/workers/subscriptions", () => {
  it("creates a subscription for the key that signed the request", async () => {
    const alice = Keypair.random();

    const res = await subscribe(alice);

    expect(res.status).toBe(201);
    const record = (await res.json()) as Record<string, unknown>;
    expect(record.subscriber).toBe(alice.publicKey());
    expect(record.offering).toBe("payroll-backstop");
    expect(record.webhookTarget).toBe("https://hooks.example.com/orbital");
    expect(record.status).toBe("active");
  });

  it("uses the signer as the subscriber even when the body names someone else", async () => {
    const alice = Keypair.random();
    const bob = Keypair.random();
    const body = JSON.stringify({ ...JSON.parse(SUBSCRIPTION), subscriber: bob.publicKey() });

    const res = await subscribe(alice, body);

    expect(res.status).toBe(201);
    expect(((await res.json()) as { subscriber: string }).subscriber).toBe(alice.publicKey());
    const bobs = await get(PATH, sign(bob, { method: "GET", pathAndQuery: PATH }));
    expect(await listed(bobs)).toEqual([]);
  });

  it("refuses a bare x-orbital-subscriber header, which used to be enough", async () => {
    const alice = Keypair.random();

    const res = await post({ "x-orbital-subscriber": alice.publicKey() }, SUBSCRIPTION);

    await expectRefused(res);
  });

  it("refuses a request signed by a different key than the subscriber it names", async () => {
    const alice = Keypair.random();
    const mallory = Keypair.random();
    const headers = sign(mallory, { method: "POST", pathAndQuery: PATH, body: SUBSCRIPTION });

    const res = await post({ ...headers, "x-orbital-subscriber": alice.publicKey() }, SUBSCRIPTION);

    await expectRefused(res);
    const alices = await get(PATH, sign(alice, { method: "GET", pathAndQuery: PATH }));
    expect(await listed(alices)).toEqual([]);
  });

  it("refuses a body that was changed after it was signed", async () => {
    const alice = Keypair.random();
    const headers = sign(alice, { method: "POST", pathAndQuery: PATH, body: SUBSCRIPTION });
    const tampered = SUBSCRIPTION.replace("hooks.example.com", "hooks.attacker.example");

    const res = await post(headers, tampered);

    await expectRefused(res);
    const alices = await get(PATH, sign(alice, { method: "GET", pathAndQuery: PATH }));
    expect(await listed(alices)).toEqual([]);
  });

  it("refuses a body added to, or dropped from, what was signed", async () => {
    const alice = Keypair.random();
    const signedWithout = sign(alice, { method: "POST", pathAndQuery: PATH });
    const signedWith = sign(alice, { method: "POST", pathAndQuery: PATH, body: SUBSCRIPTION });

    await expectRefused(await post(signedWithout, SUBSCRIPTION));
    await expectRefused(await post(signedWith));
  });

  it("signs an empty body as an empty field, not as the hash of nothing", async () => {
    const alice = Keypair.random();
    const emptyField = sign(alice, { method: "POST", pathAndQuery: PATH });
    const timestamp = String(Date.now());
    const hashOfNothing = createHash("sha256").update("").digest("hex");
    const digest = createHash("sha256")
      .update(
        `Stellar Signed Message:\norbital-subscriptions-v1\nPOST\n${PATH}\n${timestamp}\n${hashOfNothing}`,
        "utf8",
      )
      .digest();

    // Authenticated, then turned down for what it asks: the body has no fields.
    const accepted = await post(emptyField);
    expect(accepted.status).toBe(400);
    expect(((await accepted.json()) as { error: string }).error).toBe("invalid_field");

    await expectRefused(
      await post({
        "x-orbital-subscriber": alice.publicKey(),
        "x-orbital-timestamp": timestamp,
        "x-orbital-signature": alice.sign(digest).toString("base64"),
      }),
    );
  });

  it("refuses a timestamp more than five minutes old or five minutes ahead", async () => {
    const alice = Keypair.random();
    const stale = String(Date.now() - 5 * MINUTE - 1_000);
    const ahead = String(Date.now() + 5 * MINUTE + 1_000);
    const recent = String(Date.now() - 4 * MINUTE);

    for (const timestamp of [stale, ahead]) {
      const headers = sign(alice, {
        method: "POST",
        pathAndQuery: PATH,
        body: SUBSCRIPTION,
        timestamp,
      });
      await expectRefused(await post(headers, SUBSCRIPTION));
    }

    const headers = sign(alice, {
      method: "POST",
      pathAndQuery: PATH,
      body: SUBSCRIPTION,
      timestamp: recent,
    });
    expect((await post(headers, SUBSCRIPTION)).status).toBe(201);
  });

  it("refuses a signature made for another method or another path", async () => {
    const alice = Keypair.random();
    const forGet = sign(alice, { method: "GET", pathAndQuery: PATH });
    const forOtherPath = sign(alice, {
      method: "POST",
      pathAndQuery: "/api/workers/operators",
      body: SUBSCRIPTION,
    });

    await expectRefused(await post(forGet));
    await expectRefused(await post(forOtherPath, SUBSCRIPTION));
  });

  it("still answers a signed request for its content: bad JSON, missing fields, too large", async () => {
    const alice = Keypair.random();
    const notJson = "{not json";
    const noTarget = JSON.stringify({ offering: "payroll-backstop" });
    const tooLarge = JSON.stringify({
      offering: "x".repeat(5_000),
      webhookTarget: "https://a.example",
    });

    const bad = await subscribe(alice, notJson);
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toBe("invalid_json");

    const missing = await subscribe(alice, noTarget);
    expect(missing.status).toBe(400);
    expect(((await missing.json()) as { error: string }).error).toBe("invalid_field");

    const large = await subscribe(alice, tooLarge);
    expect(large.status).toBe(413);
  });

  it("turns away a caller with no credentials without reading the body", async () => {
    const request = new NextRequest(ORIGIN + PATH, { method: "POST", body: "x".repeat(5_000) });
    const read = vi.spyOn(request, "arrayBuffer");

    await expectRefused(await POST(request));

    expect(read).not.toHaveBeenCalled();
  });
});

describe("GET /api/workers/subscriptions", () => {
  it("lists the signer's own subscriptions", async () => {
    const alice = Keypair.random();
    await subscribe(alice);

    const res = await get(PATH, sign(alice, { method: "GET", pathAndQuery: PATH }));

    expect(res.status).toBe(200);
    const subscriptions = await listed(res);
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]?.subscriber).toBe(alice.publicKey());
    expect(subscriptions[0]?.offering).toBe("payroll-backstop");
  });

  it("accepts the signer's own address in the subscriber query, which is signed too", async () => {
    const alice = Keypair.random();
    await subscribe(alice);
    const pathAndQuery = `${PATH}?subscriber=${alice.publicKey()}`;

    const res = await get(pathAndQuery, sign(alice, { method: "GET", pathAndQuery }));

    expect(res.status).toBe(200);
    expect(await listed(res)).toHaveLength(1);
  });

  it("refuses a bare x-orbital-subscriber header, which used to be enough", async () => {
    const alice = Keypair.random();
    await subscribe(alice);

    const res = await get(PATH, { "x-orbital-subscriber": alice.publicKey() });

    await expectRefused(res);
  });

  it("does not let another subscriber read them", async () => {
    const alice = Keypair.random();
    const mallory = Keypair.random();
    await subscribe(alice);
    const asMallory = sign(mallory, { method: "GET", pathAndQuery: PATH });
    const victimQuery = `${PATH}?subscriber=${alice.publicKey()}`;

    // Signing as herself, Mallory sees her own (empty) list.
    expect(await listed(await get(PATH, asMallory))).toEqual([]);

    // Naming Alice in the header with Mallory's signature is not Alice.
    await expectRefused(
      await get(PATH, { ...asMallory, "x-orbital-subscriber": alice.publicKey() }),
    );

    // Asking for Alice's list as herself is forbidden, as it was before.
    const forbidden = await get(
      victimQuery,
      sign(mallory, { method: "GET", pathAndQuery: victimQuery }),
    );
    expect(forbidden.status).toBe(403);
  });

  it("refuses a query that was changed after it was signed", async () => {
    const alice = Keypair.random();
    const signedBare = sign(alice, { method: "GET", pathAndQuery: PATH });
    const withQuery = `${PATH}?subscriber=${alice.publicKey()}`;
    const signedWithQuery = sign(alice, { method: "GET", pathAndQuery: withQuery });

    await expectRefused(await get(withQuery, signedBare));
    await expectRefused(await get(PATH, signedWithQuery));
  });

  it("refuses a stale timestamp", async () => {
    const alice = Keypair.random();
    const timestamp = String(Date.now() - 5 * MINUTE - 1_000);

    const res = await get(PATH, sign(alice, { method: "GET", pathAndQuery: PATH, timestamp }));

    await expectRefused(res);
  });

  it.each([["x-orbital-subscriber"], ["x-orbital-timestamp"], ["x-orbital-signature"]])(
    "refuses a request with no %s header",
    async (missing) => {
      const alice = Keypair.random();
      const signed = sign(alice, { method: "GET", pathAndQuery: PATH });
      const headers = Object.fromEntries(
        Object.entries(signed).filter(([name]) => name !== missing),
      );

      await expectRefused(await get(PATH, headers));
    },
  );

  it.each([
    ["not an address", "alice"],
    ["a lower-cased address", Keypair.random().publicKey().toLowerCase()],
    ["an address with a wrong checksum", withWrongChecksum(Keypair.random().publicKey())],
    ["a secret key", Keypair.random().secret()],
    ["a contract address", StrKey.encodeContract(Buffer.alloc(32, 9))],
    [
      "a muxed address",
      StrKey.encodeMed25519PublicKey(
        Buffer.concat([Keypair.random().rawPublicKey(), Buffer.alloc(8, 1)]),
      ),
    ],
  ])("refuses a subscriber that is %s", async (_name, subscriber) => {
    const alice = Keypair.random();
    const headers = sign(alice, { method: "GET", pathAndQuery: PATH });

    await expectRefused(await get(PATH, { ...headers, "x-orbital-subscriber": subscriber }));
  });

  it.each([
    ["a decimal", (now: number) => `${now}.0`],
    ["an exponent", (now: number) => now.toExponential()],
    ["a negative number", (now: number) => `-${now}`],
    ["a number with a sign", (now: number) => `+${now}`],
    ["an ISO date", (now: number) => new Date(now).toISOString()],
    ["seconds instead of milliseconds", (now: number) => String(Math.floor(now / 1000))],
  ])("refuses a timestamp that is %s, even when it is what was signed", async (_name, format) => {
    const alice = Keypair.random();
    const timestamp = format(Date.now());

    const res = await get(PATH, sign(alice, { method: "GET", pathAndQuery: PATH, timestamp }));

    await expectRefused(res);
  });

  it.each([
    ["without padding", (signature: string) => signature.replace(/=+$/, "")],
    [
      "with characters that are not base64",
      (signature: string) => `${signature.slice(0, 10)}!!${signature.slice(10)}`,
    ],
    ["with bytes added", (signature: string) => `${signature}AAAA`],
    [
      "cut short",
      (signature: string) => Buffer.from(signature, "base64").subarray(0, 63).toString("base64"),
    ],
    ["in hex", (signature: string) => Buffer.from(signature, "base64").toString("hex")],
  ])("refuses a signature %s", async (_name, mangle) => {
    const alice = Keypair.random();
    const headers = sign(alice, { method: "GET", pathAndQuery: PATH });
    const signature = mangle(headers["x-orbital-signature"] ?? "");

    await expectRefused(await get(PATH, { ...headers, "x-orbital-signature": signature }));
  });
});
