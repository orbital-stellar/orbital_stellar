/**
 * Signing and verification for attestation documents (issue #21 / SEP §7.4):
 * "here is the event schema this deployed contract actually emits, attested
 * by X". This module only concerns itself with the signature envelope -
 * proving who signed a given document and that it hasn't been tampered with
 * since. The document shape itself (`AttestationDocument`) is #20's
 * deliverable, imported from `types.ts`.
 *
 * Generic over the payload type (constrained only to carry `attester`) so
 * the same signing/verification/canonicalization is reusable for a
 * differently-shaped document - `worker-core`'s off-chain-computation
 * trigger attestations (issue #1061) do exactly this, per that issue's own
 * instruction to reuse this module's signature model rather than invent a
 * second one. `T`'s default of `AttestationDocument` keeps every existing
 * call site source-compatible without specifying a type argument.
 *
 * Envelope version 1 (see `docs/sep/orbital-registry-sep.md` §5):
 *
 * - the document is serialized with RFC 8785 canonical JSON
 *   ({@link canonicalizeJson}), so a verifier in any language can rebuild
 *   the signed bytes;
 * - the canonical text is prefixed with a *domain* line, so a signature made
 *   for one kind of document can never be replayed as another;
 * - the prefixed text is signed as a SEP-53 message
 *   (`SHA-256("Stellar Signed Message:\n" + message)`), so any SEP-53-aware
 *   wallet or library can produce or check an Orbital attestation.
 */
import { createHash } from "node:crypto";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { canonicalizeJson } from "./canonicalJson.js";
import type { AttestationDocument } from "./types.js";

/** The only envelope version this module signs and accepts. */
export const ATTESTATION_ENVELOPE_VERSION = 1;

/** Domain of a contract event-schema attestation ({@link AttestationDocument}). */
export const ATTESTATION_DOMAIN = "orbital-attestation-v1";

/** SEP-53's message prefix, hashed in front of every signed message. */
export const SEP53_MESSAGE_PREFIX = "Stellar Signed Message:\n";

const DOMAIN_RE = /^[a-z][a-z0-9-]*-v[1-9][0-9]*$/;
// RFC 3339 / ISO 8601 with a mandatory offset. Stricter than `Date.parse`,
// which also accepts date-only and locale-style strings that other languages'
// parsers reject - an expiry must mean the same instant to every verifier.
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** A signed document bundled with proof of who signed it. */
export interface AttestationEnvelope<T extends { attester: string } = AttestationDocument> {
  /** Envelope version. Always {@link ATTESTATION_ENVELOPE_VERSION}. */
  v: typeof ATTESTATION_ENVELOPE_VERSION;
  payload: T;
  /** The signer's Stellar account address (`G...`). */
  publicKey: string;
  /** Base64-encoded ed25519 signature over {@link attestationSigningDigest} for `payload`. */
  signature: string;
}

/**
 * Deterministically serializes a document to RFC 8785 canonical JSON, so
 * semantically identical documents always produce identical signing bytes
 * regardless of property insertion order. Mirrors {@link canonicalizeSpec}
 * in `spec.ts` for the same reason: a verifier must be able to re-derive the
 * exact bytes that were signed.
 *
 * @throws {CanonicalJsonError} if `document` is outside the JSON data model.
 */
export function canonicalizeAttestation<T extends { attester: string }>(document: T): string {
  return canonicalizeJson(document);
}

/** Throws unless `domain` is a well-formed domain separator, e.g. `orbital-attestation-v1`. */
export function assertAttestationDomain(domain: string): void {
  if (!DOMAIN_RE.test(domain)) {
    throw new AttestationSigningError(
      `domain "${domain}" must be lower-case words ending in a version, like "orbital-attestation-v1"`,
    );
  }
}

/**
 * The message that is signed: the domain, a newline, then the canonical JSON
 * of the document. The domain is chosen by the verifier from what it expects
 * to be checking, never read from the envelope - otherwise an attacker could
 * pick it.
 */
export function attestationSigningMessage<T extends { attester: string }>(
  document: T,
  domain: string = ATTESTATION_DOMAIN,
): string {
  assertAttestationDomain(domain);
  return `${domain}\n${canonicalizeAttestation(document)}`;
}

/** SEP-53 digest of {@link attestationSigningMessage}: the 32 bytes ed25519 actually signs. */
export function attestationSigningDigest<T extends { attester: string }>(
  document: T,
  domain: string = ATTESTATION_DOMAIN,
): Buffer {
  const message = attestationSigningMessage(document, domain);
  return createHash("sha256")
    .update(Buffer.from(SEP53_MESSAGE_PREFIX + message, "utf8"))
    .digest();
}

/** Thrown by {@link signAttestation} when the signing key or document is malformed. */
export class AttestationSigningError extends Error {
  constructor(reason: string) {
    super(`[abi-registry] failed to sign attestation: ${reason}`);
    this.name = "AttestationSigningError";
  }
}

export type SignAttestationOptions = {
  /** Domain separator. Defaults to {@link ATTESTATION_DOMAIN}. */
  domain?: string;
};

/**
 * Signs an {@link AttestationDocument} with an ed25519 Stellar keypair,
 * producing a self-contained {@link AttestationEnvelope}.
 *
 * @param document The attestation to sign. `document.attester` must match
 *   the public key derived from `attesterSecret` - the whole point of the
 *   envelope is that the claimed attester and the actual signer are the same
 *   account, so a mismatch here would produce an envelope that always fails
 *   {@link verifyAttestation}'s attester-match check.
 * @param attesterSecret The attester's Stellar secret key (`S...`).
 * @throws {AttestationSigningError} if `attesterSecret` isn't a valid Stellar
 *   secret key, if it doesn't correspond to `document.attester`, if `domain`
 *   is malformed, or if `document` can't be canonicalized.
 */
export function signAttestation<T extends { attester: string }>(
  document: T,
  attesterSecret: string,
  options: SignAttestationOptions = {},
): AttestationEnvelope<T> {
  let keypair: Keypair;
  try {
    keypair = Keypair.fromSecret(attesterSecret);
  } catch (cause) {
    throw new AttestationSigningError(`invalid secret key: ${String(cause)}`);
  }

  if (keypair.publicKey() !== document.attester) {
    throw new AttestationSigningError(
      `document.attester ("${document.attester}") does not match the signing key's address ("${keypair.publicKey()}")`,
    );
  }

  let digest: Buffer;
  try {
    digest = attestationSigningDigest(document, options.domain);
  } catch (cause) {
    if (cause instanceof AttestationSigningError) throw cause;
    throw new AttestationSigningError(String(cause));
  }

  return {
    v: ATTESTATION_ENVELOPE_VERSION,
    payload: document,
    publicKey: keypair.publicKey(),
    signature: keypair.sign(digest).toString("base64"),
  };
}

/** Why an attestation was rejected, as a stable machine-readable code. */
export type AttestationInvalidCode =
  | "unsupported-version"
  | "bad-public-key"
  | "attester-mismatch"
  | "bad-signature"
  | "malformed-expiry"
  | "expired"
  | "not-a-wasm-attestation"
  | "wasm-hash-mismatch";

/** A verification outcome for {@link verifyAttestation}: either valid, or invalid with a reason. */
export type AttestationVerdict =
  { status: "valid" } | { status: "invalid"; code: AttestationInvalidCode; reason: string };

export type VerifyAttestationOptions = {
  /**
   * The attested contract's actual on-chain WASM hash (hex-encoded), fetched
   * independently by the caller (this module makes no network calls).  When
   * provided, it must match `envelope.payload.wasmHash` exactly (case-insensitive).
   */
  expectedWasmHash?: string;
  /** Domain separator the envelope must have been signed under. Defaults to {@link ATTESTATION_DOMAIN}. */
  domain?: string;
  /** Reference time for the expiry check. Defaults to `new Date()`; injectable so replays stay deterministic. */
  now?: Date;
  /**
   * Whether to reject a payload whose `expiresAt` has passed. Defaults to
   * `true`. A caller with its own ordered checks around expiry (such as
   * `worker-core`) can turn it off and call {@link attestationExpiryProblem}
   * itself.
   */
  checkExpiry?: boolean;
};

/**
 * Returns a problem description if `payload.expiresAt` is set and has
 * passed (or isn't a parseable timestamp), `undefined` otherwise. A payload
 * with no `expiresAt` never expires.
 */
export function attestationExpiryProblem(
  payload: { expiresAt?: unknown },
  now: Date = new Date(),
): { code: "expired" | "malformed-expiry"; reason: string } | undefined {
  if (payload.expiresAt === undefined) return undefined;
  const expiresAt =
    typeof payload.expiresAt === "string" && TIMESTAMP_RE.test(payload.expiresAt)
      ? Date.parse(payload.expiresAt)
      : NaN;
  if (Number.isNaN(expiresAt)) {
    return {
      code: "malformed-expiry",
      reason: `payload.expiresAt (${JSON.stringify(payload.expiresAt)}) is not an ISO 8601 timestamp`,
    };
  }
  if (expiresAt <= now.getTime()) {
    return { code: "expired", reason: `attestation expired at ${String(payload.expiresAt)}` };
  }
  return undefined;
}

function invalid(code: AttestationInvalidCode, reason: string): AttestationVerdict {
  return { status: "invalid", code, reason };
}

/**
 * Verifies an {@link AttestationEnvelope} against SEP §7.4's rules:
 *
 * 1. `envelope.v` is a version this module understands (`1`).
 * 2. `envelope.publicKey` is a well-formed Stellar account address (`G...`).
 * 3. `envelope.publicKey` matches `envelope.payload.attester` - the envelope
 *    can't be signed by anyone other than who the document claims attested it.
 * 4. `envelope.signature` is a valid ed25519 signature by `envelope.publicKey`
 *    over {@link attestationSigningDigest} for `envelope.payload` and the
 *    expected domain - this also catches any tampering with the payload
 *    after signing, since a single changed byte produces different canonical
 *    JSON.
 * 5. Unless `options.checkExpiry` is `false`: `payload.expiresAt`, if set,
 *    has not passed as of `options.now`.
 * 6. If `options.expectedWasmHash` is given: `envelope.payload.executableKind`
 *    must be `"wasm"` (a Stellar Asset Contract has no WASM hash to check
 *    against), and it must match `envelope.payload.wasmHash`.
 *
 * Rules are checked in the above order and verification short-circuits on
 * the first failure. This function proves *who signed what*; it says nothing
 * about whether that signer is entitled to speak for the contract - see
 * `attestationPolicy.ts` for that.
 */
export function verifyAttestation<T extends { attester: string }>(
  envelope: AttestationEnvelope<T>,
  options: VerifyAttestationOptions = {},
): AttestationVerdict {
  if ((envelope as { v?: unknown }).v !== ATTESTATION_ENVELOPE_VERSION) {
    return invalid(
      "unsupported-version",
      `envelope.v (${JSON.stringify((envelope as { v?: unknown }).v)}) is not a supported version; expected ${ATTESTATION_ENVELOPE_VERSION}`,
    );
  }

  if (!StrKey.isValidEd25519PublicKey(envelope.publicKey)) {
    return invalid(
      "bad-public-key",
      `publicKey "${envelope.publicKey}" is not a valid Stellar account address`,
    );
  }

  if (envelope.publicKey !== envelope.payload.attester) {
    return invalid(
      "attester-mismatch",
      `envelope.publicKey ("${envelope.publicKey}") does not match payload.attester ("${envelope.payload.attester}")`,
    );
  }

  let digest: Buffer;
  try {
    digest = attestationSigningDigest(envelope.payload, options.domain);
  } catch (cause) {
    return invalid("bad-signature", `payload cannot be canonicalized: ${String(cause)}`);
  }

  let signatureValid: boolean;
  try {
    signatureValid = Keypair.fromPublicKey(envelope.publicKey).verify(
      digest,
      Buffer.from(envelope.signature, "base64"),
    );
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) {
    return invalid("bad-signature", "signature does not match payload and publicKey");
  }

  if (options.checkExpiry !== false) {
    const problem = attestationExpiryProblem(
      envelope.payload as { expiresAt?: unknown },
      options.now,
    );
    if (problem) return invalid(problem.code, problem.reason);
  }

  if (options.expectedWasmHash !== undefined) {
    // Only meaningful for the original AttestationDocument shape - a
    // differently-shaped payload (e.g. a computation-trigger attestation)
    // has no executableKind/wasmHash to check, so this option is a no-op
    // for it rather than a type error, checked structurally at runtime.
    const payload = envelope.payload as { executableKind?: unknown; wasmHash?: string };
    if (payload.executableKind !== "wasm" || payload.wasmHash === undefined) {
      return invalid(
        "not-a-wasm-attestation",
        `options.expectedWasmHash was provided, but payload.executableKind is "${String(payload.executableKind)}" - only a "wasm" attestation has a wasmHash to verify against`,
      );
    }
    if (options.expectedWasmHash.toLowerCase() !== payload.wasmHash.toLowerCase()) {
      return invalid(
        "wasm-hash-mismatch",
        `payload.wasmHash ("${payload.wasmHash}") does not match the on-chain WASM hash ("${options.expectedWasmHash}")`,
      );
    }
  }

  return { status: "valid" };
}
