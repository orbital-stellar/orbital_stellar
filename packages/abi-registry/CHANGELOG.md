# abi-registry Changelog

## [Unreleased]

### Changed
- **BREAKING: attestation envelope version 1.** `signAttestation`/`verifyAttestation` now sign the [SEP-53](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0053.md) digest of `domain + "\n" + canonical JSON` instead of the bare canonical bytes, and envelopes carry `v: 1`. Envelopes signed by 0.2.0 do not verify (`unsupported-version`) and must be re-signed. Signatures made for one document kind can no longer be replayed as another: the domain defaults to `orbital-attestation-v1`, and `worker-core` computation attestations now use `orbital-computation-attestation-v1`.
- `canonicalizeAttestation` now produces strict RFC 8785 canonical JSON (`canonicalizeJson`) and throws `CanonicalJsonError` for values outside the JSON data model (`NaN`, `Infinity`, `bigint`, class instances, lone surrogates, `undefined` in an array) that the old serializer silently turned into `null`.
- `verifyAttestation` now enforces `expiresAt` (a missing or unparseable value is not treated as "never expires"; pass `checkExpiry: false` to opt out), and failures carry a stable `code` alongside `reason`.

### Added
- **Attestation policy** - `resolveAttestations`/`resolveAttestationsWithDeployer` rank a contract's attestations by trust tier (`deployer` > `third-party` > `unbound`), follow `supersedes` chains (same attester only), drop expired and wrong-contract or wrong-version claims, and flag conflicting events. `attestationHash`, `classifyAttester`, `meetsMinimumTrust` are exported alongside.
- `schemas/attestation-envelope.schema.json` - the envelope's wire format.
- `test-vectors/attestation-v1.json` - a language-neutral conformance suite, plus reference verifiers in Go (`verifiers/go`) and Rust (`verifiers/rust`) that pass it in CI.
- The published package now includes `schemas/` and `test-vectors/`; previously the JSON Schemas the README points to were not shipped.
- SEP draft §5 (`docs/sep/orbital-registry-sep.md`) now specifies the envelope, canonical form, signing, verification rules, supersession, trust tiers and conflict handling.
- **Mainnet-aware registry selection** - `createDefaultAbiRegistryClient()` takes a `network` option (`"testnet"` default, `"mainnet"`, `"futurenet"`) and selects the on-chain registry for it instead of always reading the testnet constants. New `ORBITAL_REGISTRY_MAINNET_CONTRACT_ID`, `_RPC_URL`, `_PUBLISHER_ADDRESS` and `_NETWORK_PASSPHRASE` exports; the first three are empty until a real mainnet deploy, and with any of them unset the mainnet on-chain link is skipped (it never falls back to testnet). Overridable with `ORBITAL_REGISTRY_MAINNET_CONTRACT_ID`, `ORBITAL_REGISTRY_MAINNET_RPC_URL` and `ORBITAL_REGISTRY_MAINNET_PUBLISHER_ADDRESS`. See `docs/mainnet-deployment.md`.
- `PrimitiveType` gained `"val"` - the generic Soroban value slot (`scvVal`); real and common, since DeFindex strategies take `Vec<Val>` init args (verified against the live mainnet Blend strategy WASM). `schema/spec.schema.json`, `schemas/attestation.schema.json` and `schema/taxonomy.schema.json` carry the same addition, and `discoverContractSpec()` no longer throws `UnsupportedSpecTypeError` on it.
- `specs/community/` - verified canonical spec and `match` verdict for an Aquarius stableswap pool (`CCLZQDL5...PDF`).
- `specs/community/` - verified canonical spec and `match` verdict for an Aquarius constant-product pool, XLM/AQUA (`CCY2PXGM...IFWV`).
- `specs/community/` - verified canonical spec and `match` verdict for the Comet BLND:USDC pool (`CAS3FL6T...VEAM`).
- `specs/community/` - verified canonical spec and `match` verdict for the Allbridge Core USDC pool (`CAOTMWRK...PNFT`).

## [0.2.0] - 2026-09-23

### Added
- **Semantic taxonomy format** - `schema/taxonomy.schema.json` (JSON Schema 2020-12) is the normative format for community-submitted taxonomy entries mapping raw event topics onto dot-namespaced names (`swap.executed`, `payment.sent`). Naming rules (closed namespace-root list, casing, reserved `engine.*`/`event.*` roots) and the collision policy are documented in the schema's own `description` fields. `validateTaxonomyEntry()` is the runtime equivalent for consumers without a JSON Schema validator; `findTaxonomyConflicts()` implements the machine-checkable half of the collision policy (`duplicate-id`, `ambiguous-mapping`, `duplicate-mapping`, cleared by `supersedes`). Two worked examples ship under `schema/examples/taxonomy/`.
- **`abi-registry verify` CLI** - `abi-registry verify <contractId> --schema <file>` wraps `verifySchema()` as one command, printing the structured verdict as text or `--json`. `--schema` accepts the canonical `ContractSpec` shape or the hand-authored well-known format. Exit codes are distinct per outcome so CI can gate on them: `0` match, `1` mismatch, `2` unverifiable (`--allow-unverifiable` to accept it), `3` usage/IO/RPC error.
- **On-chain registry support** - `OnChainRegistryPublisher` (implements `RegistryPublisher`, publishes specs to the deployed `contracts/registry` Soroban contract) and `OnChainAbiRegistryClient` (resolves specs by reading the registry contract via RPC simulation, verifying the fetched blob's hash against the on-chain `spec_hash`).
- **WASM auto-discovery** - `discoverContractSpec()` fetches a deployed contract's WASM and parses its embedded `contractspecv0` section into a canonical `ContractSpec`, no human-authored JSON required. Throws `NoEmbeddedSpecError` for non-Rust/stripped contracts and for Stellar Asset Contracts (SACs - which have no WASM at all; verified against a live mainnet USDC lookup).
- **Default registry resolution** - `createDefaultAbiRegistryClient()` composes `BundledWellKnownClient` (the four bundled well-known specs, works fully offline) with the on-chain registry once deployed (`ChainedAbiRegistryClient`, `ORBITAL_REGISTRY_TESTNET_CONTRACT_ID`). This is now `@orbital-stellar/pulse-core`'s default when `CoreConfig.abiRegistry` is omitted.
- **Canonical `ContractSpec` typegen** - `generateContractArtifacts`/`generateContractTypes` now accept a canonical `ContractSpec` (not just raw XDR entries), emitting typed function parameter/return declarations and named UDT (struct/enum/union) interfaces alongside the existing event interfaces + Zod schemas.
- `ContractSpec.pointer` field and `canonicalizeSpec()` - deterministic key-sorted JSON serialization, used to hash specs before publishing and to verify fetched blobs against the on-chain hash.
- `wellKnownToContractSpec()` - converts the hand-authored well-known JSON format into the canonical `ContractSpec` shape.
- `PrimitiveType` gained `"error"` - the generic Soroban error-value slot (`scvError`); real and common, since it's how `Result<T, Error>`'s error arm is encoded on the wire regardless of which `#[contracterror]` enum is named (verified against a real soroban-sdk 27 build).
- SEP-41 event definitions (`transfer`, `mint`, `burn`, `clawback`, `set_authorized`, `approve`) added to the bundled well-known specs (`usdc.json`, `eurc.json`, `aqua.json`, `native-asset-wrapper.json` - the native wrapper only gets `transfer`/`approve`, matching its actual function set).

### Fixed
- `schema/spec.schema.json`'s `PrimitiveType` enum was missing `"error"`, so it rejected specs that `spec.ts`'s own `PrimitiveType`/`validateSpec` accept. Caught by a test asserting the taxonomy schema reuses the same scalar set.
- `decodeContractEvent()` now accepts a canonical `ContractSpec` in addition to `XdrContractSpec` - previously only the latter typechecked, even though a `ContractSpec`'s `xdrEntries` made it structurally usable.

### Changed
- `package.json`'s `files` field now includes `schema/` and `specs/well-known/` - previously these were used at runtime (by `LocalFilePublisher`, and now by `BundledWellKnownClient`) via a path relative to the built `dist/` files, but weren't actually included in what gets published to npm, which would have broken for anyone installing this package outside the monorepo.
