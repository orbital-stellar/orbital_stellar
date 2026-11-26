import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import {
  signAttestation,
  verifyAttestation,
  canonicalizeAttestation,
  attestationSigningDigest,
  attestationSigningMessage,
  attestationExpiryProblem,
  AttestationSigningError,
  ATTESTATION_DOMAIN,
} from "../src/attestation.js";
import type { AttestationEnvelope } from "../src/attestation.js";
import type { AttestationDocument } from "../src/types.js";

const CONTRACT_ID = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";
const WASM_HASH = "a".repeat(64);

function makeDocument(
  attester: string,
  overrides: Partial<AttestationDocument> = {},
): AttestationDocument {
  return {
    contractId: CONTRACT_ID,
    executableKind: "wasm",
    wasmHash: WASM_HASH,
    events: [
      {
        name: "transfer",
        topics: [{ name: "from", type: "address" }],
        data: [{ name: "amount", type: "i128" }],
      },
    ],
    attester,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("canonicalizeAttestation", () => {
  it("produces identical output regardless of key insertion order", () => {
    const attester = Keypair.random().publicKey();
    const a = makeDocument(attester);
    const b: AttestationDocument = {
      createdAt: a.createdAt,
      attester: a.attester,
      events: a.events,
      executableKind: a.executableKind,
      wasmHash: a.wasmHash,
      contractId: a.contractId,
    };

    expect(canonicalizeAttestation(a)).toBe(canonicalizeAttestation(b));
  });

  it("produces different output when a field changes", () => {
    const attester = Keypair.random().publicKey();
    const a = makeDocument(attester);
    const b = makeDocument(attester, { wasmHash: "b".repeat(64) });

    expect(canonicalizeAttestation(a)).not.toBe(canonicalizeAttestation(b));
  });
});

describe("signAttestation / verifyAttestation round trip", () => {
  it("verifies a freshly signed envelope as valid", () => {
    const keypair = Keypair.random();
    const document = makeDocument(keypair.publicKey());

    const envelope = signAttestation(document, keypair.secret());

    expect(envelope.publicKey).toBe(keypair.publicKey());
    expect(verifyAttestation(envelope)).toEqual({ status: "valid" });
  });

  it("verifies against a matching expectedWasmHash", () => {
    const keypair = Keypair.random();
    const document = makeDocument(keypair.publicKey());
    const envelope = signAttestation(document, keypair.secret());

    expect(verifyAttestation(envelope, { expectedWasmHash: WASM_HASH })).toEqual({
      status: "valid",
    });
    // Case-insensitive comparison.
    expect(verifyAttestation(envelope, { expectedWasmHash: WASM_HASH.toUpperCase() })).toEqual({
      status: "valid",
    });
  });

  it("rejects when document.attester doesn't match the signing key", () => {
    const keypair = Keypair.random();
    const otherAttester = Keypair.random().publicKey();
    const document = makeDocument(otherAttester);

    expect(() => signAttestation(document, keypair.secret())).toThrow(AttestationSigningError);
  });

  it("rejects an invalid secret key", () => {
    const document = makeDocument(Keypair.random().publicKey());
    expect(() => signAttestation(document, "not-a-secret-key")).toThrow(AttestationSigningError);
  });
});

describe("verifyAttestation rejection rules", () => {
  it("rejects a tampered payload (signature no longer matches)", () => {
    const keypair = Keypair.random();
    const document = makeDocument(keypair.publicKey());
    const envelope = signAttestation(document, keypair.secret());

    const tampered: AttestationEnvelope = {
      ...envelope,
      payload: { ...envelope.payload, wasmHash: "c".repeat(64) },
    };

    expect(verifyAttestation(tampered)).toEqual({
      status: "invalid",
      code: "bad-signature",
      reason: expect.stringContaining("signature"),
    });
  });

  it("rejects a signature produced by the wrong key", () => {
    const signer = Keypair.random();
    const impersonated = Keypair.random();
    // Document claims `impersonated` attested it, but `signer` signs it -
    // signAttestation itself would refuse this (attester must match the
    // signing key), so construct the mismatched envelope directly to
    // exercise verifyAttestation's own check.
    const document = makeDocument(impersonated.publicKey());
    const envelope: AttestationEnvelope = {
      v: 1,
      payload: document,
      publicKey: signer.publicKey(),
      signature: signer.sign(attestationSigningDigest(document)).toString("base64"),
    };

    expect(verifyAttestation(envelope)).toEqual({
      status: "invalid",
      code: "attester-mismatch",
      reason: expect.stringContaining("does not match payload.attester"),
    });
  });

  it("rejects a signature that verifies against a different key entirely", () => {
    const signer = Keypair.random();
    const claimedSigner = Keypair.random();
    const document = makeDocument(claimedSigner.publicKey());

    // publicKey matches payload.attester (passes the attester-match check),
    // but the signature bytes were actually produced by a different key.
    const envelope: AttestationEnvelope = {
      v: 1,
      payload: document,
      publicKey: claimedSigner.publicKey(),
      signature: signer.sign(attestationSigningDigest(document)).toString("base64"),
    };

    expect(verifyAttestation(envelope)).toEqual({
      status: "invalid",
      code: "bad-signature",
      reason: expect.stringContaining("signature"),
    });
  });

  it("rejects a malformed publicKey", () => {
    const keypair = Keypair.random();
    const document = makeDocument(keypair.publicKey());
    const envelope = signAttestation(document, keypair.secret());

    const malformed: AttestationEnvelope = { ...envelope, publicKey: "not-a-valid-address" };

    expect(verifyAttestation(malformed)).toEqual({
      status: "invalid",
      code: "bad-public-key",
      reason: expect.stringContaining("not a valid Stellar account address"),
    });
  });

  it("rejects a mismatched expectedWasmHash", () => {
    const keypair = Keypair.random();
    const document = makeDocument(keypair.publicKey());
    const envelope = signAttestation(document, keypair.secret());

    expect(verifyAttestation(envelope, { expectedWasmHash: "d".repeat(64) })).toEqual({
      status: "invalid",
      code: "wasm-hash-mismatch",
      reason: expect.stringContaining("does not match the on-chain WASM hash"),
    });
  });
});

describe("signAttestation / verifyAttestation for a stellarAsset (SAC) document", () => {
  it("signs and verifies a document with no wasmHash", () => {
    const keypair = Keypair.random();
    const document = makeDocument(keypair.publicKey(), {
      executableKind: "stellarAsset",
      wasmHash: undefined,
    });

    const envelope = signAttestation(document, keypair.secret());

    expect(verifyAttestation(envelope)).toEqual({ status: "valid" });
  });

  it("rejects expectedWasmHash against a stellarAsset document - there's nothing to check it against", () => {
    const keypair = Keypair.random();
    const document = makeDocument(keypair.publicKey(), {
      executableKind: "stellarAsset",
      wasmHash: undefined,
    });
    const envelope = signAttestation(document, keypair.secret());

    expect(verifyAttestation(envelope, { expectedWasmHash: "d".repeat(64) })).toEqual({
      status: "invalid",
      code: "not-a-wasm-attestation",
      reason: expect.stringContaining('executableKind is "stellarAsset"'),
    });
  });
});

describe("envelope v1: SEP-53 signing and domain separation", () => {
  it("stamps the envelope with version 1", () => {
    const keypair = Keypair.random();
    const envelope = signAttestation(makeDocument(keypair.publicKey()), keypair.secret());
    expect(envelope.v).toBe(1);
  });

  it("signs the SEP-53 digest of `domain\\n` + canonical JSON, so a wallet's signMessage can produce it", () => {
    const keypair = Keypair.random();
    const document = makeDocument(keypair.publicKey());
    const message = `${ATTESTATION_DOMAIN}\n${canonicalizeAttestation(document)}`;
    expect(attestationSigningMessage(document)).toBe(message);

    // What a SEP-53 signer does: sign SHA-256("Stellar Signed Message:\n" + message).
    const digest = createHash("sha256")
      .update(Buffer.from(`Stellar Signed Message:\n${message}`, "utf8"))
      .digest();
    const envelope: AttestationEnvelope = {
      v: 1,
      payload: document,
      publicKey: keypair.publicKey(),
      signature: keypair.sign(digest).toString("base64"),
    };

    expect(verifyAttestation(envelope)).toEqual({ status: "valid" });
    expect(signAttestation(document, keypair.secret()).signature).toBe(envelope.signature);
  });

  it("does not verify a pre-v1 signature over the bare canonical bytes", () => {
    const keypair = Keypair.random();
    const document = makeDocument(keypair.publicKey());
    const legacy = {
      payload: document,
      publicKey: keypair.publicKey(),
      signature: keypair
        .sign(Buffer.from(canonicalizeAttestation(document), "utf8"))
        .toString("base64"),
    } as unknown as AttestationEnvelope;

    expect(verifyAttestation(legacy)).toMatchObject({
      status: "invalid",
      code: "unsupported-version",
    });
    expect(verifyAttestation({ ...legacy, v: 1 })).toMatchObject({
      status: "invalid",
      code: "bad-signature",
    });
  });

  it("rejects an unknown envelope version", () => {
    const keypair = Keypair.random();
    const envelope = signAttestation(makeDocument(keypair.publicKey()), keypair.secret());
    expect(
      verifyAttestation({ ...envelope, v: 2 } as unknown as AttestationEnvelope),
    ).toMatchObject({ status: "invalid", code: "unsupported-version" });
  });

  it("rejects an envelope signed under a different domain", () => {
    const keypair = Keypair.random();
    const document = makeDocument(keypair.publicKey());
    const envelope = signAttestation(document, keypair.secret(), { domain: "other-thing-v1" });

    expect(verifyAttestation(envelope)).toMatchObject({ status: "invalid", code: "bad-signature" });
    expect(verifyAttestation(envelope, { domain: "other-thing-v1" })).toEqual({ status: "valid" });
  });

  it.each(["", "Orbital-v1", "orbital", "orbital-v0", "orbital v1", "orbital-v1\n"])(
    "rejects the malformed domain %j",
    (domain) => {
      const keypair = Keypair.random();
      expect(() =>
        signAttestation(makeDocument(keypair.publicKey()), keypair.secret(), { domain }),
      ).toThrow(AttestationSigningError);
    },
  );

  it("refuses to sign a document that can't be canonicalized", () => {
    const keypair = Keypair.random();
    const document = makeDocument(keypair.publicKey(), {
      createdAt: Number.NaN as unknown as string,
    });
    expect(() => signAttestation(document, keypair.secret())).toThrow(AttestationSigningError);
  });
});

describe("verifyAttestation expiry", () => {
  const NOW = new Date("2026-06-01T00:00:00Z");

  it("accepts an attestation that has not expired", () => {
    const keypair = Keypair.random();
    const envelope = signAttestation(
      makeDocument(keypair.publicKey(), { expiresAt: "2026-07-01T00:00:00Z" }),
      keypair.secret(),
    );
    expect(verifyAttestation(envelope, { now: NOW })).toEqual({ status: "valid" });
  });

  it("rejects an expired attestation, including at the exact expiry instant", () => {
    const keypair = Keypair.random();
    const envelope = signAttestation(
      makeDocument(keypair.publicKey(), { expiresAt: "2026-06-01T00:00:00Z" }),
      keypair.secret(),
    );
    expect(verifyAttestation(envelope, { now: NOW })).toMatchObject({
      status: "invalid",
      code: "expired",
    });
  });

  it("rejects an unparseable expiresAt rather than treating it as never expiring", () => {
    const keypair = Keypair.random();
    const envelope = signAttestation(
      makeDocument(keypair.publicKey(), { expiresAt: "next tuesday" }),
      keypair.secret(),
    );
    expect(verifyAttestation(envelope, { now: NOW })).toMatchObject({
      status: "invalid",
      code: "malformed-expiry",
    });
  });

  it("skips the expiry check when asked to", () => {
    const keypair = Keypair.random();
    const envelope = signAttestation(
      makeDocument(keypair.publicKey(), { expiresAt: "2020-01-01T00:00:00Z" }),
      keypair.secret(),
    );
    expect(verifyAttestation(envelope, { now: NOW, checkExpiry: false })).toEqual({
      status: "valid",
    });
  });

  it("attestationExpiryProblem treats a missing expiresAt as never expiring", () => {
    expect(attestationExpiryProblem({}, NOW)).toBeUndefined();
  });
});
