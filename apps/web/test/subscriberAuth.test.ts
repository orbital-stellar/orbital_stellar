import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { SEP53_MESSAGE_PREFIX } from "@orbital-stellar/abi-registry";
import {
  SUBSCRIBER_AUTH_DOMAIN,
  SUBSCRIBER_AUTH_WINDOW_MS,
  SUBSCRIBER_HEADER,
  SUBSCRIBER_SIGNATURE_HEADER,
  SUBSCRIBER_TIMESTAMP_HEADER,
  readSubscriberClaim,
  subscriberBodyHash,
  subscriberSigningDigest,
  subscriberSigningMessage,
  verifySubscriberClaim,
  verifySubscriberRequest,
} from "@/lib/subscriberAuth";

/**
 * A fixed request and its signature, worked out with Node's own SHA-256 and
 * ed25519 rather than with the code under test. The key is the one whose seed
 * is 32 bytes of 0x07. `docs/api/workers.md` quotes the same values, so a
 * change here is a change to the documented scheme.
 */
const SIGNER = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 7));
const ADDRESS = "GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57";
const TIMESTAMP = "1700000000000";
const NOW = 1_700_000_000_000;
const PATH = "/api/workers/subscriptions";
const BODY = '{"offering":"payroll-backstop","webhookTarget":"https://hooks.example.com/orbital"}';
const BODY_HASH = "714fe8859a1a06f95032091e4894493ff1172044a4288cfbdf9bdd3011f9b2c5";

const POST_VECTOR = {
  message: `orbital-subscriptions-v1\nPOST\n${PATH}\n${TIMESTAMP}\n${BODY_HASH}`,
  digest: "da4a11bca8484d89217c55bcea0adcfaf4b4ada77138de71dbc31ab4b70365a4",
  signature:
    "Xy5Uh18JnO8f07TkBcxtdMLxoqtSYiYMDBIEmk1QZB3Y12je263x5x8VxbS4HYYzu/uW/1ENc6COY2Fe/BS5Bg==",
};

const GET_PATH = `${PATH}?subscriber=${ADDRESS}`;
const GET_VECTOR = {
  message: `orbital-subscriptions-v1\nGET\n${GET_PATH}\n${TIMESTAMP}\n`,
  digest: "40c7b8c62f2565ff8fb05bcfb0f8c756744bcdba7393e063a11f90d04ad15619",
  signature:
    "OQUOVt40F4TMYZ5d8pBkf7M+x0pVtSrPAaOueQsd2mrh86qxGR3b6mjRfMbMOHAztpKwrIv4NJ/cUwjc40k1BQ==",
};

const bytes = (text: string) => new TextEncoder().encode(text);

function headers(overrides: Record<string, string | null> = {}): Headers {
  const all: Record<string, string | null> = {
    [SUBSCRIBER_HEADER]: ADDRESS,
    [SUBSCRIBER_TIMESTAMP_HEADER]: TIMESTAMP,
    [SUBSCRIBER_SIGNATURE_HEADER]: POST_VECTOR.signature,
    ...overrides,
  };
  const result = new Headers();
  for (const [name, value] of Object.entries(all)) {
    if (value !== null) result.set(name, value);
  }
  return result;
}

const postRequest = (extra: Record<string, string | null> = {}) => ({
  method: "POST",
  url: `https://orbital.example${PATH}`,
  headers: headers(extra),
});

const getRequest = (extra: Record<string, string | null> = {}) => ({
  method: "GET",
  url: `https://orbital.example${GET_PATH}`,
  headers: headers({ [SUBSCRIBER_SIGNATURE_HEADER]: GET_VECTOR.signature, ...extra }),
});

describe("the public contract of the scheme", () => {
  it("uses the documented domain, window and header names", () => {
    expect(SUBSCRIBER_AUTH_DOMAIN).toBe("orbital-subscriptions-v1");
    expect(SUBSCRIBER_AUTH_WINDOW_MS).toBe(5 * 60 * 1000);
    expect(SUBSCRIBER_HEADER).toBe("x-orbital-subscriber");
    expect(SUBSCRIBER_TIMESTAMP_HEADER).toBe("x-orbital-timestamp");
    expect(SUBSCRIBER_SIGNATURE_HEADER).toBe("x-orbital-signature");
  });

  it("reuses the SEP-53 prefix the attestation code signs with", () => {
    expect(SEP53_MESSAGE_PREFIX).toBe("Stellar Signed Message:\n");
  });

  it("is the key the fixed values were worked out for", () => {
    expect(SIGNER.publicKey()).toBe(ADDRESS);
  });
});

describe("subscriberBodyHash", () => {
  it("is the lower-case SHA-256 hex of the bytes", () => {
    expect(subscriberBodyHash(bytes(BODY))).toBe(BODY_HASH);
    expect(subscriberBodyHash(bytes("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is empty for a request with no body, not the hash of nothing", () => {
    expect(subscriberBodyHash()).toBe("");
    expect(subscriberBodyHash(null)).toBe("");
    expect(subscriberBodyHash(new Uint8Array())).toBe("");
  });
});

describe("subscriberSigningMessage", () => {
  it("joins the domain, method, path and query, timestamp and body hash with newlines", () => {
    expect(
      subscriberSigningMessage({
        method: "POST",
        pathAndQuery: PATH,
        timestamp: TIMESTAMP,
        body: bytes(BODY),
      }),
    ).toBe(POST_VECTOR.message);
  });

  it("ends with an empty line for a request with no body", () => {
    expect(
      subscriberSigningMessage({ method: "GET", pathAndQuery: GET_PATH, timestamp: TIMESTAMP }),
    ).toBe(GET_VECTOR.message);
  });

  it("signs the method in upper case", () => {
    expect(
      subscriberSigningMessage({ method: "get", pathAndQuery: GET_PATH, timestamp: TIMESTAMP }),
    ).toBe(GET_VECTOR.message);
  });
});

describe("subscriberSigningDigest", () => {
  it("is SHA-256 of the SEP-53 prefix followed by the message", () => {
    const post = subscriberSigningDigest({
      method: "POST",
      pathAndQuery: PATH,
      timestamp: TIMESTAMP,
      body: bytes(BODY),
    });
    const get = subscriberSigningDigest({
      method: "GET",
      pathAndQuery: GET_PATH,
      timestamp: TIMESTAMP,
    });

    expect(post.toString("hex")).toBe(POST_VECTOR.digest);
    expect(get.toString("hex")).toBe(GET_VECTOR.digest);
    expect(post.toString("hex")).toBe(
      createHash("sha256")
        .update("Stellar Signed Message:\n" + POST_VECTOR.message, "utf8")
        .digest("hex"),
    );
  });

  it("is what the fixed signatures sign", () => {
    expect(SIGNER.sign(Buffer.from(POST_VECTOR.digest, "hex")).toString("base64")).toBe(
      POST_VECTOR.signature,
    );
    expect(SIGNER.sign(Buffer.from(GET_VECTOR.digest, "hex")).toString("base64")).toBe(
      GET_VECTOR.signature,
    );
  });
});

describe("verifySubscriberRequest", () => {
  it("accepts the fixed POST and names the address that signed it", () => {
    expect(verifySubscriberRequest(postRequest(), bytes(BODY), NOW)).toEqual({
      ok: true,
      subscriber: ADDRESS,
    });
  });

  it("accepts the fixed GET, which has no body", () => {
    expect(verifySubscriberRequest(getRequest(), null, NOW)).toEqual({
      ok: true,
      subscriber: ADDRESS,
    });
    expect(verifySubscriberRequest(getRequest(), undefined, NOW).ok).toBe(true);
  });

  it("checks the signature over the timestamp exactly as it was sent", () => {
    const timestamp = `0${TIMESTAMP}`;
    const digest = createHash("sha256")
      .update(
        `Stellar Signed Message:\norbital-subscriptions-v1\nGET\n${GET_PATH}\n${timestamp}\n`,
        "utf8",
      )
      .digest();
    const request = getRequest({
      [SUBSCRIBER_TIMESTAMP_HEADER]: timestamp,
      [SUBSCRIBER_SIGNATURE_HEADER]: SIGNER.sign(digest).toString("base64"),
    });

    expect(verifySubscriberRequest(request, null, NOW)).toEqual({ ok: true, subscriber: ADDRESS });
  });

  it("uses the current time when it is not given one", () => {
    // The fixed timestamp is from 2023, so against the real clock it is stale.
    expect(verifySubscriberRequest(postRequest(), bytes(BODY))).toEqual({
      ok: false,
      reason: "stale-timestamp",
    });
  });

  it.each([
    ["the body", () => verifySubscriberRequest(postRequest(), bytes(BODY + " "), NOW)],
    ["a missing body", () => verifySubscriberRequest(postRequest(), null, NOW)],
    [
      "the method",
      () => verifySubscriberRequest({ ...postRequest(), method: "PUT" }, bytes(BODY), NOW),
    ],
    [
      "the path",
      () =>
        verifySubscriberRequest(
          { ...postRequest(), url: "https://orbital.example/api/workers/operators" },
          bytes(BODY),
          NOW,
        ),
    ],
    [
      "the query",
      () =>
        verifySubscriberRequest(
          { ...postRequest(), url: `https://orbital.example${PATH}?subscriber=${ADDRESS}` },
          bytes(BODY),
          NOW,
        ),
    ],
    [
      "the timestamp",
      () =>
        verifySubscriberRequest(
          postRequest({ [SUBSCRIBER_TIMESTAMP_HEADER]: "1700000000001" }),
          bytes(BODY),
          NOW,
        ),
    ],
    [
      "the subscriber",
      () =>
        verifySubscriberRequest(
          postRequest({ [SUBSCRIBER_HEADER]: Keypair.random().publicKey() }),
          bytes(BODY),
          NOW,
        ),
    ],
    [
      "the signature",
      () =>
        verifySubscriberRequest(
          postRequest({ [SUBSCRIBER_SIGNATURE_HEADER]: GET_VECTOR.signature }),
          bytes(BODY),
          NOW,
        ),
    ],
  ])("refuses the signature when %s is not what was signed", (_name, verify) => {
    expect(verify()).toEqual({ ok: false, reason: "invalid-signature" });
  });

  it("does not care which host the request reached", () => {
    const elsewhere = { ...postRequest(), url: `https://staging.orbital.example${PATH}` };

    expect(verifySubscriberRequest(elsewhere, bytes(BODY), NOW).ok).toBe(true);
  });

  it("refuses a URL it cannot read instead of throwing", () => {
    const relative = { ...postRequest(), url: PATH };

    expect(verifySubscriberRequest(relative, bytes(BODY), NOW)).toEqual({
      ok: false,
      reason: "invalid-signature",
    });
  });
});

describe("readSubscriberClaim", () => {
  it("returns the three values for well-formed, fresh headers", () => {
    const claim = readSubscriberClaim(headers(), NOW);

    expect(claim).toEqual({
      ok: true,
      subscriber: ADDRESS,
      timestamp: TIMESTAMP,
      signature: Buffer.from(POST_VECTOR.signature, "base64"),
    });
  });

  it.each([[SUBSCRIBER_HEADER], [SUBSCRIBER_TIMESTAMP_HEADER], [SUBSCRIBER_SIGNATURE_HEADER]])(
    "reports a missing %s",
    (name) => {
      expect(readSubscriberClaim(headers({ [name]: null }), NOW)).toEqual({
        ok: false,
        reason: "missing-header",
      });
      expect(readSubscriberClaim(headers({ [name]: "" }), NOW)).toEqual({
        ok: false,
        reason: "missing-header",
      });
    },
  );

  it.each([
    ["text", "alice"],
    ["a lower-cased address", ADDRESS.toLowerCase()],
    ["a wrong checksum", `${ADDRESS.slice(0, -1)}A`],
    ["a secret key", SIGNER.secret()],
    ["two addresses", `${ADDRESS}, ${ADDRESS}`],
  ])("reports a subscriber that is %s", (_name, subscriber) => {
    expect(readSubscriberClaim(headers({ [SUBSCRIBER_HEADER]: subscriber }), NOW)).toEqual({
      ok: false,
      reason: "invalid-subscriber",
    });
  });

  it.each([
    ["1700000000000.0"],
    ["1.7e12"],
    ["-1700000000000"],
    ["+1700000000000"],
    ["0x18bcfe56800"],
    ["1700000000000ms"],
    ["2023-11-14T22:13:20.000Z"],
    ["17000000000000000"],
  ])("reports the timestamp %s as malformed", (timestamp) => {
    expect(readSubscriberClaim(headers({ [SUBSCRIBER_TIMESTAMP_HEADER]: timestamp }), NOW)).toEqual(
      {
        ok: false,
        reason: "invalid-timestamp",
      },
    );
  });

  it("accepts a timestamp exactly five minutes from now, either way", () => {
    expect(readSubscriberClaim(headers(), NOW + SUBSCRIBER_AUTH_WINDOW_MS).ok).toBe(true);
    expect(readSubscriberClaim(headers(), NOW - SUBSCRIBER_AUTH_WINDOW_MS).ok).toBe(true);
  });

  it("reports a timestamp one millisecond past five minutes, either way", () => {
    const stale = { ok: false, reason: "stale-timestamp" };

    expect(readSubscriberClaim(headers(), NOW + SUBSCRIBER_AUTH_WINDOW_MS + 1)).toEqual(stale);
    expect(readSubscriberClaim(headers(), NOW - SUBSCRIBER_AUTH_WINDOW_MS - 1)).toEqual(stale);
  });

  it("reports seconds sent in place of milliseconds as stale", () => {
    expect(
      readSubscriberClaim(headers({ [SUBSCRIBER_TIMESTAMP_HEADER]: "1700000000" }), NOW),
    ).toEqual({
      ok: false,
      reason: "stale-timestamp",
    });
  });

  it.each([
    ["without its padding", GET_VECTOR.signature.replace(/=+$/, "")],
    ["in the URL-safe alphabet", GET_VECTOR.signature.replace(/\+/g, "-").replace(/\//g, "_")],
    [
      "with a character that is not base64",
      `${GET_VECTOR.signature.slice(0, 10)}!${GET_VECTOR.signature.slice(10)}`,
    ],
    ["with bytes added", `${GET_VECTOR.signature}AAAA`],
    ["of 63 bytes", Buffer.alloc(63, 1).toString("base64")],
    ["of 65 bytes", Buffer.alloc(65, 1).toString("base64")],
    ["in hex", Buffer.from(GET_VECTOR.signature, "base64").toString("hex")],
  ])("reports a signature %s as malformed", (_name, signature) => {
    expect(readSubscriberClaim(headers({ [SUBSCRIBER_SIGNATURE_HEADER]: signature }), NOW)).toEqual(
      {
        ok: false,
        reason: "invalid-signature",
      },
    );
  });

  it("checks the subscriber, then the timestamp, then the signature", () => {
    const everythingWrong = headers({
      [SUBSCRIBER_HEADER]: "alice",
      [SUBSCRIBER_TIMESTAMP_HEADER]: "soon",
      [SUBSCRIBER_SIGNATURE_HEADER]: "nope",
    });
    const timestampAndSignatureWrong = headers({
      [SUBSCRIBER_TIMESTAMP_HEADER]: "soon",
      [SUBSCRIBER_SIGNATURE_HEADER]: "nope",
    });
    const staleAndSignatureWrong = headers({ [SUBSCRIBER_SIGNATURE_HEADER]: "nope" });

    expect(readSubscriberClaim(everythingWrong, NOW)).toEqual({
      ok: false,
      reason: "invalid-subscriber",
    });
    expect(readSubscriberClaim(timestampAndSignatureWrong, NOW)).toEqual({
      ok: false,
      reason: "invalid-timestamp",
    });
    expect(readSubscriberClaim(staleAndSignatureWrong, NOW + 10 * 60 * 1000)).toEqual({
      ok: false,
      reason: "stale-timestamp",
    });
  });
});

describe("verifySubscriberClaim", () => {
  it("accepts a claim only for the request it was signed for", () => {
    const claim = readSubscriberClaim(headers(), NOW);
    if (!claim.ok) throw new Error("the fixed headers must parse");
    const request = { method: "POST", url: `https://orbital.example${PATH}` };

    expect(verifySubscriberClaim(claim, request, bytes(BODY))).toBe(true);
    expect(verifySubscriberClaim(claim, request, bytes(BODY.toUpperCase()))).toBe(false);
    expect(verifySubscriberClaim(claim, { ...request, method: "GET" }, bytes(BODY))).toBe(false);
    expect(verifySubscriberClaim(claim, request)).toBe(false);
  });

  it("refuses a signature by another key over the same request", () => {
    const other = Keypair.random();
    const signature = other.sign(Buffer.from(POST_VECTOR.digest, "hex"));
    const request = { method: "POST", url: `https://orbital.example${PATH}` };

    expect(
      verifySubscriberClaim(
        { subscriber: ADDRESS, timestamp: TIMESTAMP, signature },
        request,
        bytes(BODY),
      ),
    ).toBe(false);
    expect(
      verifySubscriberClaim(
        { subscriber: other.publicKey(), timestamp: TIMESTAMP, signature },
        request,
        bytes(BODY),
      ),
    ).toBe(true);
  });
});
