# Orbital - Workers and the Worker Marketplace backlog

38 issues implementing PART C of `ORBITAL_PRD.md` v1.0 (2026-08-13): the worker
layer and the marketplace around it - off-chain processes that submit a Soroban
invocation when a condition becomes true, plus the verification, reputation and
backstop products built on the same chain-derived dataset.

Created on GitHub by [`scripts/create-product-issues.mjs`](./scripts/create-product-issues.mjs).

**Issue format.** Each issue is `### <number> <title>` followed by a metadata
block (`Labels`, `Milestone`, `Effort`, `Depends on`), then **Description**,
**Acceptance criteria** (checkboxes - the definition of done), **Implementation
notes** (ordered steps), and **Affected files**.

**Numbering.** Majors 18-22. Majors 1-5, 8-15 and 17 are already on the tracker.

**Effort → points.** Trivial 100 · Medium 150 · High 200.

Run with `--no-wave-label`: these are not Drips Wave issues.

```
node scripts/create-product-issues.mjs --file issues-workers.md \
  --repo determined-001/orbital_stellar --no-wave-label --dry-run
```

---

## Read this before opening a PR against any issue here

### Part C is frozen scope until §C.9 is met

`ORBITAL_PRD.md` Part C is marked **SPECIFIED, NOT APPROVED**. Four gates must
all be met before implementation begins:

1. Phase 2 exit gate (§B.6) - SEP submitted, codegen used in all three starters,
   ≥25 contracts with registered verified schemas, hosted registry serving reads
   in production.
2. `v1.0.0` tagged and `anchor-sdk` published to npm.
3. A **named counterparty** - one Soroban protocol, anchor or team committed to
   consuming Orbital-brokered automation.
4. A written maintainer rationale in `CHANGELOG.md` per the roadmap's unfreeze
   procedure.

None of the four is met as of `e7c9def`. Issues 18.1 and 18.2 exist to close
gate 4 and to track gates 1-3. **Every other issue in this backlog carries
`blocked` until 18.1 closes.**

### The one constraint that overrides every issue here

**A worker must never require authority over user funds** (§C.2). Precedence
order, highest first:

1. **Permissionless trigger functions.** The contract function a worker calls is
   callable by anyone; correctness is enforced by the contract's internal logic,
   not by the caller's identity. If every worker vanishes, the action runs late -
   nothing is stolen.
2. **Fee-bump for gas only.** A worker fronting fees uses native fee-bump
   transactions and fronts its own XLM. It never holds user assets.
3. **Vault pattern for anything trade-like.** Deposits go to a Soroban vault with
   allow-listed pools/assets, a max-slippage bound, and withdrawals only back to
   the depositor. The worker can call a constrained function; it can never decide
   where money goes.
4. **Build order is fixed by risk.** W0 and deterministic W2 event triggers ship
   before W4 trade-signal automation. Skipping the order reintroduces custody
   risk and possible investment-adviser exposure.

Any review that finds a worker needing signing authority over a user account has
found a **design bug**, not a feature. 22.6 makes that check mechanical.

### Staging

| Major | Stage | Issues | PRD ref | Ships |
|---|---|---|---|---|
| 18 | Entry gate + **W0** first-party time-based workers | 18.1-18.13 | §C.1, §C.2, §C.5 | `@orbital-stellar/worker-core` |
| 19 | **W1** verification and reputation from chain data | 19.1-19.6 | §C.3, §C.6 | verification API + scorecards |
| 20 | **W2** external operator registration | 20.1-20.7 | §C.4 | worker registry + standard |
| 21 | **W3** backstop for time-insensitive tiers | 21.1-21.6 | §C.7 | backstop subscription |
| 22 | **W4** latency-sensitive tiers and vault automation | 22.1-22.6 | §C.2 r3, §C.9 | vault contract + copy-trade |

### What this backlog explicitly does not build

Staking, slashing, bonding pools, economic-security adjudication (§C.4). That is
Nectar Network's model - heavy, legally fraught, and out of scope. Reject
contributions that add it.

A TTL-keeper product is also out of scope: CAP-0066 auto-restores archived
persistent and instance entries on access, so "automated TTL extension" is
fee-optimization, not an existential service (§C.8). Temporary storage still
deletes permanently; that is the only remaining niche and it does not justify a
product.

---

## Major 18 - Entry gate and W0: first-party time-based workers

### 18.1 Unfreeze Part C: CHANGELOG rationale and ROADMAP amendment

**Labels:** `type:docs` `type:ops` `maintainer-only` `priority:critical`
**Milestone:** Phase 4 - Workers entry gate
**Effort:** Medium
**Depends on:** none

#### Description

`ROADMAP.md#frozen` and `ORBITAL_PRD.md` Part E both instruct contributors to
reject work against frozen scope. Workers are not currently on the roadmap at
all, so every issue in majors 18-22 is unmergeable until the freeze is lifted in
writing by the maintainer.

This issue is the unfreeze itself. It is deliberately the only issue in this
backlog that is not `blocked`.

#### Acceptance criteria

- [ ] `CHANGELOG.md` carries a dated unfreeze entry naming the worker layer, the
      counterparty that motivated it, and the staging W0-W4
- [ ] `ROADMAP.md` gains a Phase 4 section with the five stages and their gates
- [ ] `ROADMAP.md#frozen` is amended so "workers" is no longer implicitly frozen,
      while payments SDK, auth/identity, x402, agent-sdk, intent compiler,
      shadow-fork simulator and analytics dashboards stay frozen
- [ ] The §C.2 trigger-≠-custodian constraint is quoted verbatim in the roadmap
      section, not paraphrased
- [ ] `docs/open-source-policy.md` states which parts of the worker layer are MIT
      (`worker-core`, the standard, the vault contract) and which are operated
      service (backstop, hosted verification)

#### Implementation notes

1. Follow the unfreeze procedure already written in `ROADMAP.md#frozen` - do not
   invent a new one.
2. The rationale must name the counterparty from gate 3. "There is demand" is not
   a rationale; a named team is.
3. State the build order as a hard constraint, not a suggestion: W4 lands last.
4. Cross-link `ORBITAL_PRD.md` §C.9 so the gate survives the PRD going stale.

#### Affected files

- `CHANGELOG.md`
- `ROADMAP.md`
- `docs/open-source-policy.md`

---

### 18.2 Part C entry-gate tracker

**Labels:** `type:ops` `maintainer-only` `needs-design`
**Milestone:** Phase 4 - Workers entry gate
**Effort:** Trivial
**Depends on:** none

#### Description

Tracking issue for the four §C.9 gates. It exists so the gate state is visible
on the tracker rather than living only in a PRD file, and so that a contributor
who picks up a `blocked` worker issue can see in one click why it is blocked.

Gate 3 - a named counterparty - is the binding constraint on the entire roadmap
(§D.2). It cannot be delegated and no amount of code substitutes for it.

#### Acceptance criteria

- [ ] Issue body carries the four gates as checkboxes with current evidence
- [ ] Gate 1 links the open Phase 2 issues that still block it (#908, #913, #915)
- [ ] Gate 2 links the `v1.0.0` and `anchor-sdk` publication issues
- [ ] Gate 3 names the counterparty or states "none yet" - no aspirational text
- [ ] Every issue in majors 19-22 references this issue as its blocker
- [ ] Closed only when all four gates are checked, not when W0 ships

#### Implementation notes

1. Re-verify each gate against the repo before writing evidence; the PRD reflects
   `ca0a51c` and the repo moves fast.
2. Gate 1's ≥25-verified-schemas leg needs a number, not a claim - count rows in
   the registry.
3. Record the go/no-go input from §D.5: whether Nectar Network stalls or ships to
   mainnet changes the answer.

#### Affected files

- none (tracker issue)

---

### 18.3 worker-core package scaffold and the worker definition model

**Labels:** `type:feature` `area:workers` `needs-design`
**Milestone:** Phase 4 - Workers W0: first-party time-based
**Effort:** High
**Depends on:** 18.1

#### Description

Create `packages/worker-core` - the seventh workspace package, MIT, published as
`@orbital-stellar/worker-core`. It defines what a worker *is* before anything
runs one.

A worker is an off-chain process that submits a transaction invoking a Soroban
contract function when a condition becomes true (§C.1). The type model must make
the three trigger classes explicit from the start - time-based, event-based, and
off-chain-computation-based - even though only time-based executes in W0, so that
19.x-22.x extend a union rather than reshaping it.

The definition type is a wire contract under `STABILITY.md`: worker manifests are
authored by third parties in 20.4 and must survive a minor.

#### Acceptance criteria

- [ ] `packages/worker-core` builds, typechecks and publishes in the workspace
      alongside the other six packages
- [ ] `WorkerDefinition` covers: id, operator, target contract id, function name,
      argument builder, trigger, network, and an optional fee-bump policy
- [ ] `Trigger` is a discriminated union over `time` | `event` | `computation`,
      with `event` and `computation` present as types and rejected at runtime with
      a clear "not implemented until W2" error
- [ ] `Schedule` supports interval and cron, with an explicit timezone field
- [ ] There is no field anywhere in the model that can carry a user's secret key
- [ ] `types.exhaustive.test-d.ts` proves the trigger union is exhaustively handled
- [ ] `README.md` opens with the §C.2 constraint, not with a feature list

#### Implementation notes

1. Mirror the package layout of `packages/abi-registry` - same tsconfig shape,
   same build scripts, same `files` allowlist.
2. Model the argument builder as a pure function of observed chain state so a
   worker's submission is reproducible from the ledger for 19.1's verification.
3. Do not add a signing-key field to `WorkerDefinition`. Signing belongs to the
   submitter (18.5) and is scoped to the operator's own account.
4. Add the package to the workspace typecheck matrix - `typecheck-packages` CI is
   skipped on docs-only pushes and will not catch a missing entry.

#### Affected files

- `packages/worker-core/package.json`
- `packages/worker-core/src/types.ts`
- `packages/worker-core/src/index.ts`
- `packages/worker-core/test/types.exhaustive.test-d.ts`
- `pnpm-workspace.yaml`
- `.github/workflows/ci.yml`

---

### 18.4 Time-based trigger evaluator

**Labels:** `type:feature` `area:workers`
**Milestone:** Phase 4 - Workers W0: first-party time-based
**Effort:** High
**Depends on:** 18.3

#### Description

The scheduler that decides when a time-based worker is due. Stellar has no native
scheduler and nothing on-chain self-executes (§C.1); this is the component that
fills the gap for the payroll-class case.

Correctness here is defined against ledger time, not wall-clock time. A worker
that fires because the host clock drifted has fired early, and the contract will
reject it - which looks like a miss in 19.1's dataset. Evaluate due-ness against
the latest ledger's close time.

#### Acceptance criteria

- [ ] Interval and cron schedules both resolve to a next-due ledger close time
- [ ] Due-ness is computed from ledger close time; host clock is used only for the
      poll cadence
- [ ] Timezone-aware cron produces correct results across a DST boundary, proven
      by a test
- [ ] A worker that was down for N missed windows fires **once** on restart, not N
      times - catch-up policy is explicit and configurable
- [ ] Evaluator is pure and unit-testable with an injected clock and ledger source
- [ ] Poll cadence is bounded so an idle fleet does not hammer RPC

#### Implementation notes

1. Take latest ledger close time from `SorobanRpcClient` rather than adding a
   second RPC dependency.
2. Catch-up default is `fire-once`; `fire-all` exists but must be opt-in per
   worker and documented as unsafe for anything with a per-window side effect.
3. Keep the evaluator free of submission concerns - it emits "due" decisions and
   nothing else, so 19.1 can replay it offline against historical ledgers.

#### Affected files

- `packages/worker-core/src/TriggerEvaluator.ts`
- `packages/worker-core/src/schedule.ts`
- `packages/worker-core/test/TriggerEvaluator.test.ts`

---

### 18.5 Transaction builder and submitter

**Labels:** `type:feature` `area:workers` `type:security`
**Milestone:** Phase 4 - Workers W0: first-party time-based
**Effort:** High
**Depends on:** 18.3

#### Description

Turns a due decision into a signed, submitted Soroban invocation, using
`SorobanRpcClient` from `pulse-core` rather than a second RPC layer.

The submitter signs with the **operator's own** account. It has no access to any
subscriber key, and the code must be shaped so that adding such access is an
obvious diff, not a quiet one.

#### Acceptance criteria

- [ ] Builds an `InvokeHostFunction` operation from a `WorkerDefinition` and
      simulates before submitting
- [ ] Resource fees come from simulation, with a bounded multiplier for ledger
      contention - never an unbounded fee
- [ ] Submission is confirmed by polling for the transaction result, not assumed
      from a successful send
- [ ] The signing interface accepts exactly one keypair - the operator's - and
      there is no code path that accepts a second signer
- [ ] Simulation failure is classified: contract rejected (expected, e.g. "not yet
      due") vs infrastructure failure (retryable)
- [ ] Secrets are read through the existing `secretPolicy` helper and never logged
- [ ] `assert-no-secrets-in-bundle.mjs` passes for the new package

#### Implementation notes

1. Reuse `packages/pulse-core/src/SorobanRpcClient.ts`; extend it if it lacks a
   submit path rather than forking a client.
2. Classify contract rejection separately from failure - a permissionless
   `disburse()` correctly rejecting an early call is a **success** of the design,
   and 19.1 must not score it as a miss.
3. Cap the fee multiplier and surface the cap in config. An uncapped fee on a
   congested ledger is how an operator drains its own XLM float.
4. Add `scripts/assert-no-secrets-in-bundle.mjs` coverage for `worker-core`.

#### Affected files

- `packages/worker-core/src/TxSubmitter.ts`
- `packages/worker-core/src/fees.ts`
- `packages/worker-core/test/TxSubmitter.test.ts`
- `packages/pulse-core/src/SorobanRpcClient.ts`
- `scripts/assert-no-secrets-in-bundle.mjs`

---

### 18.6 Fire-once idempotency per worker window

**Labels:** `type:feature` `area:workers` `priority:critical`
**Milestone:** Phase 4 - Workers W0: first-party time-based
**Effort:** High
**Depends on:** 18.4, 18.5

#### Description

A worker must fire at most once per `(workerId, window)`. Without this, a
restart, a duplicated process, or a slow confirmation turns one payroll run into
two - and a double disbursement is the exact failure mode that makes a
reliability business look like a custody incident even when no key was shared.

`pulse-core` already has `dedupe.ts`; reuse its shape so operators debug one
concept, not two.

#### Acceptance criteria

- [ ] Fire key is `(workerId, windowStartLedger)` and is claimed before submission,
      not after
- [ ] Two concurrent worker processes on the same definition produce exactly one
      submission, proven by a concurrency test
- [ ] A crash between claim and confirmation is recoverable: on restart the claim
      is re-checked against chain state before re-submitting
- [ ] Claims expire so a permanently dead process does not wedge a worker forever
- [ ] Idempotency survives the process restart in an integration test with the
      Postgres store

#### Implementation notes

1. Claim-then-submit, never submit-then-record.
2. Recovery checks the chain, not the local store: query whether the target
   function already executed in the window before re-submitting.
3. Reuse the interface style of `packages/pulse-core/src/dedupe.ts`.
4. The expiry must exceed the worst-case confirmation time by a wide margin;
   document the number and how it was chosen.

#### Affected files

- `packages/worker-core/src/idempotency.ts`
- `packages/worker-core/test/idempotency.test.ts`
- `packages/worker-core/test/idempotency.concurrency.test.ts`

---

### 18.7 Durable worker state store

**Labels:** `type:feature` `area:workers`
**Milestone:** Phase 4 - Workers W0: first-party time-based
**Effort:** High
**Depends on:** 18.3

#### Description

Persistence for worker registration, last-fired window, claim records and fire
history. Follow the cursor-store pattern already established in `pulse-core`:
one interface, memory/file/Postgres/Redis implementations, decorators for
caching.

The state format is a data contract under `STABILITY.md` - an operator upgrading
a minor must not lose their fire history, because that history is the input to
their reputation score in 19.3.

#### Acceptance criteria

- [ ] `WorkerStateStore` interface with Memory, File, Postgres and Redis backends
- [ ] The same conformance test suite runs against all four backends
- [ ] Postgres backend ships a migration and is safe to run concurrently from
      multiple processes
- [ ] State schema is versioned with a documented migration path
- [ ] Fire history is append-only - a worker cannot rewrite its own record
- [ ] Interface mirrors `CursorStore` naming so the two are learnable together

#### Implementation notes

1. Copy the structure of `packages/pulse-core/src/CursorStore.ts` and its
   implementations; do not invent a second persistence idiom.
2. Append-only matters for 19.x: if operators can rewrite history, chain-derived
   verification is the only trustworthy source and the local store is decoration.
3. Reuse `migrateCursors.ts` as the model for the version-migration helper.

#### Affected files

- `packages/worker-core/src/WorkerStateStore.ts`
- `packages/worker-core/src/MemoryWorkerStateStore.ts`
- `packages/worker-core/src/FileWorkerStateStore.ts`
- `packages/worker-core/src/PostgresWorkerStateStore.ts`
- `packages/worker-core/src/RedisWorkerStateStore.ts`
- `packages/worker-core/test/stateStore.conformance.test.ts`

---

### 18.8 Retry, backoff and dead-letter on submission failure

**Labels:** `type:feature` `area:workers` `area:pulse-webhooks`
**Milestone:** Phase 4 - Workers W0: first-party time-based
**Effort:** Medium
**Depends on:** 18.5, 18.7

#### Description

Infrastructure failures - RPC timeout, ledger contention, insufficient fee - must
retry with backoff. Contract rejections must not. Exhausted retries land in a
dead-letter store an operator can inspect, exactly as `pulse-webhooks` does for
undeliverable webhooks.

#### Acceptance criteria

- [ ] Retryable and terminal failures are separated using 18.5's classification
- [ ] Backoff reuses `packages/pulse-core/src/backoff.ts`, not a new curve
- [ ] Retries stop at the window boundary - a payroll run for August never lands in
      September because a retry chain outlived its window
- [ ] Exhausted attempts write to a `WorkerDeadLetterStore` with the full failure
      chain
- [ ] Dead-lettered fires appear as misses in 19.1, not as silence
- [ ] Retry state survives process restart

#### Implementation notes

1. Reuse `packages/pulse-webhooks/src/RetryQueue.ts` and `DeadLetterStore.ts`
   shapes; if the abstraction generalizes cleanly, lift it rather than copy it -
   but do not destabilize the webhook wire contract to do so.
2. The window-boundary stop is the important rule here. Encode it in the retry
   policy, not in operator documentation.

#### Affected files

- `packages/worker-core/src/retry.ts`
- `packages/worker-core/src/WorkerDeadLetterStore.ts`
- `packages/worker-core/test/retry.test.ts`
- `packages/pulse-core/src/backoff.ts`

---

### 18.9 Fee-bump paymaster: front gas, never hold assets

**Labels:** `type:feature` `area:workers` `type:security` `needs-design`
**Milestone:** Phase 4 - Workers W0: first-party time-based
**Effort:** High
**Depends on:** 18.5

#### Description

A worker may front the network fee on a user's behalf using Stellar's native
fee-bump transactions (§C.1, §C.2 rule 2). The paymaster wraps a user-signed
inner transaction in a fee-bump the operator signs and pays for.

This is the highest-risk component in W0 because it is the one place a worker
touches a transaction a user signed. The rule is absolute: the operator pays XLM
from its own account and gains no authority over anything inside the inner
transaction.

#### Acceptance criteria

- [ ] Fee-bump construction uses the native `FeeBumpTransaction` envelope
- [ ] The inner transaction's signatures are preserved untouched; a test asserts
      the inner envelope is byte-identical before and after wrapping
- [ ] The paymaster refuses to wrap an inner transaction whose source account is
      the operator's own account
- [ ] A policy layer bounds what the paymaster will sponsor: per-user rate limit,
      max fee per bump, daily XLM ceiling
- [ ] Exceeding the XLM float raises a distinct, alertable error rather than
      silently dropping bumps
- [ ] The security model is written down in `docs/design/` and reviewed before
      merge - `needs-design` does not clear on implementation alone

#### Implementation notes

1. Read §C.2 rule 2 before writing code. If the design ever needs the user's
   signing key, stop - that is the design bug the PRD warns about.
2. The sponsorship policy is a spend-control problem: an unbounded paymaster is a
   free XLM faucet for anyone who can construct an inner transaction.
3. Float exhaustion must be loud. A quiet paymaster failure looks identical to a
   worker miss from the outside and will corrupt 19.3's reputation data.

#### Affected files

- `packages/worker-core/src/Paymaster.ts`
- `packages/worker-core/src/sponsorshipPolicy.ts`
- `packages/worker-core/test/Paymaster.test.ts`
- `docs/design/worker-paymaster.md`

---

### 18.10 Reference payroll contract with a permissionless disburse()

**Labels:** `type:feature` `area:contracts` `area:workers` `priority:critical`
**Milestone:** Phase 4 - Workers W0: first-party time-based
**Effort:** High
**Depends on:** 18.1

#### Description

The canonical example of §C.2 rule 1, and the target 18.4-18.8 fire against in
tests. A payroll contract where `disburse()` is callable by anyone: it checks
"30 days elapsed, balance sufficient, recipients configured" and does not care
who called it. Funds can only go where the contract already specifies.

This contract is the argument. If every Orbital worker vanished tomorrow, payroll
runs late and nothing is stolen - that property is what separates this from a
custody product, and it needs to exist as running code, not prose.

#### Acceptance criteria

- [ ] `contracts/payroll` with `configure()`, `fund()`, `disburse()`, `withdraw()`
- [ ] `disburse()` requires no caller auth and enforces elapsed-time, balance and
      recipient-set invariants internally
- [ ] `disburse()` called early reverts with a typed error the submitter can
      classify as "rejected, not failed"
- [ ] `withdraw()` returns funds only to the configured owner - no path lets a
      caller redirect funds
- [ ] Emits a `disbursed` event carrying the window identifier, so 19.1 can verify
      the fire from the chain alone
- [ ] Event schema registered in the ABI registry and resolvable through
      `AbiRegistryClient`
- [ ] Unit tests cover: early call, insufficient balance, double-call in one
      window, and a call from an arbitrary address succeeding when due
- [ ] Deployed to testnet with the contract id recorded in
      `contracts/deployed.testnet.json`

#### Implementation notes

1. Follow the layout of `contracts/registry` - same `src/lib.rs` + `src/test.rs`
   split, same toolchain pin.
2. The window identifier in the event is what makes verification cheap in 19.1.
   Emitting a bare "disbursed" with no window forces a reconstruction nobody wants
   to maintain.
3. Register the event schema in the same PR (`ROADMAP.md` rule: the checkbox flips
   in the PR that ships the thing).
4. Deployment needs `SOROBAN_INVOKER_SECRET`; coordinate with the maintainer-only
   secrets work rather than committing anything.

#### Affected files

- `contracts/payroll/src/lib.rs`
- `contracts/payroll/src/test.rs`
- `contracts/Cargo.toml`
- `contracts/deployed.testnet.json`
- `contracts/README.md`
- `packages/abi-registry/specs/well-known/`

---

### 18.11 Webhook notification on worker fire and miss

**Labels:** `type:feature` `area:workers` `area:pulse-webhooks`
**Milestone:** Phase 4 - Workers W0: first-party time-based
**Effort:** Medium
**Depends on:** 18.5, 18.8

#### Description

Subscribers get a real-time webhook when their worker fires (§C.4). This is one
of the three things Orbital already has that a worker layer needs (§C.3) - the
delivery path is `pulse-webhooks`, already built with HMAC signing, retry queues,
dead-lettering and SSRF guards.

Misses are notified too. A worker layer that only reports success is a worker
layer whose users find out about failures from their accounting department.

#### Acceptance criteria

- [ ] `worker.fired` and `worker.missed` event payloads defined and versioned as
      wire contracts under `STABILITY.md`
- [ ] Payloads carry worker id, window, transaction hash (on fire), ledger, and
      the failure chain (on miss)
- [ ] Delivery goes through the existing `pulse-webhooks` signing and retry path -
      no second delivery mechanism
- [ ] Existing SSRF and private-IP guards apply to worker webhook targets
- [ ] A miss notification fires once per window, not once per retry attempt
- [ ] Recipes for both events added to `docs/COOKBOOK.md`

#### Implementation notes

1. Reuse `packages/pulse-webhooks/src/signing.ts` and the existing retry queue -
   do not add a delivery path that bypasses the SSRF guards in
   `private-ip.ts` / `url-validator.ts`.
2. Version the payloads from day one. These become third-party integrations the
   moment 20.5 ships subscriptions.
3. The once-per-window rule for misses depends on 18.6's fire key; reuse it rather
   than deriving a second notion of "window".

#### Affected files

- `packages/worker-core/src/notify.ts`
- `packages/worker-core/src/events.ts`
- `packages/pulse-webhooks/src/types.ts`
- `docs/COOKBOOK.md`
- `STABILITY.md`

---

### 18.12 orbital worker CLI

**Labels:** `type:dx` `area:workers`
**Milestone:** Phase 4 - Workers W0: first-party time-based
**Effort:** Medium
**Depends on:** 18.4, 18.5, 18.7

#### Description

`orbital worker` - register, list, inspect, dry-run and run workers from the
command line. Dry-run is the important verb: it simulates the invocation against
the current ledger and prints what would be submitted, without submitting.

Note the existing packaging hazard: `bin/orbital` was found broken in the
2026-07 docs cleanup. Verify the bin entry actually resolves from a clean
`npm install` before closing this.

#### Acceptance criteria

- [ ] `orbital worker register|list|inspect|dry-run|run` all implemented
- [ ] `dry-run` simulates and prints the built transaction, resource fee, and the
      contract's simulated response - and submits nothing
- [ ] `run` executes the scheduler loop in the foreground with structured logs
- [ ] The bin entry resolves from a clean install of the published tarball, proven
      by a packaging test
- [ ] `--help` output for every subcommand is covered by a test so it cannot rot
- [ ] No subcommand accepts a secret as an argv value - env or file only

#### Implementation notes

1. Match the CLI conventions in `packages/abi-registry/src/cli/` and
   `packages/pulse-webhooks/src/cli.ts`.
2. Argv secrets leak into shell history and process listings. Env or file only,
   enforced by `secretPolicy`.
3. Add the packaging test to CI - a broken `bin` entry is invisible to unit tests
   and was a real regression in this repo before.

#### Affected files

- `packages/worker-core/src/cli/`
- `packages/worker-core/bin/orbital-worker`
- `packages/worker-core/package.json`
- `packages/worker-core/test/cli.test.ts`

---

### 18.13 Worker design doc: trigger is not custodian

**Labels:** `type:docs` `area:workers` `priority:critical`
**Milestone:** Phase 4 - Workers W0: first-party time-based
**Effort:** Medium
**Depends on:** 18.1

#### Description

The written statement of §C.2 as an architecture decision record, so the
constraint survives the PRD, survives contributor turnover, and can be cited in
review without a link to a file in someone's Downloads folder.

It must also record the bootstrap position honestly (§C.5): Orbital runs its own
workers first, for a bounded first-party tier, with a real intent to diversify -
because a single operator concentrates blast radius, and many independent
operators turn one outage into many contained incidents.

#### Acceptance criteria

- [ ] `docs/design/workers.md` states the four §C.2 rules in precedence order
- [ ] Documents the "worker needs signing authority ⇒ design bug" review rule
- [ ] Documents the fixed build order W0 → W4 and why risk, not convenience, sets
      it
- [ ] Records the first-party bootstrap and the diversification rationale
- [ ] States the frozen non-goals for this layer: no staking, no slashing, no
      bonding pools, no economic-security adjudication
- [ ] Records that CAP-0066 obsoletes the TTL-keeper use case, so nobody proposes
      it again
- [ ] Records the honest correction on P23: workers are application-layer and
      cannot repair core ledger state - parallel monitoring is a canary, not a cure
- [ ] Linked from `docs/ARCHITECTURE.md` and from `packages/worker-core/README.md`

#### Implementation notes

1. Write the P23 correction plainly. The tempting version of this claim is
   attractive to funders and false; the doc exists partly to stop it being made.
2. Keep the competitive notes (§C.8) in `docs/design/prior-art-workers.md` rather
   than in the architecture doc - they date fast and are self-reported, not
   audited.

#### Affected files

- `docs/design/workers.md`
- `docs/design/prior-art-workers.md`
- `docs/ARCHITECTURE.md`
- `packages/worker-core/README.md`

---

## Major 19 - W1: verification and reputation from chain data

### 19.1 Chain-derived verification engine

**Labels:** `type:feature` `area:workers` `area:pulse-core` `needs-design`
**Milestone:** Phase 4 - Workers W1: verification and reputation
**Effort:** High
**Depends on:** 18.10, 18.11

#### Description

The structural advantage (§C.3, §C.6): because Orbital decodes and normalizes the
same events, it can verify from the chain itself whether a worker fired when it
should have - rather than trusting the worker's self-reported logs. No
competitor's marketplace has this, and it is the one component that cannot be
copied without also building the event layer underneath it.

The model: expected condition observed at ledger N → expected follow-up
invocation by ledger N+k → did it occur? Everything in W1 and W3 is derived from
this one dataset.

#### Acceptance criteria

- [ ] Engine consumes normalized events through `EventEngine` - it does not open a
      parallel ingestion path
- [ ] Given a `WorkerDefinition` and a ledger range, produces a verdict per window:
      `fired` | `missed` | `late` | `not-due`
- [ ] `late` is a distinct verdict with a measured latency in ledgers, because W3's
      pricing tiers depend on the distinction
- [ ] A contract rejection of an early call resolves to `not-due`, never `missed`
- [ ] Verdicts are reproducible: the same ledger range yields identical verdicts on
      a re-run, proven by a replay test
- [ ] Verification never reads operator-supplied logs - a test asserts the engine
      compiles with no operator input beyond the definition
- [ ] Works for all three trigger classes' conditions, even though only time-based
      has an executor in W0

#### Implementation notes

1. Plug into `packages/pulse-core/src/EventEngine.ts` rather than adding a source
   path beside it - the CAP-67 issues already own that surface (#920, #921).
2. Reproducibility is the whole product. If a verdict depends on when it was
   computed, it cannot underwrite anything in W3 and cannot be disputed by an
   operator without a support conversation.
3. The `not-due` case is where naive implementations generate false misses and
   destroy operator trust in the score. Test it first.
4. Get the verdict taxonomy reviewed before implementing - `needs-design` clears
   on the taxonomy, not on the code.

#### Affected files

- `packages/worker-core/src/verification/VerificationEngine.ts`
- `packages/worker-core/src/verification/verdict.ts`
- `packages/worker-core/test/verification/engine.test.ts`
- `packages/worker-core/test/verification/replay.test.ts`

---

### 19.2 Verdict store and wire schema

**Labels:** `type:feature` `area:workers`
**Milestone:** Phase 4 - Workers W1: verification and reputation
**Effort:** Medium
**Depends on:** 19.1

#### Description

Persist verdicts so scores, scorecards and backstop decisions read from one
place. The verdict JSON is a wire contract under `STABILITY.md`: it is what an
operator disputes, what a subscriber audits, and in W3 what a backstop claim is
assessed against. Breaking it requires a major.

`abi-registry` already has a `verdictStore.ts` for schema verification. Decide
explicitly whether to extend it or add a sibling, and record the decision.

#### Acceptance criteria

- [ ] Verdict schema versioned and documented in `STABILITY.md`
- [ ] Store interface with Memory and Postgres backends, conformance-tested
- [ ] Verdicts are immutable once written; corrections append a superseding record
      with a reason, never mutate
- [ ] Every verdict records the ledger range and engine version that produced it
- [ ] Query by worker, by operator, and by ledger range, all indexed
- [ ] Relationship to `packages/abi-registry/src/verdictStore.ts` decided and
      documented in the PR body

#### Implementation notes

1. Immutability plus an engine-version stamp is what makes a dispute tractable: a
   changed verdict is explainable as an engine change rather than as tampering.
2. Index for the range queries the scorecards need before the table has data -
   retrofitting indexes onto a live verdict table is avoidable pain.

#### Affected files

- `packages/worker-core/src/verification/VerdictStore.ts`
- `packages/worker-core/src/verification/PostgresVerdictStore.ts`
- `packages/worker-core/test/verification/verdictStore.conformance.test.ts`
- `STABILITY.md`

---

### 19.3 Operator reputation scoring

**Labels:** `type:feature` `area:workers` `needs-design`
**Milestone:** Phase 4 - Workers W1: verification and reputation
**Effort:** High
**Depends on:** 19.2

#### Description

Uptime, latency and miss-rate per operator, computed from verdicts (§C.6).
Objective and chain-derived, tamper-resistant because it never depends on
operator self-reporting.

Scoring is a judgment surface, not just arithmetic: the windowing, the weighting
of a recent miss against an old one, and how a new operator with no history is
represented all change operator behaviour. Get the formula reviewed before it
ships, because changing it later moves everyone's score at once.

#### Acceptance criteria

- [ ] Uptime, p50/p95 latency and miss-rate computed per operator over a
      configurable window
- [ ] New operators show "insufficient data", not a default score that reads as
      either an endorsement or a penalty
- [ ] The formula is documented in prose next to the code, with worked examples
- [ ] Scores are recomputable from stored verdicts alone - no incremental state
      that can drift
- [ ] A score change is attributable: a drop links to the verdicts that caused it
- [ ] Formula version is stamped on every score, so a recomputation under a new
      formula is distinguishable from a performance change

#### Implementation notes

1. Recomputability over incremental accumulation. An incrementally-maintained
   score that drifts from its inputs cannot be defended in a dispute.
2. Attribution is a product feature, not a debug aid - "your score fell because of
   these three windows" is the difference between a usable marketplace signal and
   an opaque number operators resent.
3. Do not add staking, slashing or bonding to make scores "binding" (§C.4). The
   score is information; the economics stay out.

#### Affected files

- `packages/worker-core/src/reputation/score.ts`
- `packages/worker-core/src/reputation/window.ts`
- `packages/worker-core/test/reputation/score.test.ts`
- `docs/design/worker-reputation.md`

---

### 19.4 Verification read API

**Labels:** `type:feature` `area:apps-web` `area:workers`
**Milestone:** Phase 4 - Workers W1: verification and reputation
**Effort:** High
**Depends on:** 19.2, 19.3

#### Description

Public read endpoints for verdicts and scores, alongside the hosted registry read
API (#915). This is the audit trail: a subscriber checks whether their worker
fired without asking the operator, and without running an indexer.

Reuse whatever #915 lands for rate limiting, auth and caching. A second,
divergent API surface on the same app is how an operated service becomes
expensive to run.

#### Acceptance criteria

- [ ] `GET` endpoints for verdicts by worker and by ledger range, and for operator
      scores
- [ ] Responses carry the verdict schema version and engine/formula versions
- [ ] Rate limiting and abuse controls reuse the mechanism from #918 rather than
      adding a second limiter
- [ ] Cache headers set so a scorecard page does not recompute per view
- [ ] OpenAPI description published and checked in CI against the implementation
- [ ] Endpoints are read-only - there is no route through which an operator can
      write a verdict

#### Implementation notes

1. Land after #915 and #918 or the limiter work gets duplicated; if scheduling
   forces overlap, take a dependency on their middleware rather than copying it.
2. Read-only is a security property here, not a simplification. A write path into
   the verdict store defeats the tamper-resistance the whole layer sells.

#### Affected files

- `apps/web/app/api/workers/verdicts/route.ts`
- `apps/web/app/api/workers/operators/route.ts`
- `apps/web/openapi/`
- `docs/api/workers.md`

---

### 19.5 Operator scorecards in apps/web

**Labels:** `type:feature` `area:apps-web` `area:workers`
**Milestone:** Phase 4 - Workers W1: verification and reputation
**Effort:** High
**Depends on:** 19.4

#### Description

The public face of W1: per-operator pages showing uptime, latency distribution,
miss-rate and recent verdict history, next to the registry explorer (#913).

A subscriber choosing between operators, and an operator proving reliability to a
prospect, both land here. Design for the second case too - an operator who wants
to link to their scorecard is doing marketplace acquisition for free.

#### Acceptance criteria

- [ ] Operator index page ranked by score, with "insufficient data" operators
      clearly separated rather than sorted last
- [ ] Per-operator page: uptime, p50/p95 latency, miss-rate, recent verdicts with
      links to the transactions on stellar.expert
- [ ] Every number links to the verdicts that produced it
- [ ] Empty and insufficient-data states designed, not defaulted
- [ ] Accessible: keyboard navigation, sufficient contrast in both themes, charts
      readable without colour alone
- [ ] Shares layout and navigation with the registry explorer (#913)

#### Implementation notes

1. Follow the explorer's page structure from #913 rather than inventing a second
   information architecture in the same app.
2. Colour-only encoding of a miss-rate chart fails for a meaningful slice of
   users; encode with shape or label as well.
3. Link out to stellar.expert for the transaction rather than building a
   transaction viewer.

#### Affected files

- `apps/web/app/workers/page.tsx`
- `apps/web/app/workers/[operator]/page.tsx`
- `apps/web/components/workers/`

---

### 19.6 Verification backfill over CDP and Galexie exports

**Labels:** `type:feature` `area:workers` `area:pulse-core` `needs-design`
**Milestone:** Phase 4 - Workers W1: verification and reputation
**Effort:** High
**Depends on:** 19.1

#### Description

RPC retains roughly seven days. A reputation score computed over a seven-day
window is a weather report, not a track record. Backfill verdicts from
Composable Data Platform / Galexie exports plus CAP-67, per §B.5 - built on
exports, **never** as an Orbital-operated ledger store.

This shares its substrate with #920 (long-range replay). Coordinate: one export
reader, two consumers.

#### Acceptance criteria

- [ ] Verdicts can be computed over a historical ledger range from exports without
      an RPC dependency
- [ ] Backfilled verdicts are marked as such and are byte-identical to live-computed
      verdicts for any overlapping range
- [ ] Orbital operates no ledger store of its own - the PR body states where the
      data is read from and confirms it is not a re-hosted chain
- [ ] Reuses the export reader from #920 rather than adding a second one
- [ ] Backfill is resumable and idempotent over a partially processed range
- [ ] Documented cost model - export scanning is not free and the score window
      length is a spend decision

#### Implementation notes

1. Land after or with #920; if #920 has not started, build the reader there and
   consume it here.
2. Byte-identical overlap is the test that proves the backfill and live paths do
   not silently disagree. Without it, an operator's score changes depending on
   when it was computed.
3. The "never an Orbital-operated ledger store" rule is a stated architectural
   constraint (§B.5). Re-hosting the chain is a different, much larger business.

#### Affected files

- `packages/worker-core/src/verification/backfill.ts`
- `packages/pulse-core/src/cap67/`
- `packages/worker-core/test/verification/backfill.test.ts`
- `docs/design/worker-verification-backfill.md`

---

## Major 20 - W2: external operator registration

### 20.1 Worker registry data model

**Labels:** `type:feature` `area:workers` `area:abi-registry` `needs-design`
**Milestone:** Phase 4 - Workers W2: external operators
**Effort:** High
**Depends on:** 18.3, 19.3

#### Description

The registry leg of §C.4: who offers worker services, which trigger types, on
what terms. Orbital is the registry, standard and verification layer - not the
guarantor of anyone's execution, and the data model should make that obvious to
anyone reading it.

Extend the `abi-registry` data model rather than starting a second registry
concept. One registry, two record kinds.

#### Acceptance criteria

- [ ] `OperatorRecord`: identity, contact, supported trigger classes, networks,
      terms, and a self-declared latency tier
- [ ] `WorkerOfferingRecord`: target contract, function, trigger class, price,
      and the operator that offers it
- [ ] Terms are structured data, not a prose blob, so they are comparable across
      operators
- [ ] No field asserts or implies an Orbital guarantee of execution
- [ ] JSON schemas published alongside the existing registry schemas
- [ ] Records are versioned; a terms change produces a new version rather than
      rewriting history
- [ ] Reuses `abi-registry` resolution and caching (`LruCache`, `TtlLruCache`)

#### Implementation notes

1. Follow the shape of the existing spec records in
   `packages/abi-registry/src/types.ts` and their schema directory layout.
2. Versioned terms matter for disputes: a subscriber signed up under the terms as
   they stood, and that version must remain resolvable.
3. Keep this data MIT-licensed open data, consistent with
   `docs/open-source-policy.md` and `data/LICENSE`.

#### Affected files

- `packages/abi-registry/src/types.ts`
- `packages/abi-registry/schema/operator.schema.json`
- `packages/abi-registry/schema/worker-offering.schema.json`
- `packages/worker-core/src/registry/`
- `docs/design/worker-registry.md`

---

### 20.2 On-chain worker registry

**Labels:** `type:feature` `area:contracts` `area:workers`
**Milestone:** Phase 4 - Workers W2: external operators
**Effort:** High
**Depends on:** 20.1

#### Description

Operator and offering records published on chain, so the marketplace's directory
is not a database only Orbital can read. Extend `contracts/registry` rather than
deploying a second registry contract, unless the storage shapes genuinely
conflict - in which case say why in the PR body.

Note the known defect first: #1025 reports that registry specs expire roughly 30
days after their last write. Publishing operator records into a store with the
same TTL behaviour reproduces that bug at marketplace scale.

#### Acceptance criteria

- [ ] Operator and offering records publishable on chain with publisher auth
- [ ] The TTL/archival behaviour in #1025 is resolved or explicitly avoided for
      these records; the PR body states which
- [ ] Per-version lookup, matching the existing spec lookup semantics
- [ ] Emits a `worker_registered` event, decodable through the existing pipeline
- [ ] Only the operator's own key can modify that operator's record
- [ ] Unit tests cover unauthorized modification, version lookup, and re-registration
- [ ] Deployed to testnet with ids recorded in `contracts/deployed.testnet.json`

#### Implementation notes

1. Read #1025 before choosing a storage type. Under CAP-0066 persistent and
   instance entries auto-restore on access at a fee, but temporary storage still
   deletes permanently - that distinction decides this design.
2. Reuse `OnChainRegistryPublisher` for the write path.
3. Extending the existing contract keeps one deployment, one publisher auth model
   and one set of secrets to manage.

#### Affected files

- `contracts/registry/src/lib.rs`
- `contracts/registry/src/test.rs`
- `packages/abi-registry/src/OnChainRegistryPublisher.ts`
- `contracts/deployed.testnet.json`

---

### 20.3 Operator onboarding and review flow

**Labels:** `type:feature` `area:apps-web` `area:workers`
**Milestone:** Phase 4 - Workers W2: external operators
**Effort:** High
**Depends on:** 20.1

#### Description

How an external operator gets into the registry. Mirror the semantic-layer
submission flow (#911 closed, Wave 2.3) rather than inventing a second review
pipeline: submission, automated validation, human review, publication.

Review here checks that a submission is well-formed and that the operator
controls the key they claim. It is explicitly **not** an endorsement of their
reliability - that is what W1's scores are for, and the copy must not blur the
two.

#### Acceptance criteria

- [ ] Submission path documented and reachable from `apps/web`
- [ ] Automated validation: schema-valid, key ownership proven by a signature,
      target contracts resolve in the registry
- [ ] Human review step with a documented, published rubric
- [ ] Rejections carry a reason the submitter can act on
- [ ] Published copy states plainly that listing is not an endorsement of
      reliability
- [ ] Reuses the validation automation from #911 where the shapes match

#### Implementation notes

1. Key-ownership proof is the one check that must not be skipped: without it,
   anyone can register an offering under someone else's identity and harvest
   their reputation.
2. Follow `docs/semantic-layer/submitting.md` for structure so contributors meet
   one submission idiom across the project.

#### Affected files

- `apps/web/app/workers/register/page.tsx`
- `scripts/validate-operator-submission.mjs`
- `docs/workers/submitting.md`
- `.github/ISSUE_TEMPLATE/`

---

### 20.4 Worker manifest standard and validator

**Labels:** `type:feature` `area:workers` `type:dx`
**Milestone:** Phase 4 - Workers W2: external operators
**Effort:** Medium
**Depends on:** 20.1

#### Description

The standard leg of §C.4: the contract and event schema workers implement
against. A `worker.manifest.json` any operator's implementation can emit and any
consumer can validate - including implementations that never use
`@orbital-stellar/worker-core`.

The standard is the durable asset. Code is forkable; a format other tools emit
against is not, and this is the same argument that makes the SEP the highest
leverage item on the main roadmap (§B.2).

#### Acceptance criteria

- [ ] `worker.manifest.json` schema published with a stable `$id`
- [ ] Manifest expresses: trigger class and parameters, target contract and
      function, expected latency bound, and the emitted fire event
- [ ] A standalone validator runs with no Orbital runtime dependency
- [ ] `worker-core` emits a conformant manifest for any `WorkerDefinition`
- [ ] The verification engine (19.1) can score a worker from its manifest alone,
      with no operator cooperation
- [ ] Versioned with a documented compatibility policy
- [ ] Reference documentation with at least two worked examples

#### Implementation notes

1. Design so a competitor can implement the standard without Orbital's code. That
   is the point - adoption of the format is the moat, not adoption of the package.
2. The latency bound is what makes W3's tier pricing expressible; without it,
   "late" has no contractual meaning.
3. Keep the schema in the same directory idiom as the registry schemas so tooling
   discovers both.

#### Affected files

- `packages/worker-core/schema/worker.manifest.json`
- `packages/worker-core/src/manifest.ts`
- `packages/worker-core/test/manifest.test.ts`
- `docs/workers/manifest.md`

---

### 20.5 Subscription model and subscriber webhooks

**Labels:** `type:feature` `area:workers` `area:pulse-webhooks`
**Milestone:** Phase 4 - Workers W2: external operators
**Effort:** High
**Depends on:** 18.11, 20.1

#### Description

A subscriber subscribes to an offering and receives notifications when their
worker fires or misses (§C.4, notification leg). This is the record that later
tells W3 what is backstopped and at which tier.

The subscription record must contain nothing that grants anyone authority over
the subscriber's funds. It is a notification and billing relationship.

#### Acceptance criteria

- [ ] `SubscriptionRecord`: subscriber, offering, webhook target, tier, status
- [ ] Lifecycle implemented: create, pause, resume, cancel - with an audit trail
- [ ] Webhook targets pass the existing SSRF and private-IP validation
- [ ] Delivery reuses the `pulse-webhooks` signing and retry path
- [ ] A subscription carries no key, no allowance, and no authority over subscriber
      funds; a test asserts the record type has no such field
- [ ] Cancellation takes effect within one window and is auditable
- [ ] Subscription state is queryable by the subscriber through 19.4's API

#### Implementation notes

1. Reuse `packages/pulse-webhooks/src/url-validator.ts` and `private-ip.ts` -
   subscriber-supplied URLs are the classic SSRF vector and the guards exist.
2. The "no authority" assertion should be a type-level test, not a comment. It is
   the one property a future contributor is most likely to erode by convenience.

#### Affected files

- `packages/worker-core/src/subscription/`
- `packages/worker-core/test/subscription/noAuthority.test-d.ts`
- `apps/web/app/api/workers/subscriptions/route.ts`

---

### 20.6 Event-based trigger class

**Labels:** `type:feature` `area:workers` `area:pulse-core`
**Milestone:** Phase 4 - Workers W2: external operators
**Effort:** High
**Depends on:** 18.5, 18.6, 19.1

#### Description

Second trigger class from §C.1: run on an on-chain occurrence. Deterministic
event triggers ship in W2 per the risk-ordered build order; anything trade-signal
shaped waits for W4 and the vault pattern.

The condition is a predicate over normalized events, which is precisely what
`pulse-core` already produces - `contractFilters`, `eventTypeGuard` and
`eventAddressNarrow` are the matching primitives.

#### Acceptance criteria

- [ ] Trigger condition expressed as a predicate over `NormalizedEvent`, reusing
      the existing filter and guard helpers
- [ ] Deterministic: the same ledger range always produces the same fire decisions,
      proven by a replay test
- [ ] Reorg and re-delivery safe - a duplicated source event does not double-fire,
      via 18.6's idempotency
- [ ] Fires within a bounded number of ledgers of the triggering event, and the
      bound is declared in the manifest
- [ ] Verification (19.1) scores event triggers with no new code path
- [ ] Trade-signal conditions are rejected at registration with a pointer to W4 and
      the vault pattern

#### Implementation notes

1. Build the predicate on `contractFilters.ts`, `eventTypeGuard.ts` and
   `eventAddressNarrow.ts` rather than a new matching language.
2. Determinism is what makes 19.1 able to say "should have fired". A predicate
   that reads mutable off-chain state is not verifiable and belongs in 20.7.
3. The registration-time rejection is a real gate, not a warning. It is how the
   fixed build order is enforced against a well-meaning contributor.

#### Affected files

- `packages/worker-core/src/triggers/eventTrigger.ts`
- `packages/worker-core/src/triggers/predicate.ts`
- `packages/worker-core/test/triggers/eventTrigger.replay.test.ts`
- `packages/pulse-core/src/contractFilters.ts`

---

### 20.7 Off-chain-computation trigger class

**Labels:** `type:feature` `area:workers` `needs-design` `type:security`
**Milestone:** Phase 4 - Workers W2: external operators
**Effort:** High
**Depends on:** 20.6

#### Description

Third trigger class from §C.1: run when an external result lands - an oracle
resolves and settlement must execute, a model finishes an analysis and a position
must change.

This class is where verifiability gets hard, because the condition is not on
chain. The design must state what an off-chain condition means for 19.1's
verdicts: an unverifiable trigger is not a miss, and must not be scored as one.

Reflector Subscriptions already offers price-threshold triggers with webhook
notification (§C.8) and overlaps this use case. Position deliberately rather than
by accident.

#### Acceptance criteria

- [ ] Off-chain conditions are attested: the result carries a signature from a
      declared source, and the source is part of the manifest
- [ ] The attestation is submitted with, or referenced by, the invocation so the
      chain records why the worker fired
- [ ] Verification produces `unverifiable` rather than `missed` where the condition
      cannot be reconstructed from chain data
- [ ] `unverifiable` windows are excluded from reputation scores, not counted as
      successes
- [ ] Positioning against Reflector Subscriptions documented in the design note
- [ ] Security review covers a malicious or compromised computation source

#### Implementation notes

1. Decide the attestation model before writing code; `needs-design` clears on the
   design note.
2. Silently scoring unverifiable windows as successes turns the reputation score
   into a number operators can inflate by choosing unverifiable triggers.
3. Reuse `packages/abi-registry/src/attestation.ts` if its signature model fits
   rather than introducing a second attestation concept.

#### Affected files

- `packages/worker-core/src/triggers/computationTrigger.ts`
- `packages/worker-core/src/triggers/attestation.ts`
- `packages/worker-core/src/verification/verdict.ts`
- `docs/design/worker-offchain-triggers.md`

---

## Major 21 - W3: backstop for time-insensitive tiers

### 21.1 Backstop watcher: detect a miss and fire the fallback

**Labels:** `type:feature` `area:workers` `priority:critical`
**Milestone:** Phase 4 - Workers W3: backstop
**Effort:** High
**Depends on:** 19.1, 20.5

#### Description

The mechanism behind §C.7: if a registered external worker fails to fire, an
Orbital worker catches the miss and triggers the contract.

The economics to keep in view while building it: **the cost is readiness, not
payouts.** Catching a miss requires watching the same condition continuously, for
every backstopped subscription. Monitoring cost scales with subscriptions, not
with failures. Build it so that cost is measurable from day one (21.2).

W3 covers time-insensitive tiers only - payroll, periodic settlement, where a
fallback firing an hour late is a non-event.

#### Acceptance criteria

- [ ] Watches the same condition as the primary worker, using 19.1's engine
- [ ] Fires the fallback only after the primary's declared latency bound plus a
      configured grace period
- [ ] Fallback submission reuses 18.5 and 18.6 - the backstop cannot double-fire
      against a primary that fired late
- [ ] Every backstop fire is recorded as an intervention, linked to the missed
      window's verdict
- [ ] Subscriber is notified on intervention
- [ ] Registration refuses latency-sensitive tiers with a pointer to 22.4
- [ ] An integration test proves no double-fire when the primary fires inside the
      grace period

#### Implementation notes

1. The double-fire race is the central correctness problem. The backstop and the
   primary are two independent processes converging on one window; 18.6's claim
   protocol must cover both.
2. Grace period is per-subscription and derives from the manifest's latency bound
   (20.4), not from a global constant.
3. Refusing latency-sensitive registration here is what enforces "start with the
   cheap tier and earn your way to the expensive one" (§C.7).

#### Affected files

- `packages/worker-core/src/backstop/BackstopWatcher.ts`
- `packages/worker-core/src/backstop/intervention.ts`
- `packages/worker-core/test/backstop/noDoubleFire.test.ts`

---

### 21.2 Readiness cost metering

**Labels:** `type:feature` `area:workers` `type:ops`
**Milestone:** Phase 4 - Workers W3: backstop
**Effort:** Medium
**Depends on:** 21.1

#### Description

§C.7 is explicit: model the readiness cost before pricing, because it is not pure
margin. Monitoring cost scales with the number of backstopped subscriptions
regardless of how many ever need intervention.

Meter it: RPC calls, export scans, compute and storage attributable per
subscription per window. Without this, the pricing page in 21.3 is a guess and
the product's margin is discovered in a monthly bill.

#### Acceptance criteria

- [ ] Per-subscription cost attribution for RPC calls, export scans, compute time
      and storage
- [ ] Aggregated cost per subscription per window, queryable over time
- [ ] Marginal cost of one additional backstopped subscription reported explicitly
- [ ] Metrics exported through the existing Prometheus and OTel surfaces
- [ ] A dashboard or documented query showing cost against subscription count
- [ ] Written cost model in `docs/design/` with the measured numbers, not estimates

#### Implementation notes

1. Reuse the metrics interfaces in `packages/pulse-webhooks/src/metrics.ts`,
   `PrometheusWebhookMetrics.ts` and `OtelWebhookMetrics.ts` - one metrics idiom
   across the project.
2. Report marginal cost, not just total. Total cost hides the shape of the curve,
   and the shape is what decides whether the tier is viable at scale.
3. Shared monitoring across subscriptions watching the same condition is the main
   lever; measure before optimizing it.

#### Affected files

- `packages/worker-core/src/backstop/costMeter.ts`
- `packages/worker-core/src/metrics.ts`
- `docs/design/backstop-cost-model.md`

---

### 21.3 Latency-tier configuration, time-insensitive only

**Labels:** `type:feature` `area:workers`
**Milestone:** Phase 4 - Workers W3: backstop
**Effort:** Medium
**Depends on:** 21.1, 21.2

#### Description

§C.7 requires pricing by latency tier, not one flat fee. W3 implements the
time-insensitive tier and nothing else: payroll and periodic settlement, where a
fallback firing an hour late is a non-event and the guarantee is cheap to make
credibly.

Build the tier abstraction to hold the latency-sensitive tier that 22.4 adds, but
ship with only the cheap tier enabled - so the expensive promise cannot be made
before the infrastructure exists to keep it.

#### Acceptance criteria

- [ ] Tier definition includes latency bound, grace period, price and the
      conditions under which intervention is guaranteed
- [ ] Only the time-insensitive tier is registrable; latency-sensitive is defined
      but disabled behind an explicit flag
- [ ] Tier is attached to the subscription and versioned - a tier change is a new
      subscription version
- [ ] The guarantee's boundaries are stated in machine-readable form, not only in
      marketing copy
- [ ] Attempting to register a disabled tier fails with a message naming 22.4

#### Implementation notes

1. The flag is a safety device, not a feature toggle - document it as such so it
   is not flipped for a demo.
2. Machine-readable guarantee boundaries let 21.4's SLO monitoring assert against
   the same numbers a subscriber was sold.

#### Affected files

- `packages/worker-core/src/backstop/tiers.ts`
- `packages/worker-core/src/subscription/`
- `docs/workers/tiers.md`

---

### 21.4 Backstop SLO monitoring and alerting

**Labels:** `type:feature` `area:workers` `type:ops`
**Milestone:** Phase 4 - Workers W3: backstop
**Effort:** Medium
**Depends on:** 21.1, 21.3

#### Description

Orbital's own backstop must be measured by the same chain-derived standard it
measures everyone else by (§C.6). A backstop that misses is worse than no
backstop, because the subscriber stopped watching.

#### Acceptance criteria

- [ ] Orbital's backstop worker appears in the same verdict dataset as external
      operators, scored by the same engine
- [ ] SLO defined per tier and asserted against 21.3's machine-readable bounds
- [ ] Alerts fire on: missed intervention, XLM float below threshold, monitoring
      lag exceeding the grace period
- [ ] Alerting reuses `packages/abi-registry/src/alertManager.ts` rather than a
      second alerting path
- [ ] Backstop performance is published on the same scorecards as everyone else's
- [ ] Runbook for each alert

#### Implementation notes

1. Publishing Orbital's own score is a credibility asset and a discipline device.
   Exempting the first-party operator from the dataset would undermine the neutral
   framing in §C.4.
2. Monitoring lag is the leading indicator - by the time an intervention is missed,
   the subscriber is already affected.

#### Affected files

- `packages/worker-core/src/backstop/slo.ts`
- `packages/abi-registry/src/alertManager.ts`
- `docs/runbooks/backstop.md`

---

### 21.5 Regulatory framing for the backstop

**Labels:** `type:docs` `maintainer-only` `needs-design` `priority:critical`
**Milestone:** Phase 4 - Workers W3: backstop
**Effort:** Medium
**Depends on:** 21.3

#### Description

§C.7 flags this directly: charging a fee explicitly priced against another
party's failure sits near insurance regulation in some jurisdictions, and
regulated-money customers' compliance teams will ask. Nexus Mutual's
"discretionary cover / mutual" framing is prior art worth understanding **before**
pricing pages are written.

This issue is the written position, and it must land before 21.6 and before any
public pricing copy. Getting the order wrong means rewriting customer-facing
commitments under time pressure.

#### Acceptance criteria

- [ ] Written position on how the backstop is characterized and why
- [ ] Nexus Mutual's discretionary-cover framing summarized, with what does and
      does not transfer to this case
- [ ] Jurisdictions considered are named, and the ones not considered are named too
- [ ] Terms-of-service language drafted for what is and is not promised
- [ ] The mechanics are described honestly - fees from many subscribers who rarely
      need it, funding intervention for the few who do
- [ ] Explicitly states this is not legal advice and records whether counsel
      reviewed it

#### Implementation notes

1. Write it before the pricing page exists, per §C.7. The order is the point.
2. Do not describe the product as insurance in marketing copy while describing it
   as insurance in internal docs, or vice versa. One characterization.
3. This is maintainer-only: it is a position, not an implementation.

#### Affected files

- `docs/design/backstop-regulatory-position.md`
- `docs/legal/terms-backstop.md`

---

### 21.6 Backstop subscription lifecycle and billing hooks

**Labels:** `type:feature` `area:workers` `type:ops`
**Milestone:** Phase 4 - Workers W3: backstop
**Effort:** High
**Depends on:** 21.3, 21.5

#### Description

Turning a backstop tier into a paid subscription: activation, renewal, lapse,
cancellation, and the hooks a billing system attaches to.

Per `docs/open-source-policy.md`, open data and SDKs are MIT and the operated
service is the product. Billing glue is the operated side - keep the hook
interface in the MIT package and the billing implementation out of this repo.

#### Acceptance criteria

- [ ] Lifecycle states and legal transitions defined and enforced
- [ ] Billing integration is an interface in `worker-core`, with no vendor
      implementation committed to this repo
- [ ] A lapsed subscription stops being backstopped within one window, and the
      subscriber is notified before the lapse, not after
- [ ] Coverage boundaries are auditable: for any window, it is answerable from
      stored records whether it was covered
- [ ] No payment credentials pass through `worker-core`
- [ ] The open/closed split is documented in `docs/open-source-policy.md`

#### Implementation notes

1. Notify before lapse. Silent lapse plus a later miss is the worst possible
   sequence for a product whose value is that someone is watching.
2. Auditable coverage windows are what make a disputed intervention resolvable
   without a support conversation.
3. Keep vendor SDKs out of the MIT package - that is the boundary the policy doc
   already draws for the hosted registry.

#### Affected files

- `packages/worker-core/src/subscription/lifecycle.ts`
- `packages/worker-core/src/subscription/billing.ts`
- `docs/open-source-policy.md`

---

## Major 22 - W4: latency-sensitive tiers and vault-pattern automation

> Nothing in this major may be merged before every issue in majors 18-21 is
> closed. The build order is fixed by risk (§C.2 rule 4): skipping it
> reintroduces custody risk plus possible investment-adviser exposure depending
> on jurisdiction.

### 22.1 Soroban vault contract with hard constraints

**Labels:** `type:feature` `area:contracts` `type:security` `needs-design` `priority:critical`
**Milestone:** Phase 4 - Workers W4: latency-sensitive and vault
**Effort:** High
**Depends on:** 21.6

#### Description

§C.2 rule 3, in code. For copy-trading or signal-driven actions the subscriber
deposits into a Soroban vault with hard constraints: allow-listed pools and
assets, a max-slippage bound, withdrawals only back to the depositor, and no path
that lets the caller redirect funds.

The worker's power is limited to "call a constrained function", never "decide
where money goes". This contract is the entire justification for W4 existing; if
it is weak, W4 is a custody product wearing a different name.

#### Acceptance criteria

- [ ] `deposit()`, `withdraw()`, and a constrained action function callable by a
      designated worker
- [ ] `withdraw()` sends funds **only** to the original depositor - no recipient
      parameter exists anywhere in the interface
- [ ] Allow-listed pools and assets are set at configuration time by the depositor
      and cannot be widened by the worker
- [ ] Max-slippage bound enforced on chain; a violating action reverts
- [ ] The worker cannot change configuration, cannot withdraw, and cannot add to
      the allow-list
- [ ] Depositor can revoke the worker's permission unilaterally and immediately
- [ ] Tests prove each of the above negatively - each attempted violation reverts
- [ ] Design reviewed and signed off before implementation; `needs-design` clears
      on the review

#### Implementation notes

1. Enumerate the attack surface first and write the negative tests before the
   happy path. The happy path is easy; the guarantees are the product.
2. No recipient parameter on `withdraw()` at all - not "validated", absent. A
   parameter that must be checked is a check someone can later relax.
3. Unilateral immediate revocation is what keeps the depositor in control at all
   times, including during an incident.
4. Follow `contracts/registry` layout and toolchain pin.

#### Affected files

- `contracts/vault/src/lib.rs`
- `contracts/vault/src/test.rs`
- `contracts/Cargo.toml`
- `docs/design/vault-pattern.md`

---

### 22.2 Vault security audit and property tests

**Labels:** `type:security` `type:test` `area:contracts` `priority:critical`
**Milestone:** Phase 4 - Workers W4: latency-sensitive and vault
**Effort:** High
**Depends on:** 22.1

#### Description

The vault holds user funds. Unit tests prove the cases someone thought of;
property tests and an external audit are how the cases nobody thought of get
found before a user does.

No W4 automation ships against an unaudited vault.

#### Acceptance criteria

- [ ] Property tests assert the invariants: funds only ever return to their
      depositor; the allow-list only narrows; slippage bounds always hold; worker
      authority never widens
- [ ] Fuzzing over deposit/withdraw/action sequences, including interleaved and
      reentrant orderings
- [ ] External audit commissioned and the report published in the repo
- [ ] Every audit finding is either fixed or has a written accepted-risk rationale
- [ ] Audit report and its commit are linked from `SECURITY.md`
- [ ] Deployment to mainnet is gated on audit completion, stated in the runbook

#### Implementation notes

1. State the invariants as properties first, then fuzz against them - a fuzzer
   with no invariant is a slow random test.
2. Publishing the report, including accepted risks, is worth more to the
   regulated-money audience than a clean-looking summary.
3. Audit scheduling is maintainer work with lead time; start it while 22.3-22.5
   are in progress rather than after.

#### Affected files

- `contracts/vault/tests/property.rs`
- `contracts/vault/tests/fuzz.rs`
- `docs/audits/`
- `SECURITY.md`

---

### 22.3 Copy-trade worker on the vault pattern

**Labels:** `type:feature` `area:workers` `type:security`
**Milestone:** Phase 4 - Workers W4: latency-sensitive and vault
**Effort:** High
**Depends on:** 22.2

#### Description

The reference trade-like worker from §C.1: a whale trade is observed, and the
action is mirrored to subscribers - executed strictly through 22.1's vault, so
the worker's authority never exceeds "call a constrained function".

This is the last thing built in the entire backlog, deliberately.

#### Acceptance criteria

- [ ] Mirrors an observed on-chain trade into a vault action within the declared
      latency bound
- [ ] All execution goes through the vault; the worker holds no subscriber assets
      at any point
- [ ] Position sizing is bounded by vault configuration the subscriber set
- [ ] A trade targeting a non-allow-listed asset or pool is skipped, and the skip
      is recorded and notified - never silently dropped
- [ ] Slippage violations revert on chain and are recorded as skips, not misses
- [ ] Subscriber can revoke mid-flight and the worker stops within one window
- [ ] Verification (19.1) scores copy-trade workers with no special case

#### Implementation notes

1. Skips are a normal, expected outcome here and must be first-class in the
   record - a skipped trade is the constraint working, not a failure.
2. Consult 21.5's regulatory note before writing any subscriber-facing copy about
   returns or performance; jurisdictional exposure differs for trade automation.
3. Reuse 20.6's event trigger for the observation side - do not add a second
   matching path.

#### Affected files

- `packages/worker-core/src/workers/copyTrade.ts`
- `packages/worker-core/src/vault/`
- `packages/worker-core/test/workers/copyTrade.test.ts`

---

### 22.4 Latency-sensitive execution path

**Labels:** `type:feature` `area:workers` `type:perf`
**Milestone:** Phase 4 - Workers W4: latency-sensitive and vault
**Effort:** High
**Depends on:** 21.3, 22.3

#### Description

Enables the tier 21.3 defined and disabled. For copy-trading and liquidations,
"late" means the opportunity is gone - and §C.7 is blunt about the consequence:
catching the miss costs the same as running primary infrastructure. Earn the way
here; do not sell it before the infrastructure exists.

#### Acceptance criteria

- [ ] Hot-path execution: pre-simulated, pre-signed where safe, submitted within a
      declared ledger budget
- [ ] Hot standby so a single process restart does not blow the latency budget
- [ ] Latency budget measured end to end - condition observed to transaction
      submitted - and published on the scorecards
- [ ] The tier's cost is measured through 21.2 before the tier is enabled
- [ ] Enabling the tier is a documented, reversible operational decision
- [ ] Backpressure under burst load handled per #921 rather than a parallel
      mechanism

#### Implementation notes

1. Measure before enabling. The tier's whole risk is promising a latency the
   infrastructure has not demonstrated.
2. "Pre-signed where safe" needs a written boundary: pre-signing an action whose
   parameters depend on observed state is not safe, and the code should make the
   distinction structural.
3. Coordinate with #921 (backpressure and bounded memory under burst load) - the
   hot path is exactly where an unbounded queue turns latency into an outage.

#### Affected files

- `packages/worker-core/src/hotPath/`
- `packages/worker-core/src/backstop/tiers.ts`
- `packages/pulse-core/src/EventEngine.ts`

---

### 22.5 Slippage and oracle guard rails

**Labels:** `type:security` `area:workers` `area:contracts`
**Milestone:** Phase 4 - Workers W4: latency-sensitive and vault
**Effort:** High
**Depends on:** 22.3

#### Description

Trade automation reads prices, and a price source is an attack surface. Guard
rails so a manipulated or stale oracle reading cannot be turned into a vault
action that drains value within the constraints the vault permits.

The vault's slippage bound is the last line of defence. These guards are the ones
in front of it.

#### Acceptance criteria

- [ ] Staleness bound on every price reading; a stale reading skips the action
- [ ] Deviation check against a second source, with a configured maximum divergence
- [ ] Circuit breaker halting a worker after N consecutive guard trips, requiring
      manual re-enable
- [ ] Guard trips are recorded, notified and visible on the scorecard
- [ ] Guards are enforced on chain where the vault can enforce them, off chain only
      where it cannot - and the split is documented
- [ ] Tests cover manipulated price, stale price, and diverging sources

#### Implementation notes

1. Anything enforceable in the contract belongs in the contract. Off-chain guards
   protect against a compromised worker only if the worker is honest, which is the
   wrong assumption.
2. Manual re-enable after a circuit break is deliberate friction - an automatic
   reset re-enters the same condition that tripped it.
3. Consider Reflector as one price source (§C.8) while avoiding a single-source
   dependency, which is the failure the deviation check exists to catch.

#### Affected files

- `packages/worker-core/src/guards/priceGuard.ts`
- `packages/worker-core/src/guards/circuitBreaker.ts`
- `contracts/vault/src/lib.rs`
- `docs/design/worker-guard-rails.md`

---

### 22.6 Custody review gate in the PR template and CI

**Labels:** `type:ops` `type:security` `area:workers` `priority:critical`
**Milestone:** Phase 4 - Workers W4: latency-sensitive and vault
**Effort:** Medium
**Depends on:** 18.13

#### Description

Makes the §C.2 review rule mechanical: any design that requires a worker to hold
signing authority over a user's account is a design bug, not a feature.

Prose in a design doc gets skimmed. A checklist item in the PR template and a
lint rule in CI get answered. This issue exists so the constraint survives
contributor turnover and the maintainer being busy.

#### Acceptance criteria

- [ ] PR template gains a custody checklist for any PR touching `worker-core`,
      `contracts/vault` or `contracts/payroll`
- [ ] A CI check flags new code that introduces a user-secret or user-keypair field
      into worker types, subscription records or manifests
- [ ] The check names §C.2 and links `docs/design/workers.md` in its failure message
- [ ] The check is advisory-with-review-required rather than a hard block, so a
      genuine false positive does not wedge the repo
- [ ] Documented in `CONTRIBUTING.md`
- [ ] Path filters actually cover `contracts/`, `packages/worker-core/` and
      `scripts/` - #1026 records that CI path filters have been blind to
      `contracts/`, `data/` and `scripts/` before

#### Implementation notes

1. Fix the path-filter blindness from #1026 as part of this, or the gate silently
   never runs on the contracts it most needs to cover.
2. Keep the rule narrow and specific. A broad heuristic that fires constantly
   trains reviewers to click through it, which is worse than no gate.
3. The failure message should teach the rule, not just fail - most people hitting
   it will not have read §C.2.

#### Affected files

- `.github/pull_request_template.md`
- `.github/workflows/custody-gate.yml`
- `scripts/check-no-user-custody.mjs`
- `CONTRIBUTING.md`

---
