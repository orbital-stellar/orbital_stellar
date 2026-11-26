# Mainnet Deployment Guide

How to deploy Orbital's contracts to the Stellar public network, what to have in
place first, and how the registry client picks the mainnet registry up
afterwards.

> **Status: nothing is deployed to mainnet yet.** `deployed.mainnet.json` does
> not exist and `ORBITAL_REGISTRY_MAINNET_CONTRACT_ID`,
> `ORBITAL_REGISTRY_MAINNET_RPC_URL` and
> `ORBITAL_REGISTRY_MAINNET_PUBLISHER_ADDRESS` in
> `packages/abi-registry/src/registryConstants.ts` are deliberately `""`.
> Until all three are filled, `createDefaultAbiRegistryClient({ network:
> "mainnet" })` skips the on-chain link and resolves only the bundled specs. It
> never falls back to the testnet registry.

Deployment is a **manual, one-time act**. Contracts are immutable once
deployed, a redeploy publishes new contracts at new IDs instead of upgrading
the old ones, and it spends real XLM. It is intentionally not part of any CI
pipeline. The testnet walk-through is [`testnet-deployment.md`](./testnet-deployment.md);
everything below is what differs on mainnet.

## What gets deployed

`contracts/deploy/deploy.sh mainnet` (via the `deploy_mainnet.sh` wrapper)
deploys the **registry** and **payroll** contracts and writes
`contracts/deployed.mainnet.json`. `demo-emitter` is a testnet fixture and is
excluded; override with `CONTRACTS=...` only if you mean it. The `vault` crate
is a placeholder, not a deployable contract, and is gated by the audit policy
in [`SECURITY.md`](../SECURITY.md#vault-audit-gate-phase-4-worker-layer).

## Key custody

Three different keys are involved. Do not collapse them into one.

| Key | Used for | Where it may live |
| --- | --- | --- |
| **Deployer** (`DEPLOYER_IDENTITY`, default `orbital-deployer`) | Signs `stellar contract deploy`. Its public key is recorded as `deployerPublicKey` in the manifest. | A hardware wallet or your OS secure store, on the machine that runs the script. |
| **Publisher** | Signs `publish` calls and owns the specs they file: the registry keys every record by `(contract_id, publisher, version)`, so this address is what `OnChainAbiRegistryClient` trusts. It is `ORBITAL_REGISTRY_MAINNET_PUBLISHER_ADDRESS`. | Same standard as the deployer. Using a separate, dedicated account keeps a compromised publisher from also being the deploying identity. |
| **Operator / worker keys** | Sign transactions for the worker layer. | Out of scope here; see [`SECURITY.md`](../SECURITY.md). |

Rules that apply to all of them:

- **No mainnet key in CI, the demo, or any hosted environment.** CI secrets are
  readable by every workflow that runs, and the demo invoker is reachable by
  anonymous visitors. `assertRestrictedSecretNetwork` in
  `@orbital-stellar/pulse-core` refuses to sign when a demo or CI path is
  configured for mainnet; do not work around it.
- **Prefer a secure store or hardware wallet over a plaintext secret.** Check
  what your `stellar-cli` version supports with `stellar keys add --help`
  before choosing; do not paste a secret key into a shell history or an env file.
- **Fund only what the deploy needs.** The deployer needs real XLM for fees and
  rent; reads need no funded account.
- **Back up the recovery phrase offline** before the first deploy. There is no
  way to recover a lost deployer or publisher key, and the publisher key is the
  only identity that can publish further versions of the specs it owns.
- **Write down who holds each key** (a role, not a secret) so a handover or a
  compromise response does not depend on one person's memory.

## Pre-flight checklist

Work through this top to bottom. Stop at the first item you cannot tick.

- [ ] The testnet deployment is current: `contracts/deployed.testnet.json`
  matches `main`, and the `contracts` workflow (including `verify-provenance`)
  is green on `main`.
- [ ] You are on a clean checkout of `main`, at the commit you intend to
  deploy. The contracts are built through `contracts/build-wasm.sh`, which
  asserts the pinned toolchain in `rust-toolchain.toml` and normalises build
  paths so the recorded WASM hashes are reproducible by CI. Do not build with
  a different toolchain.
- [ ] `stellar --version` works, and `stellar keys address "$DEPLOYER_IDENTITY"`
  prints the deployer you expect. Compare it to the key you wrote down.
- [ ] The deployer is funded with real XLM on the public network.
- [ ] The publisher account exists, is funded, and its address is recorded.
- [ ] `contracts/deployed.mainnet.json` does not exist, or you have a reason to
  set `ALLOW_REDEPLOY=yes`. A populated manifest blocks the script on purpose.
- [ ] The RPC endpoint is decided. The CLI's built-in `mainnet` network is the
  default; for a private endpoint set `RPC_URL` **and** `NETWORK_PASSPHRASE`
  (`Public Global Stellar Network ; September 2015`) together. Note this URL:
  it becomes `ORBITAL_REGISTRY_MAINNET_RPC_URL`.
- [ ] `CONTRACTS` is what you intend (default: `registry payroll`).
- [ ] A second person has read this list against the commit and the key table.
- [ ] You know the rollback story: there is none. A bad deploy means new
  contracts at new IDs and a constants change (see below), not an edit.

## Deploy

```bash
cd contracts
DEPLOYER_IDENTITY=orbital-deployer ./deploy/deploy_mainnet.sh
```

The script prints the network, deployer and contract set, then requires you to
type `deploy to mainnet`. In a non-interactive shell it refuses unless
`CONFIRM_MAINNET=yes` is set; do not set that in a pipeline. It writes
`contracts/deployed.mainnet.json` with each contract ID and the SHA-256 of the
WASM it deployed.

## After the deploy

1. **Commit `contracts/deployed.mainnet.json`.** CI's `verify-provenance` job
   iterates every `deployed.*.json`, rebuilds the contracts, fetches the
   deployed WASM from that network and compares hashes, so committing the
   manifest is what puts the mainnet deployment under the same drift check as
   testnet.
2. **Check it independently.** Open the registry contract on stellar.expert
   (public network) and confirm the contract ID and the WASM hash match the
   manifest. Do not rely on the script's own output as the only evidence.
3. **Fill the constants** in `packages/abi-registry/src/registryConstants.ts`
   from the manifest and the publisher you recorded:

   ```ts
   export const ORBITAL_REGISTRY_MAINNET_CONTRACT_ID = "C...";       // deployed.mainnet.json: contracts.registry.contractId
   export const ORBITAL_REGISTRY_MAINNET_RPC_URL = "https://...";   // the RPC you deployed through
   export const ORBITAL_REGISTRY_MAINNET_PUBLISHER_ADDRESS = "G..."; // the publisher account
   ```

   Fill all three or none: a registry without its RPC URL or its publisher
   cannot be read, so the factory skips the link unless all three are set.
   `registryConstants.test.ts` enforces the same all-or-nothing rule and checks
   the shape of the values once they are filled.
4. **Seed the well-known specs** under the publisher, as in step 5 of the
   testnet guide, then register the payroll `Disbursed` event schema against the
   payroll contract (see `contracts/README.md`).
5. **Keep the entries alive.** Soroban archives persistent entries when their
   TTL runs out; see "Registry durability" in `contracts/README.md` and
   schedule `touch` for specs that must outlive ~180 days.
6. Release a package version that carries the new constants, and update the
   README's on-chain table.

## Using the mainnet registry from code

```ts
import { createDefaultAbiRegistryClient } from "@orbital-stellar/abi-registry";

const registry = createDefaultAbiRegistryClient({ network: "mainnet" });
```

| `network` | On-chain link |
| --- | --- |
| `"testnet"` (default) | The testnet registry. |
| `"mainnet"` | The mainnet registry, or no on-chain link while the three mainnet values are not all set. |
| `"futurenet"` | None. Orbital has no futurenet registry. |

The constants can be overridden per process, which is also the fastest way to
re-point consumers after an emergency redeploy without waiting for a release.
The variable names match the constants they override:

| Environment variable | Overrides the constant |
| --- | --- |
| `ORBITAL_REGISTRY_MAINNET_CONTRACT_ID` | `ORBITAL_REGISTRY_MAINNET_CONTRACT_ID` |
| `ORBITAL_REGISTRY_MAINNET_RPC_URL` | `ORBITAL_REGISTRY_MAINNET_RPC_URL` |
| `ORBITAL_REGISTRY_MAINNET_PUBLISHER_ADDRESS` | `ORBITAL_REGISTRY_MAINNET_PUBLISHER_ADDRESS` |

The testnet registry has its own variables (`ORBITAL_REGISTRY_TESTNET_CONTRACT_ID`,
`ORBITAL_REGISTRY_TESTNET_RPC_URL`, `ORBITAL_REGISTRY_PUBLISHER_ADDRESS`); they
are not read when `network` is `"mainnet"`.

> `EventEngine` in `@orbital-stellar/pulse-core` still calls
> `createDefaultAbiRegistryClient()` without a network, so it keeps using the
> testnet registry. Passing its configured network through is a separate change.
