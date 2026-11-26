import { createHash } from "node:crypto";
import { SEP53_MESSAGE_PREFIX } from "@orbital-stellar/abi-registry";
import { Keypair, StrKey } from "@stellar/stellar-sdk";

/**
 * Proof that a caller controls the Stellar key they claim to be (issue #1400).
 *
 * A subscriber is identified by a Stellar account address. A bare
 * `x-orbital-subscriber` header is only a claim, and anyone can type anyone
 * else's address into it, so every request also carries a timestamp and an
 * ed25519 signature made with that address's key:
 *
 * - `x-orbital-subscriber`: the subscriber's account address (`G...`);
 * - `x-orbital-timestamp`: unix time in milliseconds, as decimal digits;
 * - `x-orbital-signature`: base64 of the 64-byte signature.
 *
 * What is signed is five lines joined by `\n`:
 *
 * ```text
 * orbital-subscriptions-v1
 * <METHOD>
 * <path+query>
 * <timestamp>
 * <sha256 hex of body, or empty>
 * ```
 *
 * and it is signed as a SEP-53 message, that is, the key signs
 * `SHA-256("Stellar Signed Message:\n" + message)`. This is the signature
 * model `@orbital-stellar/abi-registry` already uses for attestations, so any
 * SEP-53-aware wallet or library can produce it.
 *
 * Binding the method, the path and query, and the body hash means a captured
 * signature cannot be pointed at another route or carry another payload. The
 * timestamp bounds how long it can be replayed as it is. Two limits remain,
 * and callers of this helper should say so where they use it:
 *
 * - there is no nonce store, so the same request can be replayed until its
 *   timestamp leaves the {@link SUBSCRIBER_AUTH_WINDOW_MS} window;
 * - the host is not part of the message, so a request signed for one
 *   deployment is valid on another inside that window.
 *
 * Nothing here accepts a secret key: the server only ever verifies.
 */

/** First line of every signed message, so a signature made for anything else cannot be reused here. */
export const SUBSCRIBER_AUTH_DOMAIN = "orbital-subscriptions-v1";

/** How far `x-orbital-timestamp` may be from server time, in either direction. */
export const SUBSCRIBER_AUTH_WINDOW_MS = 5 * 60 * 1000;

export const SUBSCRIBER_HEADER = "x-orbital-subscriber";
export const SUBSCRIBER_TIMESTAMP_HEADER = "x-orbital-timestamp";
export const SUBSCRIBER_SIGNATURE_HEADER = "x-orbital-signature";

/** Why a request was refused. For logs and tests: the HTTP response does not say which. */
export type SubscriberAuthFailure =
  | "missing-header"
  | "invalid-subscriber"
  | "invalid-timestamp"
  | "stale-timestamp"
  | "invalid-signature";

/** The three headers, checked for shape and freshness but not yet for the signature. */
export type SubscriberClaim = {
  /** A well-formed account address. Not proven until {@link verifySubscriberClaim} says so. */
  subscriber: string;
  /** The timestamp exactly as sent, because that string is what was signed. */
  timestamp: string;
  signature: Buffer;
};

export type SubscriberClaimResult =
  ({ ok: true } & SubscriberClaim) | { ok: false; reason: SubscriberAuthFailure };

export type SubscriberAuthResult =
  { ok: true; subscriber: string } | { ok: false; reason: SubscriberAuthFailure };

/** The parts of a request that the signature covers. */
export type SubscriberSigningInput = {
  /** HTTP method. Signed in upper case. */
  method: string;
  /** Path and query exactly as requested: `pathname + search` of the request URL. */
  pathAndQuery: string;
  /** Unix time in milliseconds, as the decimal string sent in the header. */
  timestamp: string;
  /** The exact body bytes. Absent or empty means the request has no body. */
  body?: Uint8Array | null;
};

/** Lower-case SHA-256 hex of the body, or the empty string when there is no body. */
export function subscriberBodyHash(body?: Uint8Array | null): string {
  if (!body || body.byteLength === 0) return "";
  return createHash("sha256").update(body).digest("hex");
}

/** The message a subscriber signs for one request. */
export function subscriberSigningMessage(input: SubscriberSigningInput): string {
  return [
    SUBSCRIBER_AUTH_DOMAIN,
    input.method.toUpperCase(),
    input.pathAndQuery,
    input.timestamp,
    subscriberBodyHash(input.body),
  ].join("\n");
}

/** SEP-53 digest of {@link subscriberSigningMessage}: the 32 bytes ed25519 actually signs. */
export function subscriberSigningDigest(input: SubscriberSigningInput): Buffer {
  return createHash("sha256")
    .update(Buffer.from(SEP53_MESSAGE_PREFIX + subscriberSigningMessage(input), "utf8"))
    .digest();
}

// Digits only. `Number()` would also take "1e3", " 12 " and "0x10", and the
// string is signed as sent, so it has to mean one thing.
const TIMESTAMP_RE = /^[0-9]{1,16}$/;

const SIGNATURE_BYTES = 64;

function decodeSignature(value: string): Buffer | null {
  const bytes = Buffer.from(value, "base64");
  // Buffer's base64 decoder skips what it cannot read and accepts the URL-safe
  // alphabet and missing padding. Encoding the result again and comparing
  // accepts exactly one spelling of a signature: standard, padded base64.
  if (bytes.byteLength !== SIGNATURE_BYTES || bytes.toString("base64") !== value) return null;
  return bytes;
}

const refuse = (reason: SubscriberAuthFailure) => ({ ok: false, reason }) as const;

/**
 * Reads the three headers and refuses what can be refused without the body: a
 * missing header, a subscriber that is not an account address, a timestamp
 * that is not a plain integer or is more than {@link SUBSCRIBER_AUTH_WINDOW_MS}
 * from `now`, and a signature that is not 64 bytes of base64.
 *
 * A route with a body calls this before it reads the body, so a caller with no
 * credentials at all is turned away first. It proves nothing by itself: the
 * result only becomes an identity once {@link verifySubscriberClaim} accepts it.
 */
export function readSubscriberClaim(
  headers: Headers,
  now: number = Date.now(),
): SubscriberClaimResult {
  const subscriber = headers.get(SUBSCRIBER_HEADER);
  const timestamp = headers.get(SUBSCRIBER_TIMESTAMP_HEADER);
  const encodedSignature = headers.get(SUBSCRIBER_SIGNATURE_HEADER);
  if (!subscriber || !timestamp || !encodedSignature) return refuse("missing-header");

  // Account addresses only: a muxed (`M...`) or contract (`C...`) address is a
  // valid StrKey but has no ed25519 key to check a signature against.
  if (!StrKey.isValidEd25519PublicKey(subscriber)) return refuse("invalid-subscriber");

  if (!TIMESTAMP_RE.test(timestamp)) return refuse("invalid-timestamp");
  // Written as "accept only inside the window" so that anything that is not a
  // number near `now` is refused, rather than slipping past a `>` comparison.
  const withinWindow = Math.abs(now - Number(timestamp)) <= SUBSCRIBER_AUTH_WINDOW_MS;
  if (!withinWindow) return refuse("stale-timestamp");

  const signature = decodeSignature(encodedSignature);
  if (!signature) return refuse("invalid-signature");

  return { ok: true, subscriber, timestamp, signature };
}

/**
 * Whether the claim's signature was made by the claimed subscriber's key over
 * this exact request: its method, its path and query, and its body.
 *
 * @param body The body bytes as received, before any parsing. Hash what was
 *   sent, not a re-serialization of what was parsed.
 */
export function verifySubscriberClaim(
  claim: SubscriberClaim,
  request: { method: string; url: string },
  body?: Uint8Array | null,
): boolean {
  try {
    const url = new URL(request.url);
    const digest = subscriberSigningDigest({
      method: request.method,
      pathAndQuery: url.pathname + url.search,
      timestamp: claim.timestamp,
      body,
    });
    return Keypair.fromPublicKey(claim.subscriber).verify(digest, claim.signature);
  } catch {
    // An address or URL that cannot be read is a signature that cannot be
    // checked, and that is a refusal, not a server error.
    return false;
  }
}

/**
 * Both steps at once, for a request whose body is already in hand (or that has
 * none). On success `subscriber` is the address that signed, and it is the only
 * value a route should treat as the caller's identity.
 */
export function verifySubscriberRequest(
  request: { method: string; url: string; headers: Headers },
  body?: Uint8Array | null,
  now: number = Date.now(),
): SubscriberAuthResult {
  const claim = readSubscriberClaim(request.headers, now);
  if (!claim.ok) return claim;
  if (!verifySubscriberClaim(claim, request, body)) return refuse("invalid-signature");
  return { ok: true, subscriber: claim.subscriber };
}
