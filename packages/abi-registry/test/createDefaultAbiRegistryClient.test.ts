import { afterEach, describe, it, expect, vi } from "vitest";
import { Networks } from "@stellar/stellar-sdk";

const onChain = vi.hoisted(() => ({ ctor: vi.fn(), getSpec: vi.fn() }));

// Records how the on-chain link is configured and never touches an RPC. The
// existing tests below resolve from the bundled set, which sits ahead of it.
vi.mock("../src/OnChainAbiRegistryClient.js", () => ({
  OnChainAbiRegistryClient: class {
    constructor(options: unknown) {
      onChain.ctor(options);
    }
    getSpec(contractId: string) {
      return onChain.getSpec(contractId);
    }
  },
}));

import { createDefaultAbiRegistryClient } from "../src/createDefaultAbiRegistryClient.js";
import { BundledWellKnownClient } from "../src/BundledWellKnownClient.js";
import { ChainedAbiRegistryClient } from "../src/ChainedAbiRegistryClient.js";
import {
  ORBITAL_REGISTRY_PUBLISHER_ADDRESS,
  ORBITAL_REGISTRY_TESTNET_CONTRACT_ID,
  ORBITAL_REGISTRY_TESTNET_NETWORK_PASSPHRASE,
  ORBITAL_REGISTRY_TESTNET_RPC_URL,
} from "../src/registryConstants.js";

const USDC = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";

/**
 * The registry contract is deployed and seeded (2026-09-06), so the default
 * chain now carries a live on-chain link. That changes what can be asserted
 * here without a network: a *hit* in an earlier link never reaches the chain
 * and stays offline, but a *miss* falls through to it by design.
 *
 * The miss case is therefore exercised against an explicitly composed chain
 * rather than the default one. Resolution against the live contract is covered
 * end to end by the seeding script's `--dry-run` and by reading specs back on
 * testnet, which is where it belongs - a unit test that silently depends on
 * testnet being up is a flaky test wearing a unit test's clothes.
 */
describe("createDefaultAbiRegistryClient", () => {
  it("resolves a bundled well-known spec without reaching the network", async () => {
    // Bundled sits ahead of the on-chain link, so this returns before any RPC.
    const spec = await createDefaultAbiRegistryClient().getSpec(USDC);
    expect(spec).not.toBeNull();
    expect((spec as { name: string }).name).toBe("USD Coin (USDC)");
  });

  it("ships a populated on-chain link by default", () => {
    // Guards the deployment wiring. If a redeploy blanks this constant, the
    // default chain silently degrades to bundled-only and every contract that
    // is not one of the four bundled specs resolves to null - a failure that
    // looks exactly like "not registered".
    expect(ORBITAL_REGISTRY_TESTNET_CONTRACT_ID).not.toBe("");
  });
});

describe("ChainedAbiRegistryClient", () => {
  it("returns null when no link in the chain has the contract", async () => {
    const chain = new ChainedAbiRegistryClient([new BundledWellKnownClient()]);
    expect(
      await chain.getSpec("CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM"),
    ).toBeNull();
  });
});

describe("createDefaultAbiRegistryClient network selection", () => {
  const MAINNET_ID = "C" + "M".repeat(55);
  const MAINNET_PUBLISHER = "G" + "M".repeat(55);
  const MAINNET_RPC = "https://mainnet-rpc.example";
  const UNKNOWN = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";

  const stubMainnetEnv = () => {
    vi.stubEnv("ORBITAL_REGISTRY_MAINNET_CONTRACT_ID", MAINNET_ID);
    vi.stubEnv("ORBITAL_REGISTRY_MAINNET_RPC_URL", MAINNET_RPC);
    vi.stubEnv("ORBITAL_REGISTRY_MAINNET_PUBLISHER_ADDRESS", MAINNET_PUBLISHER);
  };

  afterEach(() => {
    vi.unstubAllEnvs();
    onChain.ctor.mockReset();
    onChain.getSpec.mockReset();
  });

  it("selects the testnet registry when no network is given", () => {
    createDefaultAbiRegistryClient();
    expect(onChain.ctor).toHaveBeenCalledTimes(1);
    expect(onChain.ctor).toHaveBeenCalledWith({
      contractId: ORBITAL_REGISTRY_TESTNET_CONTRACT_ID,
      rpcUrl: ORBITAL_REGISTRY_TESTNET_RPC_URL,
      networkPassphrase: ORBITAL_REGISTRY_TESTNET_NETWORK_PASSPHRASE,
      publisher: ORBITAL_REGISTRY_PUBLISHER_ADDRESS,
    });
  });

  it("selects the testnet registry for network: testnet", () => {
    createDefaultAbiRegistryClient({ network: "testnet" });
    expect(onChain.ctor).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: ORBITAL_REGISTRY_TESTNET_CONTRACT_ID,
        networkPassphrase: Networks.TESTNET,
      }),
    );
  });

  it("honours the testnet environment overrides", () => {
    vi.stubEnv("ORBITAL_REGISTRY_TESTNET_CONTRACT_ID", "C" + "T".repeat(55));
    vi.stubEnv("ORBITAL_REGISTRY_TESTNET_RPC_URL", "https://testnet-rpc.example");
    vi.stubEnv("ORBITAL_REGISTRY_PUBLISHER_ADDRESS", "G" + "T".repeat(55));

    createDefaultAbiRegistryClient({ network: "testnet" });

    expect(onChain.ctor).toHaveBeenCalledWith({
      contractId: "C" + "T".repeat(55),
      rpcUrl: "https://testnet-rpc.example",
      networkPassphrase: Networks.TESTNET,
      publisher: "G" + "T".repeat(55),
    });
  });

  it("ignores a blank testnet override and keeps the shipped contract ID", () => {
    vi.stubEnv("ORBITAL_REGISTRY_TESTNET_CONTRACT_ID", "   ");
    createDefaultAbiRegistryClient({ network: "testnet" });
    expect(onChain.ctor).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: ORBITAL_REGISTRY_TESTNET_CONTRACT_ID }),
    );
  });

  it("skips the on-chain link on mainnet while no mainnet registry is deployed", async () => {
    const chain = createDefaultAbiRegistryClient({ network: "mainnet" });
    expect(onChain.ctor).not.toHaveBeenCalled();
    // Bundled specs still resolve, and a miss ends the chain without any RPC.
    expect(await chain.getSpec(UNKNOWN)).toBeNull();
    expect(onChain.getSpec).not.toHaveBeenCalled();
  });

  it("never falls back to the testnet registry for mainnet", () => {
    createDefaultAbiRegistryClient({ network: "mainnet" });
    expect(onChain.ctor).not.toHaveBeenCalledWith(
      expect.objectContaining({ contractId: ORBITAL_REGISTRY_TESTNET_CONTRACT_ID }),
    );
  });

  it("still resolves bundled well-known specs on mainnet", async () => {
    const spec = await createDefaultAbiRegistryClient({ network: "mainnet" }).getSpec(USDC);
    expect((spec as { name: string }).name).toBe("USD Coin (USDC)");
  });

  it("selects the mainnet registry once all three mainnet values are set", () => {
    stubMainnetEnv();
    createDefaultAbiRegistryClient({ network: "mainnet" });
    expect(onChain.ctor).toHaveBeenCalledTimes(1);
    expect(onChain.ctor).toHaveBeenCalledWith({
      contractId: MAINNET_ID,
      rpcUrl: MAINNET_RPC,
      networkPassphrase: Networks.PUBLIC,
      publisher: MAINNET_PUBLISHER,
    });
  });

  it("ignores the testnet environment overrides on mainnet", () => {
    stubMainnetEnv();
    vi.stubEnv("ORBITAL_REGISTRY_TESTNET_CONTRACT_ID", "C" + "T".repeat(55));
    vi.stubEnv("ORBITAL_REGISTRY_PUBLISHER_ADDRESS", "G" + "T".repeat(55));
    createDefaultAbiRegistryClient({ network: "mainnet" });
    expect(onChain.ctor).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: MAINNET_ID, publisher: MAINNET_PUBLISHER }),
    );
  });

  it.each([
    ["contract ID", "ORBITAL_REGISTRY_MAINNET_CONTRACT_ID"],
    ["RPC URL", "ORBITAL_REGISTRY_MAINNET_RPC_URL"],
    ["publisher", "ORBITAL_REGISTRY_MAINNET_PUBLISHER_ADDRESS"],
  ])("skips the mainnet on-chain link when the %s is missing", (_label, missing) => {
    stubMainnetEnv();
    vi.stubEnv(missing, "");
    createDefaultAbiRegistryClient({ network: "mainnet" });
    expect(onChain.ctor).not.toHaveBeenCalled();
  });

  it("consults the mainnet registry for a contract no earlier link has", async () => {
    stubMainnetEnv();
    onChain.getSpec.mockResolvedValue({ name: "Mainnet spec" });
    const spec = await createDefaultAbiRegistryClient({ network: "mainnet" }).getSpec(UNKNOWN);
    expect(onChain.getSpec).toHaveBeenCalledWith(UNKNOWN);
    expect(spec).toEqual({ name: "Mainnet spec" });
  });

  it("has no on-chain link for futurenet, even with mainnet values set", () => {
    stubMainnetEnv();
    createDefaultAbiRegistryClient({ network: "futurenet" });
    expect(onChain.ctor).not.toHaveBeenCalled();
  });

  it("returns a ChainedAbiRegistryClient for every network", () => {
    for (const network of ["testnet", "mainnet", "futurenet"] as const) {
      expect(createDefaultAbiRegistryClient({ network })).toBeInstanceOf(ChainedAbiRegistryClient);
    }
  });
});
