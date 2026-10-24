```text
SEP: 0000
Title: Orbital ABI Registry & Taxonomy Standard
Author: Orbital Contributors
Status: Draft
Created: 2026-07-27
Requires: SEP-48
```

## 1. Simple Summary
This proposal defines an off-chain schema registry with a verification pipeline, retroactive schema attestation for pre-SEP-48 contracts, a semantic taxonomy, and an entity-label format on top of raw Soroban event schemas.

## 2. Abstract
As the Soroban ecosystem matures, normalizing event data is critical. [SEP-48] standardizes event schemas embedded in a contract's Wasm. However, a gap remains for pre-SEP-48 contracts, off-chain registry verification, and higher-level semantic taxonomies. This SEP defines an open standard for registering, attesting, and semantically labeling event schemas without competing with SEP-48.

## 3. SEP-48 Compatibility Clause
An embedded SEP-48 event spec is the canonical schema source for any contract that includes it. The registry defined in this document adds attestation and semantic layers on top; it never provides a competing schema. If a SEP-48 schema exists, tools MUST prefer it over a standalone registry schema [Issue 7.1 gap memo].

## 4. Off-Chain Schema Registry and Verification
To prevent bloating on-chain state, full schema payloads are stored off-chain. The on-chain registry contract stores only a cryptographic hash and a pointer to the off-chain blob [Issue 7.2 prior-art survey].

### 4.1. Verification Pipeline
The off-chain registry MUST implement a verification pipeline cross-checking any submitted schema against the on-chain `contractspec`.
The pipeline guarantees that the registered schema structurally matches the compiled types emitted by the contract [Issue 7.1 gap memo].

## 5. Retroactive Schema Attestation
For pre-SEP-48 contracts already deployed on mainnet, their Wasm does not contain embedded event schemas.
The registry MUST support a retroactive schema attestation flow [Issue 7.3 attestation schema].
The deployer of the pre-SEP-48 contract SHOULD sign the attestation over the schema payload [Issue 7.4 signature envelope]; any other account MAY, and is then a third party (§5.7).

An attestation proves who made a claim and that it has not been altered. It does not prove the claim is true: for a contract with no embedded spec, nothing can be checked against the code. Everything below exists to make a claim attributable, replay-resistant and comparable, not to make it correct.

### 5.1. Attestation Document
The document states which events a deployed contract emits. Its normative form is [`schemas/attestation.schema.json`](../../packages/abi-registry/schemas/attestation.schema.json); the fields that matter to this section are:

| Field | Meaning |
| --- | --- |
| `contractId` | The contract (`C…`) the claim is about. |
| `executableKind` | `wasm`, or `stellarAsset` for a Stellar Asset Contract, which has no Wasm. |
| `wasmHash` | Hex SHA-256 of the deployed Wasm. REQUIRED when `executableKind` is `wasm`, and MUST be absent otherwise. |
| `events` | SEP-48-shaped event definitions being claimed. |
| `attester` | The signing account (`G…`). |
| `createdAt` | ISO 8601 time of the claim. |
| `expiresAt` | OPTIONAL ISO 8601 time after which the claim MUST NOT be relied on. |
| `supersedes` | OPTIONAL hex SHA-256 (§5.6) of an earlier document the same attester retires. |

### 5.2. Envelope
A signed document is an envelope, defined by [`schemas/attestation-envelope.schema.json`](../../packages/abi-registry/schemas/attestation-envelope.schema.json):

```json
{
  "v": 1,
  "payload": { "...": "the document" },
  "publicKey": "G…",
  "signature": "base64"
}
```

`v` MUST be `1`; a verifier MUST reject any other value, including its absence. `publicKey` MUST equal `payload.attester`. `signature` is standard base64, with padding, of a 64-byte ed25519 signature.

### 5.3. Canonical Form
The payload is serialized as canonical JSON per [RFC 8785]. In addition:

- Values outside the JSON data model (`NaN`, `Infinity`, `undefined` in an array, strings with lone surrogates) MUST NOT be signed; a signer MUST refuse them.
- An object member whose value is `undefined` in the signer's language is absent, not `null`.
- A document intended for verification outside JavaScript SHOULD use only strings, booleans, `null` and integers. The text of a non-integer number is defined by ECMAScript's number-to-string algorithm, which other languages do not reproduce without help. A verifier MAY reject non-integer numbers.

### 5.4. Signing
The signed message is the **domain**, a line feed, and the canonical payload:

```
message = domain || "\n" || canonical(payload)
digest  = SHA-256("Stellar Signed Message:\n" || message)
signature = ed25519_sign(attester_secret, digest)
```

The `digest` construction is the one [SEP-53] defines, so any SEP-53-capable wallet or library can produce or check an attestation by signing `message`.

The domain separates document kinds so that a signature made for one can never be replayed as another. It matches `^[a-z][a-z0-9-]*-v[1-9][0-9]*$`. It is **not** a field of the envelope: the verifier chooses it from what it is checking, otherwise an attacker would choose it. This document registers `orbital-attestation-v1` for the attestation document of §5.1. Any other document type that reuses this envelope MUST use its own domain; worker computation attestations use `orbital-computation-attestation-v1`.

### 5.5. Verification
A verifier MUST apply these rules in order and stop at the first failure. The code is the stable identifier of the failure, so that implementations in different languages report the same thing.

| # | Rule | Code |
| --- | --- | --- |
| 1 | `v` is `1`. | `unsupported-version` |
| 2 | `publicKey` is a well-formed `G…` account address. | `bad-public-key` |
| 3 | `publicKey` equals `payload.attester`. | `attester-mismatch` |
| 4 | `signature` verifies over the digest of §5.4 for the expected domain. | `bad-signature` |
| 5 | If `payload.expiresAt` is present it is a timestamp with an explicit offset (`Z` or `±hh:mm`), and it is later than the current time. | `malformed-expiry`, `expired` |
| 6 | If the caller supplies the contract's on-chain Wasm hash: `executableKind` is `wasm`, and `wasmHash` equals it, ignoring case. | `not-a-wasm-attestation`, `wasm-hash-mismatch` |

A verifier MUST also check that `payload.contractId` is the contract it is asking about, and SHOULD supply the on-chain Wasm hash for rule 6: without it, an attestation written for an older version of the contract is accepted for the current one.

### 5.6. Supersession
`supersedes` holds the hex SHA-256 of the canonical payload (§5.3) of an earlier document. A document retires another when both are signature-valid, the `supersedes` hash matches, **and both have the same `attester`**. A document that names a different attester's hash retires nothing; otherwise any account could withdraw anyone's attestation. Supersession chains are followed transitively. A replacement that has itself expired still retires the original: the attester withdrew it, and it MUST NOT become effective again.

### 5.7. Trust Tiers
The signature says which account spoke. Whether that account is entitled to speak for the contract is a separate fact, expressed as a tier:

| Tier | Meaning |
| --- | --- |
| `deployer` | The attester is the account that created the contract. |
| `third-party` | The deployer is known, and the attester is someone else. |
| `unbound` | The deployer is not known. |

Ordering is `deployer` > `third-party` > `unbound`. How a deployer is determined is outside this SEP and depends on ledger history the implementation can reach; an implementation MUST NOT guess it, and MUST report `unbound` when it cannot determine it. A consumer states the minimum tier it accepts. An automated system that acts on a contract's events SHOULD require `deployer` unless it has another basis for trusting the attester.

### 5.8. Conflicting Attestations
Several live attestations may exist for one contract. An implementation MUST rank them by trust tier, then by `createdAt` (later first), then by payload hash for a deterministic result, and MUST report when the live attestations' `events` differ rather than silently choosing. An embedded SEP-48 spec still takes precedence over every attestation (§3).

### 5.9. Security Considerations
- **A valid signature is not a true claim.** For a contract with no embedded spec nothing can be checked against code. Trust comes from who signed, which is why §5.7 exists.
- **Replay across document kinds** is prevented by the domain (§5.4). **Replay across contracts and versions** is prevented only if the verifier performs the checks of §5.5.
- **Third-party attestations SHOULD carry `expiresAt`.** An unattributed claim with no expiry stays believable forever.
- **Key loss.** A deployer account may be discarded or held cold. The envelope cannot help; the claim then stays `third-party` until the deployer, or a key the deployer has published, re-signs.
- **Clocks.** Expiry is evaluated against the verifier's clock; implementations SHOULD allow it to be injected.

### 5.10. Conformance
[`packages/abi-registry/test-vectors/attestation-v1.json`](../../packages/abi-registry/test-vectors/attestation-v1.json) is the language-neutral conformance suite: canonicalization cases, and signed envelopes each with the verdict and code a conforming verifier reaches. It is generated by `packages/abi-registry/scripts/generate-attestation-vectors.ts`. Reference verifiers in TypeScript, Go ([`verifiers/go`](../../packages/abi-registry/verifiers/go)) and Rust ([`verifiers/rust`](../../packages/abi-registry/verifiers/rust)) all pass it in CI.

## 6. Semantic Taxonomy and Entity-Label Format
Raw event topics (e.g., a hash or simple symbol) lack rich context. This SEP introduces a semantic taxonomy to standardize common lifecycle events across protocols [Issue 7.7 taxonomy schema].

### 6.1. Entity Labels
The standard defines an entity-label format allowing verified attribution (e.g., protocol, deployer, asset-issuer).

## References
[RFC 8785]: https://www.rfc-editor.org/rfc/rfc8785
[SEP-48]: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0048.md
[SEP-53]: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0053.md
