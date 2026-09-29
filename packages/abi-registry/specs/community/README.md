# Community specs

Verified ABI specs for real protocol contracts, contributed under issues
#1185–#1214 and published through the on-chain registry by
`scripts/seed-community.ts`. The CI check that keeps this directory honest
is tracked separately.

## Layout

Each contributed spec is a pair of files keyed by contract ID:

```
specs/community/
  <contractId>.json          # canonical ContractSpec for the contract
  <contractId>.verdict.json  # `abi-registry verify --json` output for it
```

- `<contractId>.json` is the canonical [`ContractSpec`](../src/spec.ts)
  exactly as it will be published: `version`, `name`, `contractId`,
  `functions`, `events`, `types`. The registry pointer is attached at
  publish time, so committed files carry no `pointer` field.
- `<contractId>.verdict.json` is the `abi-registry verify --json` output for
  that spec: `{ "contractId": "<contractId>", "status": "match" | ... }`.

## The verdict gate

Only a `match` verdict is publishable. A `mismatch` or `unverifiable`
verdict, a missing or unreadable verdict file, or a verdict filed against a
different contract ID refuses the spec, and a refused spec fails the
`publish` run. The pointer of every publishable spec is the raw GitHub URL
of its committed file at `main`, checked to serve the exact bytes being
hashed before anything is published - the same check `seed-well-known.ts`
applies to the bundled specs.

## Publishing

```bash
# From packages/abi-registry. Dry run first: simulates against the live
# testnet registry without signing or sending.
SOROBAN_CONTRACT_ID=... SOROBAN_INVOKER_SECRET=... \
  npx tsx scripts/seed-community.ts publish --dry-run

SOROBAN_CONTRACT_ID=... SOROBAN_INVOKER_SECRET=... \
  npx tsx scripts/seed-community.ts publish
```

An empty directory is a successful no-op.
