#!/usr/bin/env node
// One-off generator for issues-batch24.md: post-0.2.0 cleanup, 30 issues.
// Every issue is non-blocking and scoped to one file or one directory.
// Feed to: node scripts/create-product-issues.mjs --file issues-batch24.md
import { writeFileSync } from "node:fs";

const MILESTONE = "Post-0.2.0 cleanup";

const I = [];
const add = (o) => I.push(o);

// ── A. Docs that went stale with the 0.2.0 release ────────────────────────
add({
  title: "README: refresh 'What works today' and status line for 0.2.0",
  labels: ["type:docs"], effort: "Trivial", files: ["README.md"],
  desc: `README.md still describes the \`0.1.0\` world: the status line says \`v0.1.0\` on npm, the "What works today" table marks Soroban subscription as not on npm and links #1132 (now closed), the Quickstart warns that contract events need a newer build than \`0.1.0\`, and the on-chain table says the registry is "never invoked" - it now holds four published specs (USDC, EURC, AQUA, XLM SAC; see \`contracts/deployed.testnet.json\` \`seededSpecs\`).`,
  ac: [
    "Status line and every npm cell reflect `0.2.0`",
    "Soroban subscription, abi-registry, orbital-indexer, anchor-sdk and worker-core rows show their real npm state",
    "The Quickstart `0.1.0` warning block is removed",
    "On-chain table reflects the seeded registry and cites `contracts/deployed.testnet.json`",
    "No other file changes",
  ],
  notes: ["Check each claim with `npm view @orbital-stellar/<pkg> version` before writing it."],
});
add({
  title: "CHANGELOG: add the 0.2.0 roll-up entry",
  labels: ["type:docs"], effort: "Trivial", files: ["CHANGELOG.md"],
  desc: "Each package's CHANGELOG has a `[0.2.0] - 2026-09-23` section, but the top-level CHANGELOG.md, which rolls them up, has none. Its intro also lists only four packages; seven are published now.",
  ac: [
    "A `## [0.2.0] - 2026-09-23` section summarizing each package's 0.2.0 notes, with links to the per-package CHANGELOGs",
    "Calls out the first publish of `orbital-indexer`, `anchor-sdk` and `worker-core`",
    "The intro paragraph lists all seven published packages",
  ],
  notes: ["Summarize, do not copy whole per-package sections."],
});
add({
  title: "Worker gate tracker: refresh gate evidence after 0.2.0",
  labels: ["type:docs", "area:workers"], effort: "Trivial", files: ["docs/worker-entry-gate.md"],
  desc: "`docs/worker-entry-gate.md` cites the old testnet registry ID `CDSCV5WB…` (the contracts were redeployed 2026-09-06), says `anchor-sdk` is not on npm (it is, at 0.2.0), and counts 5 verified schemas when the four seeded SAC specs are `unverifiable` and do not count.",
  ac: [
    "Contract IDs match `contracts/deployed.testnet.json`",
    "Gate 2 records `anchor-sdk@0.2.0` on npm; `v1.0.0` still outstanding",
    "Gate 1's schema count explains SACs are `unverifiable` and links the milestone 'Worker gate 1 - 25 verified schemas'",
    "Gates 3 and 4 text is left unchanged (maintainer decision pending)",
  ],
  notes: ["Re-verify each number against the repo or npm; do not copy from other docs."],
});
add({
  title: "ROADMAP Phase 4: record W0-W3 as built and W4 as dropped",
  labels: ["type:docs", "area:workers"], effort: "Trivial", files: ["ROADMAP.md"],
  desc: "ROADMAP.md Phase 4 still reads as not started. All 38 worker issues (18.x-22.x) are closed: W0-W3 live in `packages/worker-core`, and W4 (vault, copy-trade, latency tier) was deliberately dropped in #1137.",
  ac: [
    "At-a-glance row and Phase 4 section mark W0-W3 `[x]` with links to the package",
    "W4 is marked dropped with a link to #1137 and a one-line reason",
    "`worker-core@0.2.0` on npm is mentioned",
    "Only the Phase 4 section and its at-a-glance row change",
  ],
  notes: ["Read #1137's description for the drop rationale."],
});
add({
  title: "worker-core README: add install instructions and current status",
  labels: ["type:docs", "area:workers"], effort: "Trivial", files: ["packages/worker-core/README.md"],
  desc: "`@orbital-stellar/worker-core` is on npm at 0.2.0, but its README has no install line and still describes the layer as frozen scope.",
  ac: [
    "`pnpm add @orbital-stellar/worker-core` near the top",
    "A short status note: W0-W3 shipped, W4 dropped (#1137)",
    "The 'trigger is not the custodian' section is untouched",
  ],
  notes: ["Match the tone of `packages/anchor-sdk/README.md`'s opening."],
});
add({
  title: "Worker design doc: note the W4 drop",
  labels: ["type:docs", "area:workers"], effort: "Trivial", files: ["docs/design/workers.md"],
  desc: "`docs/design/workers.md` still describes the W0 → W4 build order as fully planned. W4 (vault, copy-trade, latency-sensitive tier) was removed in #1137.",
  ac: [
    "The build-order section marks W4 as dropped, linking #1137",
    "Any 'frozen' wording that no longer matches the code is updated",
    "The four precedence rules are unchanged",
  ],
  notes: ["Do not re-litigate the design; record what shipped."],
});

// ── B. Starters on published 0.2.0 ─────────────────────────────────────────
for (const [name, detail] of [
  ["express-starter", "depends on `pulse-core`, `pulse-webhooks` and `abi-registry` via `workspace:*`"],
  ["anchor-starter", "depends on `anchor-sdk`, `abi-registry` and `pulse-core` via `workspace:*`"],
  ["next-starter", "pins `pulse-core` and `pulse-notify` at `^0.1.0`, which in 0.x semver excludes 0.2.0"],
]) {
  add({
    title: `${name}: install @orbital-stellar packages from npm 0.2.0`,
    labels: ["type:dx", "area:starters"], effort: "Trivial",
    files: [`examples/${name}/package.json`, "pnpm-lock.yaml (regenerated)"],
    desc: `\`examples/${name}\` ${detail}. A developer copying the starter out of the monorepo cannot install it. Replaces the ${name} part of #896.`,
    ac: [
      "Every `@orbital-stellar/*` dependency is `^0.2.0`",
      `\`pnpm --filter ${name} build\` and its tests pass`,
      `The ${name} job in \`.github/workflows/starter-smoke-test.yml\` passes`,
      "Only this starter's package.json and the lockfile change",
    ],
    notes: ["The starter is inside the pnpm workspace; confirm the lockfile resolves the npm version rather than the local link."],
  });
}

// ── C. TSDoc on public exports (scripts/check-tsdoc-coverage.mjs) ────────────
const tsdoc = [
  ["pulse-core: TSDoc for the Soroban RPC client types", "packages/pulse-core/src/SorobanRpcClient.ts",
    "`JsonRpcSuccess`, `JsonRpcFailure`, `JsonRpcResponse`, `PollTransactionOptions`, `SorobanEventFilter`, `SorobanEventXdrFormat`, `SorobanGetEventsParams`, `SorobanGetEventsResult`, `SorobanLatestLedgerResult`, `SorobanNetworkInfo`, `SorobanRpcCallOptions`, `SorobanRpcEvent`"],
  ["pulse-core: TSDoc for the classic event types in index.ts", "packages/pulse-core/src/index.ts",
    "the event types and unions defined in `index.ts`: `OfferEvent`, `BumpSequenceEvent`, `ClaimableCreatedEvent`, `ClaimableClaimedEvent`, `DataEvent`, `LiquidityPoolDepositEvent`, `LiquidityPoolWithdrawEvent`, `TrustAuthEvent`, `AnchorTransactionEvent`, their `*EventType` unions, `CoreConfig`, `SorobanConfig`, `SubscribeOptions`, `ContractFilter`, `ContractSubscriptionConfig`, `EngineStatus`, `SourceStatus`, `HealthCheckResult`"],
  ["pulse-core: TSDoc for errors, backoff and cursor stores", "packages/pulse-core/src/ (errors.ts, backoff.ts, *CursorStore.ts, FileRegistryStore.ts, amount.ts)",
    "`EngineAlreadyStartedError`, `HorizonStreamError`, `InvalidIngestionModeError`, `SorobanRpcError`, `isSorobanRpcError`, `UnknownNetworkError`, `fullJitterBackoffMs`, `MemoryCursorStore`, `FileCursorStore`, `S3CursorStore`, `cacheCursorStore`, `migrateCursors`, `FileRegistryStore`, `StellarAmount`"],
  ["pulse-core: TSDoc for the raw Horizon operation types", "packages/pulse-core/src/raw-horizon.ts",
    "`RawHorizonBaseOperation` and every `RawHorizon*` operation type, plus `RawSorobanEvent`"],
  ["pulse-webhooks: TSDoc for public exports", "packages/pulse-webhooks/src/",
    "the 39 exports from `src/index.ts` that the checker reports (retry queues, dead-letter stores, metrics adapters, signing and URL validation)"],
  ["pulse-notify: TSDoc for hook config and state types", "packages/pulse-notify/src/index.ts",
    "`UseEventConfig`, `EventState`, `PaymentState`, `UseContractEventConfig`, `UseHistoryOptions`, `HistoryState`, `UseAddressesOptions`, `ContractStateOptions`, `ContractStateResult`, `useContractState`, `PulseNotifyVitePlugin`, and the `StellarConnectionStatus*` exports"],
  ["pulse-notify: TSDoc for the devtools entry point", "packages/pulse-notify/src/devtools.tsx",
    "`registerConnection`, `updateConnection`, `unregisterConnection`, `listConnections`, `subscribe`, `PulseNotifyDevtools`, `DevConnection` and the default export"],
];
for (const [title, file, what] of tsdoc) {
  add({
    title, labels: ["type:docs"], effort: "Trivial", files: [file],
    desc: `\`node scripts/check-tsdoc-coverage.mjs\` reports these public exports without TSDoc: ${what}. They show up undocumented in editor hovers and in the generated reference docs.`,
    ac: [
      "Each listed export has a TSDoc comment that says what it is and, for functions, its params and return",
      "`node scripts/check-tsdoc-coverage.mjs` no longer lists them",
      "No behavior changes; comments only",
    ],
    notes: ["Put the comment on the declaration, not on a re-export line.", "Keep each comment to what a caller needs; follow existing documented exports in the same package."],
  });
}

// ── D. Test coverage gaps (fresh `vitest run --coverage`, 2026-09-24) ────────
const tests = [
  ["pulse-notify", "src/devtools.tsx", "0% lines", "connection registration, update, unregister, list and subscribe notifications"],
  ["pulse-notify", "src/useStellarEventSuspense.ts", "2% lines", "suspending until the first event, resolving, and error propagation to an error boundary"],
  ["pulse-notify", "src/connectionPool.ts", "71% lines / 62% branches", "ref-counted sharing, last-release teardown, and reconnect branches"],
  ["worker-core", "src/registry/WorkerRegistryClient.ts", "6% lines / 0% branches", "reads of operator and offering records against a stubbed RPC, including not-found and RPC error paths"],
  ["worker-core", "src/cli/index.ts", "47% lines", "each subcommand's argument parsing and exit codes"],
  ["worker-core", "src/exports/parsers.ts", "50% lines / 34% branches", "valid rows, malformed rows and each rejection branch"],
  ["worker-core", "src/WorkerDeadLetterStore.ts", "56% lines", "enqueue, list, replay and eviction"],
  ["abi-registry", "src/batchGeneration.ts", "2% lines", "generating types for several contracts from a config, and the drift check used by `orbital codegen --check`"],
  ["abi-registry", "src/watch.ts", "29% lines / 15% branches", "the poll loop: spec change triggers regeneration, unchanged spec does not, errors are reported without exiting"],
  ["abi-registry", "src/scval.ts", "68% lines / 58% branches", "decoding each ScVal variant, including maps, vectors, i128/u128/i256 and error values"],
  ["pulse-core", "src/eventAddressNarrow.ts", "0% lines", "each narrowing branch for the address fields on normalized events"],
  ["pulse-core", "src/claimPredicate.ts", "7% lines", "unconditional, before/after absolute and relative, and nested and/or/not predicates"],
  ["pulse-core", "src/errors.ts", "53% lines / 13% branches", "constructors, `instanceof` checks and `isSorobanRpcError` for each code"],
  ["orbital-indexer", "src/AutoPublishIndexer.ts", "84% lines / 54% branches", "in-flight dedupe, backoff for undiscoverable contracts, and publish-failure retry branches"],
];
for (const [pkg, file, cov, what] of tests) {
  add({
    title: `${pkg}: tests for ${file.replace("src/", "")}`,
    labels: ["type:test", `area:${pkg === "worker-core" ? "workers" : pkg}`], effort: "Trivial",
    files: [`packages/${pkg}/test/ (new or extended test file)`],
    desc: `\`packages/${pkg}/${file}\` is at ${cov} in a fresh \`vitest run --coverage\`. Add unit tests covering ${what}.`,
    ac: [
      `Line coverage for \`${file}\` is at least 85% (branches at least 75%)`,
      "Tests use no network; stub RPC and timers",
      "No change to source files unless a test exposes a real bug (then say so in the PR)",
    ],
    notes: [`Run \`cd packages/${pkg} && npx vitest run --coverage\` before and after, and paste both numbers in the PR.`],
  });
}

if (I.length !== 30) throw new Error(`expected 30 issues, got ${I.length}`);

const body = I.map((o, i) => `
### 24.${i + 1} ${o.title}

**Labels:** ${o.labels.map((l) => `\`${l}\``).join(" ")}
**Milestone:** ${MILESTONE}
**Effort:** ${o.effort}
**Depends on:** none

#### Description

${o.desc}

#### Acceptance criteria

${o.ac.map((a) => `- [ ] ${a}`).join("\n")}

#### Implementation notes

${o.notes.map((n, k) => `${k + 1}. ${n}`).join("\n")}

#### Affected files

${o.files.map((f) => `- \`${f}\``).join("\n")}

---
`).join("");

writeFileSync(new URL("../issues-batch24.md", import.meta.url),
  `# Orbital - post-0.2.0 cleanup (batch 24)\n\n30 non-blocking issues, each scoped to one file or directory.\n\n---\n${body}`);
console.log(`wrote issues-batch24.md: ${I.length} issues`);
