/**
 * Which attestations to believe (SEP §5.5-§5.7).
 *
 * `verifyAttestation` proves *who signed what*. It cannot say whether that
 * signer is entitled to speak for the contract, whether a newer attestation
 * has replaced it, or what to do when two signers disagree. Those are policy
 * questions, and this module answers them with explicit, testable rules:
 *
 * - **Trust tier.** An attester is `deployer` when it is the account that
 *   created the contract, `third-party` when the deployer is known and is
 *   someone else, and `unbound` when the deployer isn't known. The caller
 *   supplies the deployer (this module makes no network calls); the tier is
 *   a fact about the relationship, not a verdict on the content.
 * - **Supersession.** An attestation whose `supersedes` is the hash of an
 *   earlier one retires it - but only when both have the same attester.
 *   Otherwise anyone could retire anyone else's attestation.
 * - **Conflicts.** Several live attestations for one contract are ranked by
 *   trust tier, then recency, and flagged when their events disagree. No
 *   silent last-write-wins.
 */
import { createHash } from "node:crypto";
import { canonicalizeJson } from "./canonicalJson.js";
import {
  attestationExpiryProblem,
  verifyAttestation,
  type AttestationEnvelope,
  type AttestationInvalidCode,
} from "./attestation.js";
import type { AttestationDocument } from "./types.js";

/** How an attester relates to the contract it speaks for. */
export type AttestationTrust = "deployer" | "third-party" | "unbound";

const TRUST_RANK: Readonly<Record<AttestationTrust, number>> = {
  deployer: 2,
  "third-party": 1,
  unbound: 0,
};

/**
 * Hex SHA-256 of a document's canonical JSON. This is the value another
 * attestation's `supersedes` field refers to. It covers the document only,
 * not the envelope or domain, so re-signing the same document (say, with a
 * rotated key's wallet) keeps the same hash.
 */
export function attestationHash<T extends { attester: string }>(document: T): string {
  return createHash("sha256")
    .update(Buffer.from(canonicalizeJson(document), "utf8"))
    .digest("hex");
}

/**
 * Classifies an attester against the contract's deployer. `deployer` is
 * `undefined` or `null` when it couldn't be determined - never guess it.
 */
export function classifyAttester(
  attester: string,
  deployer: string | null | undefined,
): AttestationTrust {
  if (deployer === undefined || deployer === null) return "unbound";
  return attester === deployer ? "deployer" : "third-party";
}

/** Whether `trust` is at least `minimum`. Order: `deployer` > `third-party` > `unbound`. */
export function meetsMinimumTrust(trust: AttestationTrust, minimum: AttestationTrust): boolean {
  return TRUST_RANK[trust] >= TRUST_RANK[minimum];
}

export type ResolveAttestationsOptions = {
  /** The contract the attestations are about. Envelopes for any other contract are rejected. */
  contractId: string;
  /** The contract's deployer (`G...`), if known. Omit or pass `null` when it isn't. */
  deployer?: string | null;
  /** Reject attestations below this tier. Defaults to `"unbound"` (accept all). */
  minimumTrust?: AttestationTrust;
  /**
   * The contract's actual on-chain WASM hash. Strongly recommended: without
   * it an attestation written for an older version of the contract is
   * accepted for the current one.
   */
  expectedWasmHash?: string;
  /** Domain the envelopes must have been signed under. */
  domain?: string;
  /** Reference time for expiry. Defaults to `new Date()`. */
  now?: Date;
};

export type ResolvedAttestation = {
  readonly envelope: AttestationEnvelope<AttestationDocument>;
  /** {@link attestationHash} of the payload. */
  readonly hash: string;
  readonly trust: AttestationTrust;
};

export type RejectedAttestation = {
  readonly envelope: AttestationEnvelope<AttestationDocument>;
  readonly code: AttestationInvalidCode | "wrong-contract" | "below-minimum-trust";
  readonly reason: string;
};

export type ResolveAttestationsResult = {
  /** Live attestations, best first: higher trust tier, then more recent, then by hash. */
  readonly effective: readonly ResolvedAttestation[];
  /** Attestations retired by a later one from the same attester. */
  readonly superseded: readonly ResolvedAttestation[];
  readonly rejected: readonly RejectedAttestation[];
  /** `effective[0]`, if any. */
  readonly preferred: ResolvedAttestation | undefined;
  /** True when more than one live attestation exists and their `events` differ. */
  readonly conflicting: boolean;
};

/**
 * Decides which of a contract's attestations to believe. See the module
 * comment for the rules; the steps are:
 *
 * 1. Verify each envelope's signature (expiry deferred - see step 3) and
 *    check it is about `contractId`.
 * 2. Retire attestations superseded by a signature-valid one from the same
 *    attester. A replacement that has itself since expired still retires the
 *    original: the attester withdrew it, and it must not come back to life.
 * 3. Drop what has expired, then what falls below `minimumTrust`.
 * 4. Rank what's left and report whether it conflicts.
 */
export function resolveAttestations(
  envelopes: readonly AttestationEnvelope<AttestationDocument>[],
  options: ResolveAttestationsOptions,
): ResolveAttestationsResult {
  const minimumTrust = options.minimumTrust ?? "unbound";
  const rejected: RejectedAttestation[] = [];
  const candidates: ResolvedAttestation[] = [];
  const seen = new Set<string>();

  for (const envelope of envelopes) {
    const verdict = verifyAttestation(envelope, {
      domain: options.domain,
      now: options.now,
      expectedWasmHash: options.expectedWasmHash,
      checkExpiry: false,
    });
    if (verdict.status === "invalid") {
      rejected.push({ envelope, code: verdict.code, reason: verdict.reason });
      continue;
    }
    if (envelope.payload.contractId !== options.contractId) {
      rejected.push({
        envelope,
        code: "wrong-contract",
        reason: `attestation is for ${envelope.payload.contractId}, not ${options.contractId}`,
      });
      continue;
    }
    const hash = attestationHash(envelope.payload);
    const key = `${envelope.publicKey}:${hash}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      envelope,
      hash,
      trust: classifyAttester(envelope.payload.attester, options.deployer),
    });
  }

  const retired = new Set<ResolvedAttestation>();
  for (const replacement of candidates) {
    const target = replacement.envelope.payload.supersedes?.toLowerCase();
    if (target === undefined) continue;
    for (const original of candidates) {
      if (
        original !== replacement &&
        original.hash === target &&
        original.envelope.payload.attester === replacement.envelope.payload.attester
      ) {
        retired.add(original);
      }
    }
  }

  const effective: ResolvedAttestation[] = [];
  for (const candidate of candidates) {
    if (retired.has(candidate)) continue;
    const expiry = attestationExpiryProblem(candidate.envelope.payload, options.now);
    if (expiry) {
      rejected.push({ envelope: candidate.envelope, code: expiry.code, reason: expiry.reason });
    } else if (!meetsMinimumTrust(candidate.trust, minimumTrust)) {
      rejected.push({
        envelope: candidate.envelope,
        code: "below-minimum-trust",
        reason: `attester is "${candidate.trust}", below the required "${minimumTrust}"`,
      });
    } else {
      effective.push(candidate);
    }
  }

  effective.sort(compareResolved);

  const distinctEvents = new Set(effective.map((r) => canonicalizeJson(r.envelope.payload.events)));

  return {
    effective,
    superseded: candidates.filter((c) => retired.has(c)),
    rejected,
    preferred: effective[0],
    conflicting: distinctEvents.size > 1,
  };
}

function compareResolved(a: ResolvedAttestation, b: ResolvedAttestation): number {
  const byTrust = TRUST_RANK[b.trust] - TRUST_RANK[a.trust];
  if (byTrust !== 0) return byTrust;
  const byTime = createdAtMs(b) - createdAtMs(a);
  if (byTime !== 0) return byTime;
  return a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0;
}

function createdAtMs(resolved: ResolvedAttestation): number {
  const ms = Date.parse(resolved.envelope.payload.createdAt);
  return Number.isNaN(ms) ? 0 : ms;
}

/** Looks up a contract's deployer (`G...`), or `null` if it can't be determined. */
export type DeployerResolver = (contractId: string) => Promise<string | null | undefined>;

/**
 * {@link resolveAttestations}, fetching the deployer through `resolver`
 * first. A resolver that throws is treated as "deployer unknown", not as an
 * error: every attestation then classifies as `unbound` rather than the
 * lookup taking the whole resolution down.
 */
export async function resolveAttestationsWithDeployer(
  envelopes: readonly AttestationEnvelope<AttestationDocument>[],
  resolver: DeployerResolver,
  options: Omit<ResolveAttestationsOptions, "deployer">,
): Promise<ResolveAttestationsResult> {
  let deployer: string | null | undefined;
  try {
    deployer = await resolver(options.contractId);
  } catch {
    deployer = null;
  }
  return resolveAttestations(envelopes, { ...options, deployer });
}
