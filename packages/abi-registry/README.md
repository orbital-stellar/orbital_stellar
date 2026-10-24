# @orbital-stellar/abi-registry

**Shared Soroban ABI registry for Orbital.** This package holds the canonical client surface for ABI-aware code, along with schema helpers and publisher abstractions that keep Soroban integration logic consistent across the repo.

```bash
pnpm add @orbital-stellar/abi-registry
```

## What it does

`abi-registry` is the package you use when you need to read, decode, publish, or reuse Soroban contract interface metadata without duplicating schema logic in application code.

It is the shared boundary between:

- ABI consumers in `pulse-core`
- any future Soroban event subscriber or decoder
- tooling that publishes or snapshots registry data

If you are looking for the hosted verification / publishing service, that is a separate Cloud product. This package is the open-source schema and client surface.

## Quickstart

```ts
import {
  AbiRegistryClient,
  LocalFilePublisher,
  RegistryPublisher,
  jsToScval,
  scvalToJs,
} from "@orbital-stellar/abi-registry";

const client = new AbiRegistryClient({
  baseUrl: "https://abi.example.com",
});

const spec = await client.getSpec("CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF");
const specs = await client.getSpecs([
  "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
]);

const encoded = jsToScval({ hello: "world" });
const decoded = scvalToJs(encoded);

const publisher: RegistryPublisher = new LocalFilePublisher();

await publisher.publish({
  contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  entries: [],
});
```

## API

### `AbiRegistryClient`

Creates a cached client that fetches contract ABI specs from the configured registry endpoint. Use `getSpec(contractId)` for a single contract or `getSpecs(contractIds)` for batched lookups.

### `ChainedAbiRegistryClient`

Composes multiple `AbiRegistryReader`s (anything with a `getSpec(contractId)`, and optionally a `getSpecAt(contractId, ledger)`) into a single resolution chain: each client is tried in order, and the first non-`null` result wins. Clients after the first are never consulted once one resolves - later entries fill gaps, they don't get a vote once an earlier one has answered.

```ts
import { ChainedAbiRegistryClient } from "@orbital-stellar/abi-registry";

const resolver = new ChainedAbiRegistryClient([embeddedSpecReader, registryAttestationReader]);
```

**SEP-48 precedence order.** Per SEP-48's compatibility clause, a contract's own embedded event spec (discovered from its `contractspecv0` WASM section via `discoverContractSpec`) is canonical when present. A registry attestation only fills gaps for contracts with no embedded spec - it never overrides one. A SEP-48-compliant chain must therefore list the embedded-spec reader first and the registry-attestation reader second:

1. **Embedded spec present** - used as-is, even if a registry attestation for the same contract disagrees.
2. **No embedded spec, registry attestation present** - the attestation is used.
3. **Neither** - resolution reports unresolved (`null`). There is no silent fallback to bundled/well-known guesses; a caller that wants one must compose it explicitly, after the registry, and can no longer treat the result as SEP-48-verified.

An embedded-spec reader's `getSpec` must resolve to `null` for a contract with no embedded spec, not throw - `discoverContractSpec` itself throws `NoEmbeddedSpecError`, so any reader wrapping it for use in a chain is responsible for catching that and returning `null`.

### Attestations

An attestation (SEP §5) claims "this deployed contract emits this event schema." The envelope proves who made the claim and that it hasn't been altered; the policy layer decides which claims to believe. The normative text is [`docs/sep/orbital-registry-sep.md`](../../docs/sep/orbital-registry-sep.md) §5.

#### `signAttestation` / `verifyAttestation`

```ts
import { signAttestation, verifyAttestation } from "@orbital-stellar/abi-registry";
import type { AttestationDocument } from "@orbital-stellar/abi-registry";

const document: AttestationDocument = {
  contractId: "C...",
  executableKind: "wasm", // or "stellarAsset" for a SAC - see below
  wasmHash: "…", // hex-encoded SHA-256 of the deployed WASM; omit entirely for a SAC
  events: [
    /* SEP-48-shaped event definitions - see AttestationDocument["events"] */
  ],
  attester: attesterKeypair.publicKey(), // G...
  createdAt: new Date().toISOString(),
  expiresAt: "2027-01-01T00:00:00Z", // optional; recommended for third-party claims
};

const envelope = signAttestation(document, attesterKeypair.secret());
// envelope: { v: 1, payload, publicKey, signature }

const verdict = verifyAttestation(envelope, { expectedWasmHash: onChainWasmHash });
// { status: "valid" } | { status: "invalid", code, reason }
```

`signAttestation` signs the [SEP-53](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0053.md) digest of `domain + "\n" + canonicalizeAttestation(document)`: canonical JSON per [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785), prefixed with a domain (`orbital-attestation-v1` by default) so a signature made for one kind of document can't be replayed as another. A SEP-53-capable wallet can produce the same signature by signing `attestationSigningMessage(document)`. It refuses to sign if `document.attester` doesn't match the signing key's own address, or if the document can't be canonicalized (`NaN`, lone surrogates, …).

`verifyAttestation` checks, in order, short-circuiting on the first failure. Each failure carries a stable `code`:

1. `envelope.v` is `1` (`unsupported-version`). Envelopes signed before version 1 do not verify.
2. `envelope.publicKey` is a well-formed Stellar account address (`bad-public-key`).
3. `envelope.publicKey` matches `envelope.payload.attester` (`attester-mismatch`).
4. `envelope.signature` is a valid ed25519 signature over the digest for the expected `domain` (`bad-signature`). This is what catches tampering.
5. `payload.expiresAt`, if set, is a timestamp with an offset and hasn't passed as of `options.now` (`malformed-expiry`, `expired`). Turn off with `checkExpiry: false`.
6. If `options.expectedWasmHash` is given (the caller's own on-chain lookup - this module makes no network calls): `executableKind` must be `"wasm"` (`not-a-wasm-attestation`) and `wasmHash` must match (`wasm-hash-mismatch`).

#### `resolveAttestations`

A valid signature says who spoke, not whether they may speak for the contract. `resolveAttestations` applies the rest of the policy to a contract's attestations:

```ts
import { resolveAttestations } from "@orbital-stellar/abi-registry";

const result = resolveAttestations(envelopes, {
  contractId,
  deployer, // G... of the account that created the contract, or null if unknown
  expectedWasmHash,
  minimumTrust: "deployer", // "deployer" | "third-party" | "unbound" (default)
});

result.preferred; // best live attestation, or undefined
result.effective; // live attestations, best first
result.superseded; // retired by a later one from the same attester
result.rejected; // { envelope, code, reason } for everything dropped
result.conflicting; // live attestations disagree about the events
```

- **Trust tier.** `deployer` when the attester created the contract, `third-party` when the deployer is known and is someone else, `unbound` when the deployer isn't known. Never guess the deployer: pass `null` and the tier is `unbound`. `resolveAttestationsWithDeployer` takes an async lookup instead of a value, and treats a failing lookup as unknown.
- **Supersession.** `supersedes` holds `attestationHash(previous.payload)`. It only retires an attestation from the **same** attester - otherwise anyone could withdraw anyone's claim.
- **Ranking.** Higher tier first, then more recent, then by hash. Disagreeing events are flagged in `conflicting`, never silently resolved.

#### Verifying outside TypeScript

[`test-vectors/attestation-v1.json`](./test-vectors/attestation-v1.json) is a language-neutral conformance suite - canonicalization cases and signed envelopes with the verdict a verifier must reach. Reference verifiers live in [`verifiers/go`](./verifiers/go) and [`verifiers/rust`](./verifiers/rust); both run against it in CI. Regenerate the file with `pnpm exec tsx scripts/generate-attestation-vectors.ts`.

### `RegistryPublisher`

An interface for publishing registry snapshots or derived ABI artifacts.

### `LocalFilePublisher`

Reference publisher that writes registry output to the local filesystem. Useful for testing, debugging, and snapshots.

### `jsToScval(value)` / `scvalToJs(value)`

Helpers for converting between JavaScript values and Soroban `ScVal` payloads.

## Semantic taxonomy

The semantic layer maps a contract's raw event topics onto a human-readable, dot-namespaced name (`swap.executed`, `payment.sent`, `loan.liquidated`) and publishes the result as open data. [`schema/taxonomy.schema.json`](./schema/taxonomy.schema.json) is the normative format a community submission must conform to; the naming and collision rules live in that file's `description` fields, so the schema is self-contained for a submitter who has nothing else.

A taxonomy entry answers four questions and nothing else:

| Field | Question |
| --- | --- |
| `match` | Which raw events does this apply to? A positional topic pattern. |
| `scope` | Which contracts? Specific contract IDs, specific WASM hashes, or every contract implementing a SEP interface. |
| `name` | What is the event called, semantically? |
| `parameters` | Where does each taxonomy parameter come from - a topic slot, a data key, or a constant? |

plus `provenance` - who submitted it, when, and the sources backing the claim. Matching and extraction are deliberately separate: `match` only decides whether an entry applies, so a pattern can be tightened without silently re-binding a parameter.

Two worked examples ship under [`schema/examples/taxonomy/`](./schema/examples/taxonomy): a SEP-41 `transfer` mapped to `payment.sent` (interface-scoped), and an illustrative DEX swap (contract-scoped, map-shaped data).

### Naming rules

- **Shape** - two or three dot-separated segments: `<root>.<action>` or `<root>.<subject>.<action>`.
- **Casing** - lowercase ASCII `snake_case` per segment, starting with a letter.
- **Root** - the first segment must come from a closed list: `account`, `asset`, `bridge`, `claimable`, `contract`, `data`, `governance`, `loan`, `lp`, `nft`, `offer`, `oracle`, `payment`, `stake`, `swap`, `trustline`, `vault`. The list is closed on purpose - an open-ended root lets two submissions describe one concept under different names (`swap.executed` vs `dex.swapped`), which is exactly what a shared taxonomy exists to prevent. Adding a root is a reviewed schema change, not a per-submission decision.
- **Reuse over minting** - several roots already carry meaning in `@orbital-stellar/pulse-core`'s `NormalizedEvent` taxonomy. A contract-event mapping that means the same thing as `payment.sent` must use that name.
- **Reserved** - `engine.*` and `event.*` are permanently unavailable. They are `pulse-core`'s own diagnostics (`engine.reconnecting`, `event.decode_failed`), which describe the indexer rather than the chain.
- **Action segment** - past tense (`executed`, `liquidated`, `deposited`). A review convention, not machine-checkable.

### Collision policy

A taxonomy name is **not** unique across entries - `payment.sent` legitimately has one entry per token implementation. Uniqueness is a property of *(pattern, scope)*:

- `duplicate-id` - two entries share an `id`.
- `ambiguous-mapping` - identical patterns in overlapping scopes resolve to **different** names. This is the failure that makes consumers untrustworthy.
- `duplicate-mapping` - identical patterns in overlapping scopes resolve to the **same** name. Harmless to consumers, but the redundant entry should be dropped.

Listing the other entry in `supersedes` marks the overlap as intentional and clears it. Scopes of *different* kinds are never compared automatically: deciding whether a contract ID is also covered by a `wasmHash` or SEP-interface scope needs on-chain state this package does not read, so that one is a reviewer's call.

### `validateTaxonomyEntry` / `findTaxonomyConflicts`

```ts
import { validateTaxonomyEntry, findTaxonomyConflicts } from "@orbital-stellar/abi-registry";

const result = validateTaxonomyEntry(JSON.parse(submission));
// { valid: true } | { valid: false, errors: string[] }

const conflicts = findTaxonomyConflicts([...published, candidate]);
// [{ kind: "ambiguous-mapping", entryIds: ["a", "b"], detail: "…" }]
```

`validateTaxonomyEntry` is the same rule set as the JSON Schema, hand-written so runtime consumers don't need a JSON Schema validator, and held in step with it by tests rather than by generation. One deliberate difference: the schema is `additionalProperties: false` throughout, while the function ignores unknown properties (matching `validateSpec`). Gate reviews on the schema; validate at runtime with the function.

`findTaxonomyConflicts` implements the machine-checkable half of the collision policy. It collects every conflict rather than stopping at the first, so a reviewer sees the whole picture in one pass.
## CLI

### `abi-registry verify <contractId> --schema <file>`

The one-command form of `verifySchema`: reads a submitted schema off disk, compares it against the deployed contract's on-chain spec, and prints the structured verdict.

```bash
abi-registry verify CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75 \
  --schema specs/well-known/usdc.json \
  --network mainnet
```

```
✗ mismatch  CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75
  1 difference(s) between the submitted schema and the on-chain spec:

  - functions[transfer].returns
      submitted: "void"
      on-chain:  "u32"
```

`--schema` accepts either the canonical `ContractSpec` shape or the hand-authored snake_case well-known format, so the bundled specs in `specs/well-known/` can be passed straight through. The file is validated with `validateSpec` before any network call, so a malformed schema fails fast rather than being reported as a mismatch.

| Flag | Default | Purpose |
| --- | --- | --- |
| `--schema <file>` | *(required)* | Submitted schema to verify |
| `--rpc-url <url>` | `https://soroban-testnet.stellar.org` | Soroban RPC endpoint |
| `--network <name>` | `testnet` | `mainnet` \| `testnet` \| `futurenet` |
| `--json` | `false` | Print the verdict as JSON instead of text |
| `--allow-unverifiable` | `false` | Exit `0` instead of `2` when the contract has no embedded spec |

`--json` prints the verdict verbatim, plus the contract ID, for machine consumption:

```json
{
  "contractId": "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
  "status": "mismatch",
  "diffs": [{ "path": "functions[transfer].returns", "submitted": "void", "onChain": "u32" }]
}
```

**Exit codes.** Distinct per outcome, so CI can gate on the specific one it cares about rather than only on "non-zero":

| Code | Meaning |
| --- | --- |
| `0` | `match` - submitted schema matches the on-chain spec |
| `1` | `mismatch` - the schema disagrees with the on-chain spec |
| `2` | `unverifiable` - contract has no embedded spec, so nothing could be compared (see `--allow-unverifiable`) |
| `3` | Bad usage, unreadable/invalid schema file, or an RPC failure |

Note that Stellar Asset Contracts (USDC, EURC, AQUA, the native XLM wrapper) have no WASM and therefore no embedded `contractspecv0` section - verifying one reports `unverifiable`, not `mismatch`. Only contracts built from Rust with their spec section intact can be verified.

## Related documents

- [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) - where the registry sits in the system map
- [`docs/open-source-policy.md`](../../docs/open-source-policy.md) - the public/private boundary for the registry service

## License

MIT
