# Orbital - verified schema backlog (worker gate 1)

Worker gate 1 (`docs/worker-entry-gate.md`) needs **>=25 contracts with registered
verified schemas**. "Verified" means `abi-registry verify` returns `match` against the
spec embedded in the contract's WASM. The four seeded tokens (USDC, EURC, AQUA,
XLM) are SACs, which have no WASM, so they report `unverifiable` and count as 0.

23.0 builds the pipeline that publishes contributed specs on-chain. 23.1-23.30 each
add one verified spec for a real mainnet contract. 30 targets for a 25 gate leaves
room for contracts that turn out to be unverifiable.

Create with:

```
node scripts/create-product-issues.mjs --file issues-specs.md \
  --repo determined-001/orbital_stellar --dry-run
```

---

### 23.0 Publish contributed specs from specs/community through the registry

**Labels:** `type:feature` `area:abi-registry`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Medium
**Depends on:** none

#### Description

`scripts/seed-well-known.ts` publishes only the four bundled well-known specs. Issues
23.1-23.30 add verified specs for real protocol contracts under a new
`packages/abi-registry/specs/community/` directory. Nothing publishes that directory
yet, so merged specs would never reach the on-chain registry.

#### Acceptance criteria

- [ ] `specs/community/README.md` documents the file layout: `<contractId>.json` (canonical `ContractSpec`) plus `<contractId>.verdict.json` (`abi-registry verify --json` output)
- [ ] `seed-well-known.ts` (or a sibling `seed-community.ts`) publishes every community spec whose verdict is `match`, and refuses any other verdict
- [ ] CI re-runs `abi-registry verify --network mainnet` for every file in `specs/community/` and fails on anything but `match`
- [ ] `--dry-run` works against the live testnet registry
- [ ] Unit tests cover the verdict gate

#### Implementation notes

1. Reuse the two-phase generate/publish flow and the pointer check from `seed-well-known.ts`.
2. The pointer is the raw GitHub URL of the committed community file at `main`.
3. Add the CI step to `.github/workflows/ci.yml`, scoped to changes under `specs/community/`.

#### Affected files

- `packages/abi-registry/scripts/seed-well-known.ts` or `scripts/seed-community.ts` (new)
- `packages/abi-registry/specs/community/README.md` (new)
- `.github/workflows/ci.yml`

---

### 23.1 Verified schema: Blend Pool (v2)

**Labels:** `type:feature` `area:abi-registry` `good-first-issue`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **Blend Pool (v2)** contract on Stellar
mainnet (lending pool; emits supply/borrow/liquidation events). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from Blend's official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] `packages/abi-registry/specs/community/<contractId>.json` holds the canonical `ContractSpec` produced by `discoverContractSpec()`, not hand-written
- [ ] `<contractId>.verdict.json` is the output of `abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json` and its status is `match`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is `unverifiable` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run `discoverContractSpec({ contractId, rpcUrl })` against a mainnet RPC and write it with `canonicalizeSpec()`.
3. Run `abi-registry verify` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- `packages/abi-registry/specs/community/` (two new files)

---

### 23.2 Verified schema: Blend Pool Factory

**Labels:** `type:feature` `area:abi-registry` `good-first-issue`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **Blend Pool Factory** contract on Stellar
mainnet (deploys Blend pools). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from Blend's official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] `packages/abi-registry/specs/community/<contractId>.json` holds the canonical `ContractSpec` produced by `discoverContractSpec()`, not hand-written
- [ ] `<contractId>.verdict.json` is the output of `abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json` and its status is `match`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is `unverifiable` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run `discoverContractSpec({ contractId, rpcUrl })` against a mainnet RPC and write it with `canonicalizeSpec()`.
3. Run `abi-registry verify` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- `packages/abi-registry/specs/community/` (two new files)

---

### 23.3 Verified schema: Blend Backstop

**Labels:** `type:feature` `area:abi-registry` `good-first-issue`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **Blend Backstop** contract on Stellar
mainnet (backstop deposits, queued withdrawals, emissions). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from Blend's official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] `packages/abi-registry/specs/community/<contractId>.json` holds the canonical `ContractSpec` produced by `discoverContractSpec()`, not hand-written
- [ ] `<contractId>.verdict.json` is the output of `abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json` and its status is `match`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is `unverifiable` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run `discoverContractSpec({ contractId, rpcUrl })` against a mainnet RPC and write it with `canonicalizeSpec()`.
3. Run `abi-registry verify` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- `packages/abi-registry/specs/community/` (two new files)

---

### 23.4 Verified schema: Blend Emitter

**Labels:** `type:feature` `area:abi-registry` `good-first-issue`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **Blend Emitter** contract on Stellar
mainnet (BLND emission source). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from Blend's official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] `packages/abi-registry/specs/community/<contractId>.json` holds the canonical `ContractSpec` produced by `discoverContractSpec()`, not hand-written
- [ ] `<contractId>.verdict.json` is the output of `abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json` and its status is `match`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is `unverifiable` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run `discoverContractSpec({ contractId, rpcUrl })` against a mainnet RPC and write it with `canonicalizeSpec()`.
3. Run `abi-registry verify` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- `packages/abi-registry/specs/community/` (two new files)

---

### 23.5 Verified schema: Soroswap Router

**Labels:** `type:feature` `area:abi-registry` `good-first-issue`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **Soroswap Router** contract on Stellar
mainnet (swap routing entry point). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from Soroswap's official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] `packages/abi-registry/specs/community/<contractId>.json` holds the canonical `ContractSpec` produced by `discoverContractSpec()`, not hand-written
- [ ] `<contractId>.verdict.json` is the output of `abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json` and its status is `match`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is `unverifiable` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run `discoverContractSpec({ contractId, rpcUrl })` against a mainnet RPC and write it with `canonicalizeSpec()`.
3. Run `abi-registry verify` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- `packages/abi-registry/specs/community/` (two new files)

---

### 23.6 Verified schema: Soroswap Factory

**Labels:** `type:feature` `area:abi-registry` `good-first-issue`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **Soroswap Factory** contract on Stellar
mainnet (creates pairs). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from Soroswap's official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] `packages/abi-registry/specs/community/<contractId>.json` holds the canonical `ContractSpec` produced by `discoverContractSpec()`, not hand-written
- [ ] `<contractId>.verdict.json` is the output of `abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json` and its status is `match`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is `unverifiable` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run `discoverContractSpec({ contractId, rpcUrl })` against a mainnet RPC and write it with `canonicalizeSpec()`.
3. Run `abi-registry verify` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- `packages/abi-registry/specs/community/` (two new files)

---

### 23.7 Verified schema: Soroswap Pair (XLM/USDC)

**Labels:** `type:feature` `area:abi-registry` `good-first-issue`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **Soroswap Pair (XLM/USDC)** contract on Stellar
mainnet (one representative pair; all pairs share its WASM). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from Soroswap's official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] `packages/abi-registry/specs/community/<contractId>.json` holds the canonical `ContractSpec` produced by `discoverContractSpec()`, not hand-written
- [ ] `<contractId>.verdict.json` is the output of `abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json` and its status is `match`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is `unverifiable` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run `discoverContractSpec({ contractId, rpcUrl })` against a mainnet RPC and write it with `canonicalizeSpec()`.
3. Run `abi-registry verify` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- `packages/abi-registry/specs/community/` (two new files)

---

### 23.8 Verified schema: Soroswap Aggregator

**Labels:** `type:feature` `area:abi-registry` `good-first-issue`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **Soroswap Aggregator** contract on Stellar
mainnet (cross-DEX routing). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from Soroswap's official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] `packages/abi-registry/specs/community/<contractId>.json` holds the canonical `ContractSpec` produced by `discoverContractSpec()`, not hand-written
- [ ] `<contractId>.verdict.json` is the output of `abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json` and its status is `match`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is `unverifiable` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run `discoverContractSpec({ contractId, rpcUrl })` against a mainnet RPC and write it with `canonicalizeSpec()`.
3. Run `abi-registry verify` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- `packages/abi-registry/specs/community/` (two new files)

---

### 23.9 Verified schema: Aquarius AMM Router

**Labels:** `type:feature` `area:abi-registry` `good-first-issue`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **Aquarius AMM Router** contract on Stellar
mainnet (pool routing and deposits). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from Aquarius's official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] `packages/abi-registry/specs/community/<contractId>.json` holds the canonical `ContractSpec` produced by `discoverContractSpec()`, not hand-written
- [ ] `<contractId>.verdict.json` is the output of `abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json` and its status is `match`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is `unverifiable` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run `discoverContractSpec({ contractId, rpcUrl })` against a mainnet RPC and write it with `canonicalizeSpec()`.
3. Run `abi-registry verify` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- `packages/abi-registry/specs/community/` (two new files)

---

### 23.10 Verified schema: Aquarius Constant-product pool

**Labels:** `type:feature` `area:abi-registry` `good-first-issue`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **Aquarius Constant-product pool** contract on Stellar
mainnet (one representative pool). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from Aquarius's official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] `packages/abi-registry/specs/community/<contractId>.json` holds the canonical `ContractSpec` produced by `discoverContractSpec()`, not hand-written
- [ ] `<contractId>.verdict.json` is the output of `abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json` and its status is `match`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is `unverifiable` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run `discoverContractSpec({ contractId, rpcUrl })` against a mainnet RPC and write it with `canonicalizeSpec()`.
3. Run `abi-registry verify` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- `packages/abi-registry/specs/community/` (two new files)

---

### 23.11 Verified schema: Aquarius Stableswap pool

**Labels:** `type:feature` `area:abi-registry` `good-first-issue`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **Aquarius Stableswap pool** contract on Stellar
mainnet (one representative pool). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from Aquarius's official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] `packages/abi-registry/specs/community/<contractId>.json` holds the canonical `ContractSpec` produced by `discoverContractSpec()`, not hand-written
- [ ] `<contractId>.verdict.json` is the output of `abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json` and its status is `match`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is `unverifiable` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run `discoverContractSpec({ contractId, rpcUrl })` against a mainnet RPC and write it with `canonicalizeSpec()`.
3. Run `abi-registry verify` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- `packages/abi-registry/specs/community/` (two new files)

---

### 23.12 Verified schema: Phoenix Factory

**Labels:** `type:feature` `area:abi-registry` `good-first-issue`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **Phoenix Factory** contract on Stellar
mainnet (creates Phoenix pools). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from Phoenix's official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] `packages/abi-registry/specs/community/<contractId>.json` holds the canonical `ContractSpec` produced by `discoverContractSpec()`, not hand-written
- [ ] `<contractId>.verdict.json` is the output of `abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json` and its status is `match`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is `unverifiable` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run `discoverContractSpec({ contractId, rpcUrl })` against a mainnet RPC and write it with `canonicalizeSpec()`.
3. Run `abi-registry verify` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- `packages/abi-registry/specs/community/` (two new files)

---

### 23.13 Verified schema: Phoenix XYK pool

**Labels:** `type:feature` `area:abi-registry` `good-first-issue`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **Phoenix XYK pool** contract on Stellar
mainnet (one representative pool). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from Phoenix's official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] `packages/abi-registry/specs/community/<contractId>.json` holds the canonical `ContractSpec` produced by `discoverContractSpec()`, not hand-written
- [ ] `<contractId>.verdict.json` is the output of `abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json` and its status is `match`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is `unverifiable` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run `discoverContractSpec({ contractId, rpcUrl })` against a mainnet RPC and write it with `canonicalizeSpec()`.
3. Run `abi-registry verify` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- `packages/abi-registry/specs/community/` (two new files)

---

### 23.14 Verified schema: Phoenix Stableswap pool

**Labels:** `type:feature` `area:abi-registry` `good-first-issue`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **Phoenix Stableswap pool** contract on Stellar
mainnet (one representative pool). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from Phoenix's official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] `packages/abi-registry/specs/community/<contractId>.json` holds the canonical `ContractSpec` produced by `discoverContractSpec()`, not hand-written
- [ ] `<contractId>.verdict.json` is the output of `abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json` and its status is `match`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is `unverifiable` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run `discoverContractSpec({ contractId, rpcUrl })` against a mainnet RPC and write it with `canonicalizeSpec()`.
3. Run `abi-registry verify` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- `packages/abi-registry/specs/community/` (two new files)

---

### 23.15 Verified schema: Phoenix Stake

**Labels:** `type:feature` `area:abi-registry` `good-first-issue`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **Phoenix Stake** contract on Stellar
mainnet (LP staking and rewards). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from Phoenix's official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] `packages/abi-registry/specs/community/<contractId>.json` holds the canonical `ContractSpec` produced by `discoverContractSpec()`, not hand-written
- [ ] `<contractId>.verdict.json` is the output of `abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json` and its status is `match`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is `unverifiable` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run `discoverContractSpec({ contractId, rpcUrl })` against a mainnet RPC and write it with `canonicalizeSpec()`.
3. Run `abi-registry verify` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- `packages/abi-registry/specs/community/` (two new files)

---

### 23.16 Verified schema: Phoenix Multihop

**Labels:** `type:feature` `area:abi-registry` `good-first-issue`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **Phoenix Multihop** contract on Stellar
mainnet (multi-hop swaps). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from Phoenix's official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] `packages/abi-registry/specs/community/<contractId>.json` holds the canonical `ContractSpec` produced by `discoverContractSpec()`, not hand-written
- [ ] `<contractId>.verdict.json` is the output of `abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json` and its status is `match`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is `unverifiable` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run `discoverContractSpec({ contractId, rpcUrl })` against a mainnet RPC and write it with `canonicalizeSpec()`.
3. Run `abi-registry verify` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- `packages/abi-registry/specs/community/` (two new files)

---

### 23.17 Verified schema: FxDAO Vaults

**Labels:** `type:feature` `area:abi-registry` `good-first-issue`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **FxDAO Vaults** contract on Stellar
mainnet (collateralized stablecoin vaults). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from FxDAO's official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] `packages/abi-registry/specs/community/<contractId>.json` holds the canonical `ContractSpec` produced by `discoverContractSpec()`, not hand-written
- [ ] `<contractId>.verdict.json` is the output of `abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json` and its status is `match`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is `unverifiable` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run `discoverContractSpec({ contractId, rpcUrl })` against a mainnet RPC and write it with `canonicalizeSpec()`.
3. Run `abi-registry verify` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- `packages/abi-registry/specs/community/` (two new files)

---

### 23.18 Verified schema: FxDAO Locking pool

**Labels:** `type:feature` `area:abi-registry` `good-first-issue`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **FxDAO Locking pool** contract on Stellar
mainnet (stablecoin locking/rewards). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from FxDAO's official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] `packages/abi-registry/specs/community/<contractId>.json` holds the canonical `ContractSpec` produced by `discoverContractSpec()`, not hand-written
- [ ] `<contractId>.verdict.json` is the output of `abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json` and its status is `match`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is `unverifiable` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run `discoverContractSpec({ contractId, rpcUrl })` against a mainnet RPC and write it with `canonicalizeSpec()`.
3. Run `abi-registry verify` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- `packages/abi-registry/specs/community/` (two new files)

---

### 23.19 Verified schema: Reflector Stellar pubnet price oracle

**Labels:** `type:feature` `area:abi-registry` `good-first-issue`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **Reflector Stellar pubnet price oracle** contract on Stellar
mainnet (SEP-40 oracle over on-chain assets). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from Reflector's official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] `packages/abi-registry/specs/community/<contractId>.json` holds the canonical `ContractSpec` produced by `discoverContractSpec()`, not hand-written
- [ ] `<contractId>.verdict.json` is the output of `abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json` and its status is `match`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is `unverifiable` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run `discoverContractSpec({ contractId, rpcUrl })` against a mainnet RPC and write it with `canonicalizeSpec()`.
3. Run `abi-registry verify` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- `packages/abi-registry/specs/community/` (two new files)

---

### 23.20 Verified schema: Reflector External CEX/DEX price oracle

**Labels:** `type:feature` `area:abi-registry` `good-first-issue`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **Reflector External CEX/DEX price oracle** contract on Stellar
mainnet (SEP-40 oracle over external markets). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from Reflector's official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] `packages/abi-registry/specs/community/<contractId>.json` holds the canonical `ContractSpec` produced by `discoverContractSpec()`, not hand-written
- [ ] `<contractId>.verdict.json` is the output of `abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json` and its status is `match`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is `unverifiable` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run `discoverContractSpec({ contractId, rpcUrl })` against a mainnet RPC and write it with `canonicalizeSpec()`.
3. Run `abi-registry verify` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- `packages/abi-registry/specs/community/` (two new files)

---

### 23.21 Verified schema: Reflector Fiat FX oracle

**Labels:** `type:feature` `area:abi-registry` `good-first-issue`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **Reflector Fiat FX oracle** contract on Stellar
mainnet (SEP-40 oracle over fiat rates). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from Reflector's official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] `packages/abi-registry/specs/community/<contractId>.json` holds the canonical `ContractSpec` produced by `discoverContractSpec()`, not hand-written
- [ ] `<contractId>.verdict.json` is the output of `abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json` and its status is `match`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is `unverifiable` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run `discoverContractSpec({ contractId, rpcUrl })` against a mainnet RPC and write it with `canonicalizeSpec()`.
3. Run `abi-registry verify` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- `packages/abi-registry/specs/community/` (two new files)

---

### 23.22 Verified schema: Comet BLND:USDC pool

**Labels:** `type:feature` `area:abi-registry` `good-first-issue`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **Comet BLND:USDC pool** contract on Stellar
mainnet (weighted pool backing the Blend backstop). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from Comet's official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] `packages/abi-registry/specs/community/<contractId>.json` holds the canonical `ContractSpec` produced by `discoverContractSpec()`, not hand-written
- [ ] `<contractId>.verdict.json` is the output of `abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json` and its status is `match`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is `unverifiable` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run `discoverContractSpec({ contractId, rpcUrl })` against a mainnet RPC and write it with `canonicalizeSpec()`.
3. Run `abi-registry verify` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- `packages/abi-registry/specs/community/` (two new files)

---

### 23.23 Verified schema: DeFindex Factory

**Labels:** `type:feature` `area:abi-registry` `good-first-issue`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **DeFindex Factory** contract on Stellar
mainnet (deploys DeFindex vaults). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from DeFindex's official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] `packages/abi-registry/specs/community/<contractId>.json` holds the canonical `ContractSpec` produced by `discoverContractSpec()`, not hand-written
- [ ] `<contractId>.verdict.json` is the output of `abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json` and its status is `match`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is `unverifiable` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run `discoverContractSpec({ contractId, rpcUrl })` against a mainnet RPC and write it with `canonicalizeSpec()`.
3. Run `abi-registry verify` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- `packages/abi-registry/specs/community/` (two new files)

---

### 23.24 Verified schema: DeFindex Vault

**Labels:** `type:feature` `area:abi-registry` `good-first-issue`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **DeFindex Vault** contract on Stellar
mainnet (one representative vault). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from DeFindex's official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] `packages/abi-registry/specs/community/<contractId>.json` holds the canonical `ContractSpec` produced by `discoverContractSpec()`, not hand-written
- [ ] `<contractId>.verdict.json` is the output of `abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json` and its status is `match`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is `unverifiable` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run `discoverContractSpec({ contractId, rpcUrl })` against a mainnet RPC and write it with `canonicalizeSpec()`.
3. Run `abi-registry verify` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- `packages/abi-registry/specs/community/` (two new files)

---

### 23.25 Verified schema: DeFindex Blend strategy

**Labels:** `type:feature` `area:abi-registry` `good-first-issue`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **DeFindex Blend strategy** contract on Stellar
mainnet (strategy contract used by vaults). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from DeFindex's official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] `packages/abi-registry/specs/community/<contractId>.json` holds the canonical `ContractSpec` produced by `discoverContractSpec()`, not hand-written
- [ ] `<contractId>.verdict.json` is the output of `abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json` and its status is `match`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is `unverifiable` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run `discoverContractSpec({ contractId, rpcUrl })` against a mainnet RPC and write it with `canonicalizeSpec()`.
3. Run `abi-registry verify` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- `packages/abi-registry/specs/community/` (two new files)

---

### 23.26 Verified schema: KALE Farm contract

**Labels:** `type:feature` `area:abi-registry` `good-first-issue`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **KALE Farm contract** contract on Stellar
mainnet (plant/work/harvest proof-of-teamwork contract). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from KALE's official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] `packages/abi-registry/specs/community/<contractId>.json` holds the canonical `ContractSpec` produced by `discoverContractSpec()`, not hand-written
- [ ] `<contractId>.verdict.json` is the output of `abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json` and its status is `match`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is `unverifiable` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run `discoverContractSpec({ contractId, rpcUrl })` against a mainnet RPC and write it with `canonicalizeSpec()`.
3. Run `abi-registry verify` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- `packages/abi-registry/specs/community/` (two new files)

---

### 23.27 Verified schema: Allbridge Core Bridge

**Labels:** `type:feature` `area:abi-registry` `good-first-issue`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **Allbridge Core Bridge** contract on Stellar
mainnet (cross-chain bridge entry point). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from Allbridge Core's official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] `packages/abi-registry/specs/community/<contractId>.json` holds the canonical `ContractSpec` produced by `discoverContractSpec()`, not hand-written
- [ ] `<contractId>.verdict.json` is the output of `abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json` and its status is `match`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is `unverifiable` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run `discoverContractSpec({ contractId, rpcUrl })` against a mainnet RPC and write it with `canonicalizeSpec()`.
3. Run `abi-registry verify` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- `packages/abi-registry/specs/community/` (two new files)

---

### 23.28 Verified schema: Allbridge Core Pool (USDC)

**Labels:** `type:feature` `area:abi-registry` `good-first-issue`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **Allbridge Core Pool (USDC)** contract on Stellar
mainnet (one representative liquidity pool). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from Allbridge Core's official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] `packages/abi-registry/specs/community/<contractId>.json` holds the canonical `ContractSpec` produced by `discoverContractSpec()`, not hand-written
- [ ] `<contractId>.verdict.json` is the output of `abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json` and its status is `match`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is `unverifiable` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run `discoverContractSpec({ contractId, rpcUrl })` against a mainnet RPC and write it with `canonicalizeSpec()`.
3. Run `abi-registry verify` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- `packages/abi-registry/specs/community/` (two new files)

---

### 23.29 Verified schema: Orbit Treasury / bridge

**Labels:** `type:feature` `area:abi-registry` `good-first-issue`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **Orbit Treasury / bridge** contract on Stellar
mainnet (Orbit CDP stablecoin treasury). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from Orbit's official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] `packages/abi-registry/specs/community/<contractId>.json` holds the canonical `ContractSpec` produced by `discoverContractSpec()`, not hand-written
- [ ] `<contractId>.verdict.json` is the output of `abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json` and its status is `match`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is `unverifiable` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run `discoverContractSpec({ contractId, rpcUrl })` against a mainnet RPC and write it with `canonicalizeSpec()`.
3. Run `abi-registry verify` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- `packages/abi-registry/specs/community/` (two new files)

---

### 23.30 Verified schema: Slender Lending pool

**Labels:** `type:feature` `area:abi-registry` `good-first-issue`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **Slender Lending pool** contract on Stellar
mainnet (lending pool). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from Slender's official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] `packages/abi-registry/specs/community/<contractId>.json` holds the canonical `ContractSpec` produced by `discoverContractSpec()`, not hand-written
- [ ] `<contractId>.verdict.json` is the output of `abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json` and its status is `match`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is `unverifiable` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run `discoverContractSpec({ contractId, rpcUrl })` against a mainnet RPC and write it with `canonicalizeSpec()`.
3. Run `abi-registry verify` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- `packages/abi-registry/specs/community/` (two new files)

---
