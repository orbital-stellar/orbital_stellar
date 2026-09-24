# Orbital - post-0.2.0 cleanup (batch 24)

30 non-blocking issues, each scoped to one file or directory.

---

### 24.1 README: refresh 'What works today' and status line for 0.2.0

**Labels:** `type:docs`
**Milestone:** Post-0.2.0 cleanup
**Effort:** Trivial
**Depends on:** none

#### Description

README.md still describes the `0.1.0` world: the status line says `v0.1.0` on npm, the "What works today" table marks Soroban subscription as not on npm and links #1132 (now closed), the Quickstart warns that contract events need a newer build than `0.1.0`, and the on-chain table says the registry is "never invoked" - it now holds four published specs (USDC, EURC, AQUA, XLM SAC; see `contracts/deployed.testnet.json` `seededSpecs`).

#### Acceptance criteria

- [ ] Status line and every npm cell reflect `0.2.0`
- [ ] Soroban subscription, abi-registry, orbital-indexer, anchor-sdk and worker-core rows show their real npm state
- [ ] The Quickstart `0.1.0` warning block is removed
- [ ] On-chain table reflects the seeded registry and cites `contracts/deployed.testnet.json`
- [ ] No other file changes

#### Implementation notes

1. Check each claim with `npm view @orbital-stellar/<pkg> version` before writing it.

#### Affected files

- `README.md`

---

### 24.2 CHANGELOG: add the 0.2.0 roll-up entry

**Labels:** `type:docs`
**Milestone:** Post-0.2.0 cleanup
**Effort:** Trivial
**Depends on:** none

#### Description

Each package's CHANGELOG has a `[0.2.0] - 2026-09-23` section, but the top-level CHANGELOG.md, which rolls them up, has none. Its intro also lists only four packages; seven are published now.

#### Acceptance criteria

- [ ] A `## [0.2.0] - 2026-09-23` section summarizing each package's 0.2.0 notes, with links to the per-package CHANGELOGs
- [ ] Calls out the first publish of `orbital-indexer`, `anchor-sdk` and `worker-core`
- [ ] The intro paragraph lists all seven published packages

#### Implementation notes

1. Summarize, do not copy whole per-package sections.

#### Affected files

- `CHANGELOG.md`

---

### 24.3 Worker gate tracker: refresh gate evidence after 0.2.0

**Labels:** `type:docs` `area:workers`
**Milestone:** Post-0.2.0 cleanup
**Effort:** Trivial
**Depends on:** none

#### Description

`docs/worker-entry-gate.md` cites the old testnet registry ID `CDSCV5WB…` (the contracts were redeployed 2026-09-06), says `anchor-sdk` is not on npm (it is, at 0.2.0), and counts 5 verified schemas when the four seeded SAC specs are `unverifiable` and do not count.

#### Acceptance criteria

- [ ] Contract IDs match `contracts/deployed.testnet.json`
- [ ] Gate 2 records `anchor-sdk@0.2.0` on npm; `v1.0.0` still outstanding
- [ ] Gate 1's schema count explains SACs are `unverifiable` and links the milestone 'Worker gate 1 - 25 verified schemas'
- [ ] Gates 3 and 4 text is left unchanged (maintainer decision pending)

#### Implementation notes

1. Re-verify each number against the repo or npm; do not copy from other docs.

#### Affected files

- `docs/worker-entry-gate.md`

---

### 24.4 ROADMAP Phase 4: record W0-W3 as built and W4 as dropped

**Labels:** `type:docs` `area:workers`
**Milestone:** Post-0.2.0 cleanup
**Effort:** Trivial
**Depends on:** none

#### Description

ROADMAP.md Phase 4 still reads as not started. All 38 worker issues (18.x-22.x) are closed: W0-W3 live in `packages/worker-core`, and W4 (vault, copy-trade, latency tier) was deliberately dropped in #1137.

#### Acceptance criteria

- [ ] At-a-glance row and Phase 4 section mark W0-W3 `[x]` with links to the package
- [ ] W4 is marked dropped with a link to #1137 and a one-line reason
- [ ] `worker-core@0.2.0` on npm is mentioned
- [ ] Only the Phase 4 section and its at-a-glance row change

#### Implementation notes

1. Read #1137's description for the drop rationale.

#### Affected files

- `ROADMAP.md`

---

### 24.5 worker-core README: add install instructions and current status

**Labels:** `type:docs` `area:workers`
**Milestone:** Post-0.2.0 cleanup
**Effort:** Trivial
**Depends on:** none

#### Description

`@orbital-stellar/worker-core` is on npm at 0.2.0, but its README has no install line and still describes the layer as frozen scope.

#### Acceptance criteria

- [ ] `pnpm add @orbital-stellar/worker-core` near the top
- [ ] A short status note: W0-W3 shipped, W4 dropped (#1137)
- [ ] The 'trigger is not the custodian' section is untouched

#### Implementation notes

1. Match the tone of `packages/anchor-sdk/README.md`'s opening.

#### Affected files

- `packages/worker-core/README.md`

---

### 24.6 Worker design doc: note the W4 drop

**Labels:** `type:docs` `area:workers`
**Milestone:** Post-0.2.0 cleanup
**Effort:** Trivial
**Depends on:** none

#### Description

`docs/design/workers.md` still describes the W0 → W4 build order as fully planned. W4 (vault, copy-trade, latency-sensitive tier) was removed in #1137.

#### Acceptance criteria

- [ ] The build-order section marks W4 as dropped, linking #1137
- [ ] Any 'frozen' wording that no longer matches the code is updated
- [ ] The four precedence rules are unchanged

#### Implementation notes

1. Do not re-litigate the design; record what shipped.

#### Affected files

- `docs/design/workers.md`

---

### 24.7 express-starter: install @orbital-stellar packages from npm 0.2.0

**Labels:** `type:dx` `area:starters`
**Milestone:** Post-0.2.0 cleanup
**Effort:** Trivial
**Depends on:** none

#### Description

`examples/express-starter` depends on `pulse-core`, `pulse-webhooks` and `abi-registry` via `workspace:*`. A developer copying the starter out of the monorepo cannot install it. Replaces the express-starter part of #896.

#### Acceptance criteria

- [ ] Every `@orbital-stellar/*` dependency is `^0.2.0`
- [ ] `pnpm --filter express-starter build` and its tests pass
- [ ] The express-starter job in `.github/workflows/starter-smoke-test.yml` passes
- [ ] Only this starter's package.json and the lockfile change

#### Implementation notes

1. The starter is inside the pnpm workspace; confirm the lockfile resolves the npm version rather than the local link.

#### Affected files

- `examples/express-starter/package.json`
- `pnpm-lock.yaml (regenerated)`

---

### 24.8 anchor-starter: install @orbital-stellar packages from npm 0.2.0

**Labels:** `type:dx` `area:starters`
**Milestone:** Post-0.2.0 cleanup
**Effort:** Trivial
**Depends on:** none

#### Description

`examples/anchor-starter` depends on `anchor-sdk`, `abi-registry` and `pulse-core` via `workspace:*`. A developer copying the starter out of the monorepo cannot install it. Replaces the anchor-starter part of #896.

#### Acceptance criteria

- [ ] Every `@orbital-stellar/*` dependency is `^0.2.0`
- [ ] `pnpm --filter anchor-starter build` and its tests pass
- [ ] The anchor-starter job in `.github/workflows/starter-smoke-test.yml` passes
- [ ] Only this starter's package.json and the lockfile change

#### Implementation notes

1. The starter is inside the pnpm workspace; confirm the lockfile resolves the npm version rather than the local link.

#### Affected files

- `examples/anchor-starter/package.json`
- `pnpm-lock.yaml (regenerated)`

---

### 24.9 next-starter: install @orbital-stellar packages from npm 0.2.0

**Labels:** `type:dx` `area:starters`
**Milestone:** Post-0.2.0 cleanup
**Effort:** Trivial
**Depends on:** none

#### Description

`examples/next-starter` pins `pulse-core` and `pulse-notify` at `^0.1.0`, which in 0.x semver excludes 0.2.0. A developer copying the starter out of the monorepo cannot install it. Replaces the next-starter part of #896.

#### Acceptance criteria

- [ ] Every `@orbital-stellar/*` dependency is `^0.2.0`
- [ ] `pnpm --filter next-starter build` and its tests pass
- [ ] The next-starter job in `.github/workflows/starter-smoke-test.yml` passes
- [ ] Only this starter's package.json and the lockfile change

#### Implementation notes

1. The starter is inside the pnpm workspace; confirm the lockfile resolves the npm version rather than the local link.

#### Affected files

- `examples/next-starter/package.json`
- `pnpm-lock.yaml (regenerated)`

---

### 24.10 pulse-core: TSDoc for the Soroban RPC client types

**Labels:** `type:docs`
**Milestone:** Post-0.2.0 cleanup
**Effort:** Trivial
**Depends on:** none

#### Description

`node scripts/check-tsdoc-coverage.mjs` reports these public exports without TSDoc: `JsonRpcSuccess`, `JsonRpcFailure`, `JsonRpcResponse`, `PollTransactionOptions`, `SorobanEventFilter`, `SorobanEventXdrFormat`, `SorobanGetEventsParams`, `SorobanGetEventsResult`, `SorobanLatestLedgerResult`, `SorobanNetworkInfo`, `SorobanRpcCallOptions`, `SorobanRpcEvent`. They show up undocumented in editor hovers and in the generated reference docs.

#### Acceptance criteria

- [ ] Each listed export has a TSDoc comment that says what it is and, for functions, its params and return
- [ ] `node scripts/check-tsdoc-coverage.mjs` no longer lists them
- [ ] No behavior changes; comments only

#### Implementation notes

1. Put the comment on the declaration, not on a re-export line.
2. Keep each comment to what a caller needs; follow existing documented exports in the same package.

#### Affected files

- `packages/pulse-core/src/SorobanRpcClient.ts`

---

### 24.11 pulse-core: TSDoc for the classic event types in index.ts

**Labels:** `type:docs`
**Milestone:** Post-0.2.0 cleanup
**Effort:** Trivial
**Depends on:** none

#### Description

`node scripts/check-tsdoc-coverage.mjs` reports these public exports without TSDoc: the event types and unions defined in `index.ts`: `OfferEvent`, `BumpSequenceEvent`, `ClaimableCreatedEvent`, `ClaimableClaimedEvent`, `DataEvent`, `LiquidityPoolDepositEvent`, `LiquidityPoolWithdrawEvent`, `TrustAuthEvent`, `AnchorTransactionEvent`, their `*EventType` unions, `CoreConfig`, `SorobanConfig`, `SubscribeOptions`, `ContractFilter`, `ContractSubscriptionConfig`, `EngineStatus`, `SourceStatus`, `HealthCheckResult`. They show up undocumented in editor hovers and in the generated reference docs.

#### Acceptance criteria

- [ ] Each listed export has a TSDoc comment that says what it is and, for functions, its params and return
- [ ] `node scripts/check-tsdoc-coverage.mjs` no longer lists them
- [ ] No behavior changes; comments only

#### Implementation notes

1. Put the comment on the declaration, not on a re-export line.
2. Keep each comment to what a caller needs; follow existing documented exports in the same package.

#### Affected files

- `packages/pulse-core/src/index.ts`

---

### 24.12 pulse-core: TSDoc for errors, backoff and cursor stores

**Labels:** `type:docs`
**Milestone:** Post-0.2.0 cleanup
**Effort:** Trivial
**Depends on:** none

#### Description

`node scripts/check-tsdoc-coverage.mjs` reports these public exports without TSDoc: `EngineAlreadyStartedError`, `HorizonStreamError`, `InvalidIngestionModeError`, `SorobanRpcError`, `isSorobanRpcError`, `UnknownNetworkError`, `fullJitterBackoffMs`, `MemoryCursorStore`, `FileCursorStore`, `S3CursorStore`, `cacheCursorStore`, `migrateCursors`, `FileRegistryStore`, `StellarAmount`. They show up undocumented in editor hovers and in the generated reference docs.

#### Acceptance criteria

- [ ] Each listed export has a TSDoc comment that says what it is and, for functions, its params and return
- [ ] `node scripts/check-tsdoc-coverage.mjs` no longer lists them
- [ ] No behavior changes; comments only

#### Implementation notes

1. Put the comment on the declaration, not on a re-export line.
2. Keep each comment to what a caller needs; follow existing documented exports in the same package.

#### Affected files

- `packages/pulse-core/src/ (errors.ts, backoff.ts, *CursorStore.ts, FileRegistryStore.ts, amount.ts)`

---

### 24.13 pulse-core: TSDoc for the raw Horizon operation types

**Labels:** `type:docs`
**Milestone:** Post-0.2.0 cleanup
**Effort:** Trivial
**Depends on:** none

#### Description

`node scripts/check-tsdoc-coverage.mjs` reports these public exports without TSDoc: `RawHorizonBaseOperation` and every `RawHorizon*` operation type, plus `RawSorobanEvent`. They show up undocumented in editor hovers and in the generated reference docs.

#### Acceptance criteria

- [ ] Each listed export has a TSDoc comment that says what it is and, for functions, its params and return
- [ ] `node scripts/check-tsdoc-coverage.mjs` no longer lists them
- [ ] No behavior changes; comments only

#### Implementation notes

1. Put the comment on the declaration, not on a re-export line.
2. Keep each comment to what a caller needs; follow existing documented exports in the same package.

#### Affected files

- `packages/pulse-core/src/raw-horizon.ts`

---

### 24.14 pulse-webhooks: TSDoc for public exports

**Labels:** `type:docs`
**Milestone:** Post-0.2.0 cleanup
**Effort:** Trivial
**Depends on:** none

#### Description

`node scripts/check-tsdoc-coverage.mjs` reports these public exports without TSDoc: the 39 exports from `src/index.ts` that the checker reports (retry queues, dead-letter stores, metrics adapters, signing and URL validation). They show up undocumented in editor hovers and in the generated reference docs.

#### Acceptance criteria

- [ ] Each listed export has a TSDoc comment that says what it is and, for functions, its params and return
- [ ] `node scripts/check-tsdoc-coverage.mjs` no longer lists them
- [ ] No behavior changes; comments only

#### Implementation notes

1. Put the comment on the declaration, not on a re-export line.
2. Keep each comment to what a caller needs; follow existing documented exports in the same package.

#### Affected files

- `packages/pulse-webhooks/src/`

---

### 24.15 pulse-notify: TSDoc for hook config and state types

**Labels:** `type:docs`
**Milestone:** Post-0.2.0 cleanup
**Effort:** Trivial
**Depends on:** none

#### Description

`node scripts/check-tsdoc-coverage.mjs` reports these public exports without TSDoc: `UseEventConfig`, `EventState`, `PaymentState`, `UseContractEventConfig`, `UseHistoryOptions`, `HistoryState`, `UseAddressesOptions`, `ContractStateOptions`, `ContractStateResult`, `useContractState`, `PulseNotifyVitePlugin`, and the `StellarConnectionStatus*` exports. They show up undocumented in editor hovers and in the generated reference docs.

#### Acceptance criteria

- [ ] Each listed export has a TSDoc comment that says what it is and, for functions, its params and return
- [ ] `node scripts/check-tsdoc-coverage.mjs` no longer lists them
- [ ] No behavior changes; comments only

#### Implementation notes

1. Put the comment on the declaration, not on a re-export line.
2. Keep each comment to what a caller needs; follow existing documented exports in the same package.

#### Affected files

- `packages/pulse-notify/src/index.ts`

---

### 24.16 pulse-notify: TSDoc for the devtools entry point

**Labels:** `type:docs`
**Milestone:** Post-0.2.0 cleanup
**Effort:** Trivial
**Depends on:** none

#### Description

`node scripts/check-tsdoc-coverage.mjs` reports these public exports without TSDoc: `registerConnection`, `updateConnection`, `unregisterConnection`, `listConnections`, `subscribe`, `PulseNotifyDevtools`, `DevConnection` and the default export. They show up undocumented in editor hovers and in the generated reference docs.

#### Acceptance criteria

- [ ] Each listed export has a TSDoc comment that says what it is and, for functions, its params and return
- [ ] `node scripts/check-tsdoc-coverage.mjs` no longer lists them
- [ ] No behavior changes; comments only

#### Implementation notes

1. Put the comment on the declaration, not on a re-export line.
2. Keep each comment to what a caller needs; follow existing documented exports in the same package.

#### Affected files

- `packages/pulse-notify/src/devtools.tsx`

---

### 24.17 pulse-notify: tests for devtools.tsx

**Labels:** `type:test` `area:pulse-notify`
**Milestone:** Post-0.2.0 cleanup
**Effort:** Trivial
**Depends on:** none

#### Description

`packages/pulse-notify/src/devtools.tsx` is at 0% lines in a fresh `vitest run --coverage`. Add unit tests covering connection registration, update, unregister, list and subscribe notifications.

#### Acceptance criteria

- [ ] Line coverage for `src/devtools.tsx` is at least 85% (branches at least 75%)
- [ ] Tests use no network; stub RPC and timers
- [ ] No change to source files unless a test exposes a real bug (then say so in the PR)

#### Implementation notes

1. Run `cd packages/pulse-notify && npx vitest run --coverage` before and after, and paste both numbers in the PR.

#### Affected files

- `packages/pulse-notify/test/ (new or extended test file)`

---

### 24.18 pulse-notify: tests for useStellarEventSuspense.ts

**Labels:** `type:test` `area:pulse-notify`
**Milestone:** Post-0.2.0 cleanup
**Effort:** Trivial
**Depends on:** none

#### Description

`packages/pulse-notify/src/useStellarEventSuspense.ts` is at 2% lines in a fresh `vitest run --coverage`. Add unit tests covering suspending until the first event, resolving, and error propagation to an error boundary.

#### Acceptance criteria

- [ ] Line coverage for `src/useStellarEventSuspense.ts` is at least 85% (branches at least 75%)
- [ ] Tests use no network; stub RPC and timers
- [ ] No change to source files unless a test exposes a real bug (then say so in the PR)

#### Implementation notes

1. Run `cd packages/pulse-notify && npx vitest run --coverage` before and after, and paste both numbers in the PR.

#### Affected files

- `packages/pulse-notify/test/ (new or extended test file)`

---

### 24.19 pulse-notify: tests for connectionPool.ts

**Labels:** `type:test` `area:pulse-notify`
**Milestone:** Post-0.2.0 cleanup
**Effort:** Trivial
**Depends on:** none

#### Description

`packages/pulse-notify/src/connectionPool.ts` is at 71% lines / 62% branches in a fresh `vitest run --coverage`. Add unit tests covering ref-counted sharing, last-release teardown, and reconnect branches.

#### Acceptance criteria

- [ ] Line coverage for `src/connectionPool.ts` is at least 85% (branches at least 75%)
- [ ] Tests use no network; stub RPC and timers
- [ ] No change to source files unless a test exposes a real bug (then say so in the PR)

#### Implementation notes

1. Run `cd packages/pulse-notify && npx vitest run --coverage` before and after, and paste both numbers in the PR.

#### Affected files

- `packages/pulse-notify/test/ (new or extended test file)`

---

### 24.20 worker-core: tests for registry/WorkerRegistryClient.ts

**Labels:** `type:test` `area:workers`
**Milestone:** Post-0.2.0 cleanup
**Effort:** Trivial
**Depends on:** none

#### Description

`packages/worker-core/src/registry/WorkerRegistryClient.ts` is at 6% lines / 0% branches in a fresh `vitest run --coverage`. Add unit tests covering reads of operator and offering records against a stubbed RPC, including not-found and RPC error paths.

#### Acceptance criteria

- [ ] Line coverage for `src/registry/WorkerRegistryClient.ts` is at least 85% (branches at least 75%)
- [ ] Tests use no network; stub RPC and timers
- [ ] No change to source files unless a test exposes a real bug (then say so in the PR)

#### Implementation notes

1. Run `cd packages/worker-core && npx vitest run --coverage` before and after, and paste both numbers in the PR.

#### Affected files

- `packages/worker-core/test/ (new or extended test file)`

---

### 24.21 worker-core: tests for cli/index.ts

**Labels:** `type:test` `area:workers`
**Milestone:** Post-0.2.0 cleanup
**Effort:** Trivial
**Depends on:** none

#### Description

`packages/worker-core/src/cli/index.ts` is at 47% lines in a fresh `vitest run --coverage`. Add unit tests covering each subcommand's argument parsing and exit codes.

#### Acceptance criteria

- [ ] Line coverage for `src/cli/index.ts` is at least 85% (branches at least 75%)
- [ ] Tests use no network; stub RPC and timers
- [ ] No change to source files unless a test exposes a real bug (then say so in the PR)

#### Implementation notes

1. Run `cd packages/worker-core && npx vitest run --coverage` before and after, and paste both numbers in the PR.

#### Affected files

- `packages/worker-core/test/ (new or extended test file)`

---

### 24.22 worker-core: tests for exports/parsers.ts

**Labels:** `type:test` `area:workers`
**Milestone:** Post-0.2.0 cleanup
**Effort:** Trivial
**Depends on:** none

#### Description

`packages/worker-core/src/exports/parsers.ts` is at 50% lines / 34% branches in a fresh `vitest run --coverage`. Add unit tests covering valid rows, malformed rows and each rejection branch.

#### Acceptance criteria

- [ ] Line coverage for `src/exports/parsers.ts` is at least 85% (branches at least 75%)
- [ ] Tests use no network; stub RPC and timers
- [ ] No change to source files unless a test exposes a real bug (then say so in the PR)

#### Implementation notes

1. Run `cd packages/worker-core && npx vitest run --coverage` before and after, and paste both numbers in the PR.

#### Affected files

- `packages/worker-core/test/ (new or extended test file)`

---

### 24.23 worker-core: tests for WorkerDeadLetterStore.ts

**Labels:** `type:test` `area:workers`
**Milestone:** Post-0.2.0 cleanup
**Effort:** Trivial
**Depends on:** none

#### Description

`packages/worker-core/src/WorkerDeadLetterStore.ts` is at 56% lines in a fresh `vitest run --coverage`. Add unit tests covering enqueue, list, replay and eviction.

#### Acceptance criteria

- [ ] Line coverage for `src/WorkerDeadLetterStore.ts` is at least 85% (branches at least 75%)
- [ ] Tests use no network; stub RPC and timers
- [ ] No change to source files unless a test exposes a real bug (then say so in the PR)

#### Implementation notes

1. Run `cd packages/worker-core && npx vitest run --coverage` before and after, and paste both numbers in the PR.

#### Affected files

- `packages/worker-core/test/ (new or extended test file)`

---

### 24.24 abi-registry: tests for batchGeneration.ts

**Labels:** `type:test` `area:abi-registry`
**Milestone:** Post-0.2.0 cleanup
**Effort:** Trivial
**Depends on:** none

#### Description

`packages/abi-registry/src/batchGeneration.ts` is at 2% lines in a fresh `vitest run --coverage`. Add unit tests covering generating types for several contracts from a config, and the drift check used by `orbital codegen --check`.

#### Acceptance criteria

- [ ] Line coverage for `src/batchGeneration.ts` is at least 85% (branches at least 75%)
- [ ] Tests use no network; stub RPC and timers
- [ ] No change to source files unless a test exposes a real bug (then say so in the PR)

#### Implementation notes

1. Run `cd packages/abi-registry && npx vitest run --coverage` before and after, and paste both numbers in the PR.

#### Affected files

- `packages/abi-registry/test/ (new or extended test file)`

---

### 24.25 abi-registry: tests for watch.ts

**Labels:** `type:test` `area:abi-registry`
**Milestone:** Post-0.2.0 cleanup
**Effort:** Trivial
**Depends on:** none

#### Description

`packages/abi-registry/src/watch.ts` is at 29% lines / 15% branches in a fresh `vitest run --coverage`. Add unit tests covering the poll loop: spec change triggers regeneration, unchanged spec does not, errors are reported without exiting.

#### Acceptance criteria

- [ ] Line coverage for `src/watch.ts` is at least 85% (branches at least 75%)
- [ ] Tests use no network; stub RPC and timers
- [ ] No change to source files unless a test exposes a real bug (then say so in the PR)

#### Implementation notes

1. Run `cd packages/abi-registry && npx vitest run --coverage` before and after, and paste both numbers in the PR.

#### Affected files

- `packages/abi-registry/test/ (new or extended test file)`

---

### 24.26 abi-registry: tests for scval.ts

**Labels:** `type:test` `area:abi-registry`
**Milestone:** Post-0.2.0 cleanup
**Effort:** Trivial
**Depends on:** none

#### Description

`packages/abi-registry/src/scval.ts` is at 68% lines / 58% branches in a fresh `vitest run --coverage`. Add unit tests covering decoding each ScVal variant, including maps, vectors, i128/u128/i256 and error values.

#### Acceptance criteria

- [ ] Line coverage for `src/scval.ts` is at least 85% (branches at least 75%)
- [ ] Tests use no network; stub RPC and timers
- [ ] No change to source files unless a test exposes a real bug (then say so in the PR)

#### Implementation notes

1. Run `cd packages/abi-registry && npx vitest run --coverage` before and after, and paste both numbers in the PR.

#### Affected files

- `packages/abi-registry/test/ (new or extended test file)`

---

### 24.27 pulse-core: tests for eventAddressNarrow.ts

**Labels:** `type:test` `area:pulse-core`
**Milestone:** Post-0.2.0 cleanup
**Effort:** Trivial
**Depends on:** none

#### Description

`packages/pulse-core/src/eventAddressNarrow.ts` is at 0% lines in a fresh `vitest run --coverage`. Add unit tests covering each narrowing branch for the address fields on normalized events.

#### Acceptance criteria

- [ ] Line coverage for `src/eventAddressNarrow.ts` is at least 85% (branches at least 75%)
- [ ] Tests use no network; stub RPC and timers
- [ ] No change to source files unless a test exposes a real bug (then say so in the PR)

#### Implementation notes

1. Run `cd packages/pulse-core && npx vitest run --coverage` before and after, and paste both numbers in the PR.

#### Affected files

- `packages/pulse-core/test/ (new or extended test file)`

---

### 24.28 pulse-core: tests for claimPredicate.ts

**Labels:** `type:test` `area:pulse-core`
**Milestone:** Post-0.2.0 cleanup
**Effort:** Trivial
**Depends on:** none

#### Description

`packages/pulse-core/src/claimPredicate.ts` is at 7% lines in a fresh `vitest run --coverage`. Add unit tests covering unconditional, before/after absolute and relative, and nested and/or/not predicates.

#### Acceptance criteria

- [ ] Line coverage for `src/claimPredicate.ts` is at least 85% (branches at least 75%)
- [ ] Tests use no network; stub RPC and timers
- [ ] No change to source files unless a test exposes a real bug (then say so in the PR)

#### Implementation notes

1. Run `cd packages/pulse-core && npx vitest run --coverage` before and after, and paste both numbers in the PR.

#### Affected files

- `packages/pulse-core/test/ (new or extended test file)`

---

### 24.29 pulse-core: tests for errors.ts

**Labels:** `type:test` `area:pulse-core`
**Milestone:** Post-0.2.0 cleanup
**Effort:** Trivial
**Depends on:** none

#### Description

`packages/pulse-core/src/errors.ts` is at 53% lines / 13% branches in a fresh `vitest run --coverage`. Add unit tests covering constructors, `instanceof` checks and `isSorobanRpcError` for each code.

#### Acceptance criteria

- [ ] Line coverage for `src/errors.ts` is at least 85% (branches at least 75%)
- [ ] Tests use no network; stub RPC and timers
- [ ] No change to source files unless a test exposes a real bug (then say so in the PR)

#### Implementation notes

1. Run `cd packages/pulse-core && npx vitest run --coverage` before and after, and paste both numbers in the PR.

#### Affected files

- `packages/pulse-core/test/ (new or extended test file)`

---

### 24.30 orbital-indexer: tests for AutoPublishIndexer.ts

**Labels:** `type:test` `area:orbital-indexer`
**Milestone:** Post-0.2.0 cleanup
**Effort:** Trivial
**Depends on:** none

#### Description

`packages/orbital-indexer/src/AutoPublishIndexer.ts` is at 84% lines / 54% branches in a fresh `vitest run --coverage`. Add unit tests covering in-flight dedupe, backoff for undiscoverable contracts, and publish-failure retry branches.

#### Acceptance criteria

- [ ] Line coverage for `src/AutoPublishIndexer.ts` is at least 85% (branches at least 75%)
- [ ] Tests use no network; stub RPC and timers
- [ ] No change to source files unless a test exposes a real bug (then say so in the PR)

#### Implementation notes

1. Run `cd packages/orbital-indexer && npx vitest run --coverage` before and after, and paste both numbers in the PR.

#### Affected files

- `packages/orbital-indexer/test/ (new or extended test file)`

---
