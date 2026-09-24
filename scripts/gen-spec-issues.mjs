#!/usr/bin/env node
// One-off generator for issues-specs.md (worker gate 1: >=25 verified schemas).
// Output feeds scripts/create-product-issues.mjs --file issues-specs.md.
import { writeFileSync } from "node:fs";

const TARGETS = [
  ["Blend", "Pool (v2)", "lending pool; emits supply/borrow/liquidation events"],
  ["Blend", "Pool Factory", "deploys Blend pools"],
  ["Blend", "Backstop", "backstop deposits, queued withdrawals, emissions"],
  ["Blend", "Emitter", "BLND emission source"],
  ["Soroswap", "Router", "swap routing entry point"],
  ["Soroswap", "Factory", "creates pairs"],
  ["Soroswap", "Pair (XLM/USDC)", "one representative pair; all pairs share its WASM"],
  ["Soroswap", "Aggregator", "cross-DEX routing"],
  ["Aquarius", "AMM Router", "pool routing and deposits"],
  ["Aquarius", "Constant-product pool", "one representative pool"],
  ["Aquarius", "Stableswap pool", "one representative pool"],
  ["Phoenix", "Factory", "creates Phoenix pools"],
  ["Phoenix", "XYK pool", "one representative pool"],
  ["Phoenix", "Stableswap pool", "one representative pool"],
  ["Phoenix", "Stake", "LP staking and rewards"],
  ["Phoenix", "Multihop", "multi-hop swaps"],
  ["FxDAO", "Vaults", "collateralized stablecoin vaults"],
  ["FxDAO", "Locking pool", "stablecoin locking/rewards"],
  ["Reflector", "Stellar pubnet price oracle", "SEP-40 oracle over on-chain assets"],
  ["Reflector", "External CEX/DEX price oracle", "SEP-40 oracle over external markets"],
  ["Reflector", "Fiat FX oracle", "SEP-40 oracle over fiat rates"],
  ["Comet", "BLND:USDC pool", "weighted pool backing the Blend backstop"],
  ["DeFindex", "Factory", "deploys DeFindex vaults"],
  ["DeFindex", "Vault", "one representative vault"],
  ["DeFindex", "Blend strategy", "strategy contract used by vaults"],
  ["KALE", "Farm contract", "plant/work/harvest proof-of-teamwork contract"],
  ["Allbridge Core", "Bridge", "cross-chain bridge entry point"],
  ["Allbridge Core", "Pool (USDC)", "one representative liquidity pool"],
  ["Orbit", "Treasury / bridge", "Orbit CDP stablecoin treasury"],
  ["Slender", "Lending pool", "lending pool"],
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const header = `# Orbital - verified schema backlog (worker gate 1)

Worker gate 1 (\`docs/worker-entry-gate.md\`) needs **>=25 contracts with registered
verified schemas**. "Verified" means \`abi-registry verify\` returns \`match\` against the
spec embedded in the contract's WASM. The four seeded tokens (USDC, EURC, AQUA,
XLM) are SACs, which have no WASM, so they report \`unverifiable\` and count as 0.

23.0 builds the pipeline that publishes contributed specs on-chain. 23.1-23.30 each
add one verified spec for a real mainnet contract. 30 targets for a 25 gate leaves
room for contracts that turn out to be unverifiable.

Create with:

\`\`\`
node scripts/create-product-issues.mjs --file issues-specs.md \\
  --repo determined-001/orbital_stellar --dry-run
\`\`\`

---

### 23.0 Publish contributed specs from specs/community through the registry

**Labels:** \`type:feature\` \`area:abi-registry\`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Medium
**Depends on:** none

#### Description

\`scripts/seed-well-known.ts\` publishes only the four bundled well-known specs. Issues
23.1-23.30 add verified specs for real protocol contracts under a new
\`packages/abi-registry/specs/community/\` directory. Nothing publishes that directory
yet, so merged specs would never reach the on-chain registry.

#### Acceptance criteria

- [ ] \`specs/community/README.md\` documents the file layout: \`<contractId>.json\` (canonical \`ContractSpec\`) plus \`<contractId>.verdict.json\` (\`abi-registry verify --json\` output)
- [ ] \`seed-well-known.ts\` (or a sibling \`seed-community.ts\`) publishes every community spec whose verdict is \`match\`, and refuses any other verdict
- [ ] CI re-runs \`abi-registry verify --network mainnet\` for every file in \`specs/community/\` and fails on anything but \`match\`
- [ ] \`--dry-run\` works against the live testnet registry
- [ ] Unit tests cover the verdict gate

#### Implementation notes

1. Reuse the two-phase generate/publish flow and the pointer check from \`seed-well-known.ts\`.
2. The pointer is the raw GitHub URL of the committed community file at \`main\`.
3. Add the CI step to \`.github/workflows/ci.yml\`, scoped to changes under \`specs/community/\`.

#### Affected files

- \`packages/abi-registry/scripts/seed-well-known.ts\` or \`scripts/seed-community.ts\` (new)
- \`packages/abi-registry/specs/community/README.md\` (new)
- \`.github/workflows/ci.yml\`

---
`;

const issue = (n, [proto, contract, what]) => `
### 23.${n} Verified schema: ${proto} ${contract}

**Labels:** \`type:feature\` \`area:abi-registry\` \`good-first-issue\`
**Milestone:** Worker gate 1 - 25 verified schemas
**Effort:** Trivial
**Depends on:** none

#### Description

Add a verified canonical spec for the **${proto} ${contract}** contract on Stellar
mainnet (${what}). This counts toward worker gate 1's 25 verified schemas.

#### Acceptance criteria

- [ ] The mainnet contract ID is cited from ${proto}'s official docs or its GitHub deployment file (link it in the PR) and cross-checked on stellar.expert
- [ ] \`packages/abi-registry/specs/community/<contractId>.json\` holds the canonical \`ContractSpec\` produced by \`discoverContractSpec()\`, not hand-written
- [ ] \`<contractId>.verdict.json\` is the output of \`abi-registry verify <contractId> --schema <file> --network mainnet --rpc-url <mainnet RPC> --json\` and its status is \`match\`
- [ ] The spec's name/description fields identify the protocol and contract role
- [ ] If the verdict is \`unverifiable\` (no embedded spec), do not open a PR; comment the verdict on this issue so the maintainer can swap the target

#### Implementation notes

1. Find the contract ID. For a per-pool/per-pair contract, pick one representative instance; they share a WASM.
2. Run \`discoverContractSpec({ contractId, rpcUrl })\` against a mainnet RPC and write it with \`canonicalizeSpec()\`.
3. Run \`abi-registry verify\` as above and commit the JSON verdict.
4. Do not publish on-chain; the maintainer publishes merged specs. This issue does not wait on 23.0.

#### Affected files

- \`packages/abi-registry/specs/community/\` (two new files)

---
`;

writeFileSync(
  new URL("../issues-specs.md", import.meta.url),
  header + TARGETS.map((t, i) => issue(i + 1, t)).join(""),
);
console.log(`wrote issues-specs.md: 1 pipeline + ${TARGETS.length} spec issues`);
