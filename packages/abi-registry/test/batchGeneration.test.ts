import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Networks } from "@stellar/stellar-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  registryCtor: vi.fn(),
  registryGetSpec: vi.fn(),
  discover: vi.fn(),
  bundled: vi.fn(),
  rmSync: vi.fn(),
  tmpdirOverride: { value: undefined as string | undefined },
}));

vi.mock("../src/OnChainAbiRegistryClient.js", () => ({
  OnChainAbiRegistryClient: class {
    constructor(options: unknown) {
      h.registryCtor(options);
    }
    getSpec(contractId: string) {
      return h.registryGetSpec(contractId);
    }
  },
}));
vi.mock("../src/discovery/discoverContract.js", () => ({ discoverContractSpec: h.discover }));
vi.mock("../src/BundledWellKnownClient.js", () => ({ loadBundledWellKnownSpecs: h.bundled }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  h.rmSync.mockImplementation(actual.rmSync);
  return { ...actual, rmSync: h.rmSync };
});
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, tmpdir: () => h.tmpdirOverride.value ?? actual.tmpdir() };
});

import { BatchGenerationError, checkForDrift, generateBatchTypes } from "../src/batchGeneration.js";
import type { ContractConfig, OrbitalConfig } from "../src/config.js";
import type { ContractSpec } from "../src/spec.js";

const USDC = "C" + "A".repeat(55);
const EURC = "C" + "B".repeat(55);
const REGISTRY = "C" + "R".repeat(55);

function makeSpec(name: string, extraFn = false): ContractSpec {
  return {
    version: "1.0.0",
    name,
    functions: extraFn
      ? [{ name: "ping", inputs: [], outputs: [] } as unknown as ContractSpec["functions"][number]]
      : [],
    events: [],
    types: {},
  };
}

describe("batchGeneration", () => {
  let dir: string;
  let configPath: string;
  let warn: ReturnType<typeof vi.spyOn>;

  const config = (
    contracts: ContractConfig[],
    extra: Partial<OrbitalConfig> = {},
  ): OrbitalConfig => ({ contracts, outDir: "generated", ...extra });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "orbital-batch-"));
    configPath = join(dir, "orbital.config.json");
    h.registryCtor.mockReset();
    h.registryGetSpec.mockReset().mockResolvedValue(null);
    h.discover.mockReset().mockResolvedValue(makeSpec("Discovered"));
    h.bundled.mockReset().mockReturnValue(new Map());
    h.rmSync.mockClear();
    h.tmpdirOverride.value = undefined;
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  describe("BatchGenerationError", () => {
    it("carries the message, an optional contract id and its name", () => {
      const withId = new BatchGenerationError("boom", "CTEST");
      expect(withId.message).toBe("boom");
      expect(withId.contractId).toBe("CTEST");
      expect(withId.name).toBe("BatchGenerationError");
      expect(withId).toBeInstanceOf(Error);
      expect(new BatchGenerationError("boom").contractId).toBeUndefined();
    });
  });

  describe("generateBatchTypes", () => {
    it("generates a file per contract, resolving from the registry first", async () => {
      h.registryGetSpec.mockResolvedValue(makeSpec("Usdc"));

      const result = await generateBatchTypes(
        config([{ contractId: USDC, name: "usdc" }]),
        "hash-1",
        configPath,
      );

      expect(result.contractsProcessed).toBe(1);
      expect(result.lockFileUpdated).toBe(true);
      expect(result.contracts).toEqual([
        {
          contractId: USDC,
          name: "usdc",
          outputPath: join(dir, "generated", "usdc.ts"),
          source: "registry",
        },
      ]);
      expect(readFileSync(result.contracts[0]!.outputPath, "utf-8").length).toBeGreaterThan(0);
      expect(h.discover).not.toHaveBeenCalled();
    });

    it("writes orbital.lock.json recording the config hash and each source", async () => {
      h.registryGetSpec.mockResolvedValue(makeSpec("Usdc"));
      await generateBatchTypes(config([{ contractId: USDC, name: "usdc" }]), "hash-1", configPath);

      const lock = JSON.parse(readFileSync(join(dir, "orbital.lock.json"), "utf-8"));
      expect(lock.configHash).toBe("hash-1");
      expect(lock.contracts).toHaveLength(1);
      expect(lock.contracts[0]).toMatchObject({
        contractId: USDC,
        name: "usdc",
        source: "registry",
      });
      expect(lock.contracts[0].specHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("falls back to the bundled well-known specs when the registry has none", async () => {
      h.bundled.mockReturnValue(new Map([[USDC, makeSpec("Usdc")]]));

      const result = await generateBatchTypes(
        config([{ contractId: USDC, name: "usdc" }]),
        "h",
        configPath,
      );

      expect(result.contracts[0]!.source).toBe("well-known");
      expect(h.discover).not.toHaveBeenCalled();
    });

    it("falls back to WASM discovery and warns when the registry lookup throws", async () => {
      h.registryGetSpec.mockRejectedValue(new Error("rpc down"));

      const result = await generateBatchTypes(
        config([{ contractId: USDC, name: "usdc" }]),
        "h",
        configPath,
      );

      expect(result.contracts[0]!.source).toBe("wasm");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("Registry lookup failed"));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("rpc down"));
    });

    it("stringifies a non-Error registry failure in the warning", async () => {
      h.registryGetSpec.mockRejectedValue("plain string failure");
      await generateBatchTypes(config([{ contractId: USDC, name: "usdc" }]), "h", configPath);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("plain string failure"));
    });

    it("processes several contracts from different sources in config order", async () => {
      h.registryGetSpec.mockImplementation(async (id: string) =>
        id === USDC ? makeSpec("Usdc") : null,
      );
      h.bundled.mockReturnValue(new Map([[EURC, makeSpec("Eurc")]]));
      const other = "C" + "C".repeat(55);

      const result = await generateBatchTypes(
        config([
          { contractId: USDC, name: "usdc" },
          { contractId: EURC, name: "eurc" },
          { contractId: other, name: "other" },
        ]),
        "h",
        configPath,
      );

      expect(result.contractsProcessed).toBe(3);
      expect(result.contracts.map((c) => [c.name, c.source])).toEqual([
        ["usdc", "registry"],
        ["eurc", "well-known"],
        ["other", "wasm"],
      ]);
      expect(readdirSync(join(dir, "generated")).sort()).toEqual([
        "eurc.ts",
        "other.ts",
        "usdc.ts",
      ]);
    });

    describe("file names", () => {
      it("sanitizes unsafe characters, collapsing repeats and trimming underscores", async () => {
        const result = await generateBatchTypes(
          config([{ contractId: USDC, name: "my  contract!!" }]),
          "h",
          configPath,
        );
        expect(result.contracts[0]!.outputPath).toBe(join(dir, "generated", "my_contract.ts"));
        expect(result.contracts[0]!.name).toBe("my  contract!!");
      });

      it("keeps a leading digit as is", async () => {
        // sanitizeFileName prefixes digits with "_" and then trims leading and
        // trailing underscores, so the prefix never survives. The name is still
        // a valid file name, so this pins the behaviour rather than asserting
        // the apparent intent.
        const result = await generateBatchTypes(
          config([{ contractId: USDC, name: "1inch" }]),
          "h",
          configPath,
        );
        expect(result.contracts[0]!.outputPath).toBe(join(dir, "generated", "1inch.ts"));
      });

      it("uses the contract id when no name is configured", async () => {
        const result = await generateBatchTypes(config([{ contractId: USDC }]), "h", configPath);
        expect(result.contracts[0]!.name).toBe(USDC);
        expect(result.contracts[0]!.outputPath).toBe(join(dir, "generated", `${USDC}.ts`));
      });
    });

    describe("config validation", () => {
      it("rejects an empty contracts list", async () => {
        await expect(generateBatchTypes(config([]), "h", configPath)).rejects.toThrow(
          /at least one contract/,
        );
      });

      it.each(["index", "package", "node_modules", "INDEX"])(
        "rejects the reserved name %s",
        async (name) => {
          await expect(
            generateBatchTypes(config([{ contractId: USDC, name }]), "h", configPath),
          ).rejects.toThrow(/reserved filename/);
        },
      );

      it("does not catch dotted reserved names, since sanitizing strips the dot first", async () => {
        const result = await generateBatchTypes(
          config([{ contractId: USDC, name: ".git" }]),
          "h",
          configPath,
        );
        expect(result.contracts[0]!.outputPath).toBe(join(dir, "generated", "git.ts"));
      });

      it("rejects a name that sanitizes to nothing", async () => {
        await expect(
          generateBatchTypes(config([{ contractId: USDC, name: "!!!" }]), "h", configPath),
        ).rejects.toThrow(/empty filename after sanitization/);
      });

      it("reports the failing contract's index in the message", async () => {
        await expect(
          generateBatchTypes(
            config([
              { contractId: USDC, name: "ok" },
              { contractId: EURC, name: "index" },
            ]),
            "h",
            configPath,
          ),
        ).rejects.toThrow(/contracts\[1\]/);
      });

      it("rejects an output directory that cannot be created", async () => {
        writeFileSync(join(dir, "blocker"), "not a directory");
        await expect(
          generateBatchTypes(
            { contracts: [{ contractId: USDC, name: "usdc" }], outDir: "blocker/sub" },
            "h",
            configPath,
          ),
        ).rejects.toThrow(/cannot be created/);
      });

      it("wraps an unexpected validation failure in a BatchGenerationError", async () => {
        const bad = { outDir: "generated" } as unknown as OrbitalConfig;
        const error = await generateBatchTypes(bad, "h", configPath).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(BatchGenerationError);
        expect((error as Error).message).toMatch(/^Configuration validation failed:/);
      });
    });

    describe("network and registry selection", () => {
      it("uses the testnet registry and passphrase by default", async () => {
        await generateBatchTypes(config([{ contractId: USDC, name: "usdc" }]), "h", configPath);

        expect(h.registryCtor).toHaveBeenCalledTimes(1);
        const options = h.registryCtor.mock.calls[0]![0];
        expect(options.rpcUrl).toBe("https://soroban-testnet.stellar.org");
        expect(options.networkPassphrase).toBe(Networks.TESTNET);
        expect(options.contractId).toMatch(/^C[A-Z0-9]{55}$/);
      });

      it("skips the default registry for a mainnet contract and discovers over WASM", async () => {
        const result = await generateBatchTypes(
          config([{ contractId: USDC, name: "usdc" }], { network: "mainnet" }),
          "h",
          configPath,
        );

        expect(h.registryCtor).not.toHaveBeenCalled();
        expect(result.contracts[0]!.source).toBe("wasm");
        expect(h.discover).toHaveBeenCalledWith({
          rpcUrl: "https://soroban-mainnet.stellar.org",
          contractId: USDC,
          network: "mainnet",
        });
      });

      it("still tries an explicit registryContractId on mainnet", async () => {
        h.registryGetSpec.mockResolvedValue(makeSpec("Usdc"));

        const result = await generateBatchTypes(
          config([{ contractId: USDC, name: "usdc" }], {
            network: "mainnet",
            registryContractId: REGISTRY,
            registryPublisher: "GPUBLISHER",
          }),
          "h",
          configPath,
        );

        expect(result.contracts[0]!.source).toBe("registry");
        const options = h.registryCtor.mock.calls[0]![0];
        expect(options).toMatchObject({
          contractId: REGISTRY,
          publisher: "GPUBLISHER",
          networkPassphrase: Networks.PUBLIC,
          rpcUrl: "https://soroban-mainnet.stellar.org",
        });
      });

      it("lets a contract override the network and RPC URL of the config", async () => {
        await generateBatchTypes(
          config(
            [
              {
                contractId: USDC,
                name: "usdc",
                network: "futurenet",
                rpcUrl: "https://futurenet.example/rpc",
              },
            ],
            { network: "mainnet", rpcUrl: "https://config.example/rpc" },
          ),
          "h",
          configPath,
        );

        expect(h.discover).toHaveBeenCalledWith({
          rpcUrl: "https://futurenet.example/rpc",
          contractId: USDC,
          network: "futurenet",
        });
      });

      it("uses the futurenet default RPC URL and passphrase", async () => {
        await generateBatchTypes(
          config([{ contractId: USDC, name: "usdc" }], {
            network: "futurenet",
            registryContractId: REGISTRY,
          }),
          "h",
          configPath,
        );

        const options = h.registryCtor.mock.calls[0]![0];
        expect(options.rpcUrl).toBe("https://soroban-futurenet.stellar.org");
        expect(options.networkPassphrase).toBe(Networks.FUTURENET);
      });

      it("falls back to testnet defaults for an unrecognised network", async () => {
        await generateBatchTypes(
          config([{ contractId: USDC, name: "usdc" }], {
            network: "bogus" as unknown as "testnet",
            registryContractId: REGISTRY,
          }),
          "h",
          configPath,
        );

        const options = h.registryCtor.mock.calls[0]![0];
        expect(options.rpcUrl).toBe("https://soroban-testnet.stellar.org");
        expect(options.networkPassphrase).toBe(Networks.TESTNET);
      });
    });

    describe("resolution errors", () => {
      const run = (contract: ContractConfig = { contractId: USDC, name: "usdc" }) =>
        generateBatchTypes(config([contract]), "h", configPath);

      it("names the contract and index and carries the contract id", async () => {
        h.discover.mockRejectedValue(new Error("boom"));
        const error = (await run().catch((e: unknown) => e)) as BatchGenerationError;
        expect(error).toBeInstanceOf(BatchGenerationError);
        expect(error.contractId).toBe(USDC);
        expect(error.message).toContain("Failed to resolve contract 'usdc' (contracts[0])");
        expect(error.message).toContain(`Could not resolve contract spec for '${USDC}': boom`);
      });

      it("rejects an invalid RPC URL before any lookup", async () => {
        await expect(run({ contractId: USDC, name: "usdc", rpcUrl: "not a url" })).rejects.toThrow(
          /Invalid RPC URL 'not a url'/,
        );
        expect(h.registryCtor).not.toHaveBeenCalled();
        expect(h.discover).not.toHaveBeenCalled();
      });

      it.each([
        ["contract not found", /Contract not found on testnet network/],
        ["HTTP 404 returned", /Contract not found on testnet network/],
        ["network unreachable", /Network error when connecting to https:\/\/soroban-testnet/],
        ["connection reset", /Network error when connecting to/],
        ["NoEmbeddedSpecError: none", /no embedded spec \(likely a Stellar Asset Contract\)/],
      ])("maps the discovery error %j to a helpful message", async (message, expected) => {
        h.discover.mockRejectedValue(new Error(message));
        await expect(run()).rejects.toThrow(expected);
      });

      it("passes an unrecognised discovery error message through", async () => {
        h.discover.mockRejectedValue(new Error("something odd"));
        await expect(run()).rejects.toThrow(/Could not resolve contract spec .*: something odd/);
      });

      it("stringifies a non-Error discovery failure", async () => {
        h.discover.mockRejectedValue("weird");
        await expect(run()).rejects.toThrow(/Could not resolve contract spec .*: weird/);
      });

      it("falls back to the contract id when the contract has no name", async () => {
        h.discover.mockRejectedValue(new Error("boom"));
        await expect(run({ contractId: USDC })).rejects.toThrow(
          `Failed to resolve contract '${USDC}' (contracts[0])`,
        );
      });
    });

    describe("write failures", () => {
      it("reports a type generation failure with the file name and contract id", async () => {
        h.registryGetSpec.mockResolvedValue({} as ContractSpec);
        const error = (await generateBatchTypes(
          config([{ contractId: USDC, name: "usdc" }]),
          "h",
          configPath,
        ).catch((e: unknown) => e)) as BatchGenerationError;

        expect(error).toBeInstanceOf(BatchGenerationError);
        expect(error.contractId).toBe(USDC);
        expect(error.message).toContain(
          "Failed to generate types for contract 'usdc' (contracts[0])",
        );
        expect(error.message).toContain("'usdc.ts'");
      });

      it("reports a lock file that cannot be written", async () => {
        mkdirSync(join(dir, "orbital.lock.json"));
        await expect(
          generateBatchTypes(config([{ contractId: USDC, name: "usdc" }]), "h", configPath),
        ).rejects.toThrow(/Failed to update lock file/);
      });
    });
  });

  describe("checkForDrift", () => {
    const base = (): OrbitalConfig => config([{ contractId: USDC, name: "usdc" }]);

    async function generateBaseline(): Promise<void> {
      h.registryGetSpec.mockResolvedValue(makeSpec("Usdc"));
      await generateBatchTypes(base(), "hash-1", configPath);
    }

    it("reports no changes right after a generation", async () => {
      await generateBaseline();
      const result = await checkForDrift(base(), "hash-1", configPath);
      expect(result.hasChanges).toBe(false);
    });

    it("does not write the generated files or touch the lock file", async () => {
      await generateBaseline();
      const lockBefore = readFileSync(join(dir, "orbital.lock.json"), "utf-8");
      const filesBefore = readdirSync(join(dir, "generated"));

      h.registryGetSpec.mockResolvedValue(makeSpec("Usdc", true));
      await checkForDrift(base(), "hash-1", configPath);

      expect(readFileSync(join(dir, "orbital.lock.json"), "utf-8")).toBe(lockBefore);
      expect(readdirSync(join(dir, "generated"))).toEqual(filesBefore);
    });

    it("detects a changed contract spec", async () => {
      await generateBaseline();
      h.registryGetSpec.mockResolvedValue(makeSpec("Usdc", true));

      const result = await checkForDrift(base(), "hash-1", configPath);

      expect(result.hasChanges).toBe(true);
      expect(result.report).toContain("usdc");
    });

    it("detects a changed config hash", async () => {
      await generateBaseline();
      const result = await checkForDrift(base(), "hash-2", configPath);
      expect(result.hasChanges).toBe(true);
    });

    it("detects an added contract", async () => {
      await generateBaseline();
      const next = config([
        { contractId: USDC, name: "usdc" },
        { contractId: EURC, name: "eurc" },
      ]);
      const result = await checkForDrift(next, "hash-1", configPath);
      expect(result.hasChanges).toBe(true);
    });

    it("reports a missing lock file", async () => {
      const result = await checkForDrift(base(), "hash-1", configPath);
      expect(result).toEqual({
        hasChanges: true,
        report: "✗ No lock file found - run 'orbital codegen' to create one",
      });
    });

    it("reports an unreadable lock file", async () => {
      writeFileSync(join(dir, "orbital.lock.json"), "{ not json");
      const result = await checkForDrift(base(), "hash-1", configPath);
      expect(result.hasChanges).toBe(true);
      expect(result.report).toMatch(/^✗ Failed to load lock file:/);
    });

    it("reports an invalid config without looking at the lock file", async () => {
      const result = await checkForDrift(config([]), "hash-1", configPath);
      expect(result.hasChanges).toBe(true);
      expect(result.report).toMatch(/^✗ Configuration validation failed: .*at least one contract/);
    });

    it("reports a contract that can no longer be resolved", async () => {
      await generateBaseline();
      h.registryGetSpec.mockResolvedValue(null);
      h.discover.mockRejectedValue(new Error("contract not found"));

      const result = await checkForDrift(base(), "hash-1", configPath);

      expect(result.hasChanges).toBe(true);
      expect(result.report).toContain("✗ Failed to resolve contract 'usdc' (contracts[0])");
    });

    it("reports a temporary directory that cannot be created", async () => {
      await generateBaseline();
      writeFileSync(join(dir, "not-a-dir"), "x");
      h.tmpdirOverride.value = join(dir, "not-a-dir");

      const result = await checkForDrift(base(), "hash-1", configPath);

      expect(result.hasChanges).toBe(true);
      expect(result.report).toMatch(/^✗ Failed to create temporary directory:/);
    });

    it("removes its temporary directory when it finishes", async () => {
      await generateBaseline();
      await checkForDrift(base(), "hash-1", configPath);
      const removed = h.rmSync.mock.calls.map((c) => String(c[0]));
      expect(removed.some((p) => p.includes("orbital-check-"))).toBe(true);
    });

    it("warns but still returns a result when the cleanup fails", async () => {
      await generateBaseline();
      h.rmSync.mockImplementationOnce(() => {
        throw new Error("EBUSY");
      });

      const result = await checkForDrift(base(), "hash-1", configPath);

      expect(result.hasChanges).toBe(false);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to clean up temporary directory"),
      );
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("EBUSY"));
    });

    it("stringifies a non-Error cleanup failure", async () => {
      await generateBaseline();
      h.rmSync.mockImplementationOnce(() => {
        throw "locked";
      });
      await checkForDrift(base(), "hash-1", configPath);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("locked"));
    });
  });
});
