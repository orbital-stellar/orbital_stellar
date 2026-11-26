# pulse-core Changelog

## [Unreleased]

### Added
- **`GalexieHistoricalSource`** - a `HistoricalSource` that reads contract events from a Galexie ledger export (SEP-54 layout), so `replayContracts({ historicalSource })` can replay ledgers older than any RPC's retention. It answers `getEvents` exactly as Stellar RPC does: event IDs and order, cursors, the 10,000-ledger scan window, filters, and both `xdrFormat`s. Checked against mainnet RPC for every event in seven ledgers, with a real mainnet ledger and RPC's answer for it kept as a test fixture. Reads the public AWS Open Data mainnet export or any self-hosted one. Each scanned ledger is one download, so long sparse replays are expensive; see the class docs.
- `scValToXdrJson` / `escapeSep51` - render an `ScVal` in Stellar RPC's `xdrFormat: "json"` shape (the Rust `stellar-xdr` serde output).

### Changed
- `@stellar/stellar-sdk` is now `^16.4.1` across the workspace. 16.2.0 cannot decode mainnet ledgers from protocol 30 (`unknown StellarValueType member for value 3`).

## [0.2.0] - 2026-09-23

### Breaking Changes
- **`CoreConfig.abiRegistry` now defaults to an active registry client instead of `undefined`.** Previously, omitting `abiRegistry` meant no ABI lookup ever happened and `contract.emitted` events were dispatched synchronously. Now, omitting it resolves `@orbital-stellar/abi-registry`'s bundled well-known specs (USDC, EURC, AQUA, the native XLM wrapper) by default - and, once Orbital's on-chain registry contract is deployed, that too. This means:
  - `decodedData` now populates automatically for those well-known contracts with zero configuration.
  - `contract.emitted` event delivery is now **always asynchronous** (a microtask hop through the registry lookup), even for contracts the registry doesn't recognize - previously, delivery was synchronous whenever no `abiRegistry` was configured.
  - Pass `abiRegistry: false` to opt out entirely and preserve the exact pre-upgrade behavior (`decodedData` always `undefined`, synchronous delivery).

### Fixed
- **`decodedData` now contains the actually-decoded event payload**, not the raw ABI spec. Previously, `EventEngine.route()` set `decodedData` to the looked-up spec (or its raw XDR `entries`) instead of calling `@orbital-stellar/abi-registry`'s `decodeContractEvent()` against it - meaning every existing consumer configuring `abiRegistry` was silently getting the wrong thing on `contract.emitted` events. This was a bug, not a documented behavior; fixing it does change the shape of `decodedData` for anyone relying on the old (incorrect) output.

### Added
- `orbital typegen <contractId>` CLI command - generates TypeScript interfaces + Zod schemas for a deployed Soroban contract, resolving its spec from the on-chain registry first and falling back to live WASM auto-discovery.

## [0.1.0] - 2026-05-28

### Breaking Changes
- **WatcherNotification API**: The `timestamp` field on `WatcherNotification` (`engine.reconnecting` and `engine.reconnected` events) has been renamed to `emittedAt` to distinguish it from the on-chain `created_at` timestamp used in other events like `payment.received`.

See the root [`CHANGELOG.md`](../../CHANGELOG.md) for the full `v0.1.0` release notes across all packages.
