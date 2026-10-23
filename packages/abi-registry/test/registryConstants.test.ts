import { describe, it, expect } from "vitest";
import { Networks } from "@stellar/stellar-sdk";
import {
  ORBITAL_REGISTRY_TESTNET_NETWORK_PASSPHRASE,
  ORBITAL_REGISTRY_TESTNET_CONTRACT_ID,
  ORBITAL_REGISTRY_PUBLISHER_ADDRESS,
  ORBITAL_REGISTRY_MAINNET_NETWORK_PASSPHRASE,
  ORBITAL_REGISTRY_MAINNET_CONTRACT_ID,
  ORBITAL_REGISTRY_MAINNET_RPC_URL,
  ORBITAL_REGISTRY_MAINNET_PUBLISHER_ADDRESS,
} from "../src/registryConstants.js";

describe("registry constants", () => {
  it("keeps the testnet passphrase literal in step with the SDK", () => {
    // The literal exists so assembling the default registry chain - which runs
    // inside `new EventEngine()` - does not depend on the SDK's `Networks`
    // export being present. This test is what stops the two drifting: the
    // import lives here, in a test, not on the hot path.
    expect(ORBITAL_REGISTRY_TESTNET_NETWORK_PASSPHRASE).toBe(Networks.TESTNET);
  });

  it("has a deployed registry contract and publisher configured", () => {
    expect(ORBITAL_REGISTRY_TESTNET_CONTRACT_ID).toMatch(/^C[A-Z2-7]{55}$/);
    expect(ORBITAL_REGISTRY_PUBLISHER_ADDRESS).toMatch(/^G[A-Z2-7]{55}$/);
  });

  it("keeps the mainnet passphrase literal in step with the SDK", () => {
    expect(ORBITAL_REGISTRY_MAINNET_NETWORK_PASSPHRASE).toBe(Networks.PUBLIC);
  });

  it("fills the mainnet registry values all together or leaves them all empty", () => {
    // Until a real mainnet deploy they are all "". A registry without its RPC
    // URL or publisher cannot be read, so a half-filled set is a mistake.
    const values = [
      ORBITAL_REGISTRY_MAINNET_CONTRACT_ID,
      ORBITAL_REGISTRY_MAINNET_RPC_URL,
      ORBITAL_REGISTRY_MAINNET_PUBLISHER_ADDRESS,
    ];
    const filled = values.filter((v) => v !== "").length;
    expect([0, 3]).toContain(filled);

    if (filled === 3) {
      expect(ORBITAL_REGISTRY_MAINNET_CONTRACT_ID).toMatch(/^C[A-Z2-7]{55}$/);
      expect(ORBITAL_REGISTRY_MAINNET_PUBLISHER_ADDRESS).toMatch(/^G[A-Z2-7]{55}$/);
      expect(() => new URL(ORBITAL_REGISTRY_MAINNET_RPC_URL)).not.toThrow();
    }
  });

  it("never reuses a testnet value for mainnet", () => {
    expect(ORBITAL_REGISTRY_MAINNET_NETWORK_PASSPHRASE).not.toBe(
      ORBITAL_REGISTRY_TESTNET_NETWORK_PASSPHRASE,
    );
    if (ORBITAL_REGISTRY_MAINNET_CONTRACT_ID !== "") {
      expect(ORBITAL_REGISTRY_MAINNET_CONTRACT_ID).not.toBe(ORBITAL_REGISTRY_TESTNET_CONTRACT_ID);
    }
  });
});
