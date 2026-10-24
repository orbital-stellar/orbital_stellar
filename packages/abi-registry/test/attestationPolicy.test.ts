import { describe, it, expect } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { signAttestation } from "../src/attestation.js";
import {
  attestationHash,
  classifyAttester,
  meetsMinimumTrust,
  resolveAttestations,
  resolveAttestationsWithDeployer,
} from "../src/attestationPolicy.js";
import type { AttestationDocument } from "../src/types.js";

const CONTRACT_ID = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";
const OTHER_CONTRACT_ID = "CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZTQQSGE5F6JBQLV";
const WASM_HASH = "a".repeat(64);
const NOW = new Date("2026-06-01T00:00:00Z");

const TRANSFER = {
  name: "transfer",
  topics: [{ name: "from", type: "address" }],
  data: [{ name: "amount", type: "i128" }],
} as const;
const SWAP = {
  name: "swap",
  topics: [{ name: "who", type: "address" }],
  data: [{ name: "out", type: "i128" }],
} as const;

function document(
  attester: string,
  overrides: Partial<AttestationDocument> = {},
): AttestationDocument {
  return {
    contractId: CONTRACT_ID,
    executableKind: "wasm",
    wasmHash: WASM_HASH,
    events: [TRANSFER],
    attester,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function signed(keypair: Keypair, overrides: Partial<AttestationDocument> = {}) {
  return signAttestation(document(keypair.publicKey(), overrides), keypair.secret());
}

describe("classifyAttester / meetsMinimumTrust", () => {
  const deployer = Keypair.random().publicKey();
  const stranger = Keypair.random().publicKey();

  it("classifies by the attester's relationship to the deployer", () => {
    expect(classifyAttester(deployer, deployer)).toBe("deployer");
    expect(classifyAttester(stranger, deployer)).toBe("third-party");
    expect(classifyAttester(deployer, null)).toBe("unbound");
    expect(classifyAttester(deployer, undefined)).toBe("unbound");
  });

  it("orders deployer > third-party > unbound", () => {
    expect(meetsMinimumTrust("deployer", "deployer")).toBe(true);
    expect(meetsMinimumTrust("third-party", "deployer")).toBe(false);
    expect(meetsMinimumTrust("third-party", "third-party")).toBe(true);
    expect(meetsMinimumTrust("unbound", "third-party")).toBe(false);
    expect(meetsMinimumTrust("unbound", "unbound")).toBe(true);
  });
});

describe("attestationHash", () => {
  it("is stable under key order and sensitive to content", () => {
    const attester = Keypair.random().publicKey();
    const a = document(attester);
    const reordered: AttestationDocument = {
      createdAt: a.createdAt,
      attester: a.attester,
      events: a.events,
      executableKind: a.executableKind,
      wasmHash: a.wasmHash,
      contractId: a.contractId,
    };
    expect(attestationHash(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(attestationHash(a)).toBe(attestationHash(reordered));
    expect(attestationHash(a)).not.toBe(
      attestationHash({ ...a, createdAt: "2026-01-02T00:00:00Z" }),
    );
  });
});

describe("resolveAttestations", () => {
  it("returns a single valid attestation as preferred, tagged with its trust tier", () => {
    const deployer = Keypair.random();
    const result = resolveAttestations([signed(deployer)], {
      contractId: CONTRACT_ID,
      deployer: deployer.publicKey(),
      expectedWasmHash: WASM_HASH,
      now: NOW,
    });

    expect(result.effective).toHaveLength(1);
    expect(result.preferred?.trust).toBe("deployer");
    expect(result.conflicting).toBe(false);
    expect(result.rejected).toEqual([]);
  });

  it("ranks deployer above third-party above unbound regardless of recency", () => {
    const deployer = Keypair.random();
    const thirdParty = Keypair.random();
    const result = resolveAttestations(
      [
        signed(thirdParty, { createdAt: "2026-05-01T00:00:00Z" }),
        signed(deployer, { createdAt: "2026-01-01T00:00:00Z" }),
      ],
      { contractId: CONTRACT_ID, deployer: deployer.publicKey(), now: NOW },
    );

    expect(result.effective.map((r) => r.trust)).toEqual(["deployer", "third-party"]);
    expect(result.preferred?.envelope.payload.attester).toBe(deployer.publicKey());
  });

  it("breaks a tier tie by recency", () => {
    const a = Keypair.random();
    const b = Keypair.random();
    const result = resolveAttestations(
      [
        signed(a, { createdAt: "2026-01-01T00:00:00Z" }),
        signed(b, { createdAt: "2026-03-01T00:00:00Z" }),
      ],
      { contractId: CONTRACT_ID, deployer: Keypair.random().publicKey(), now: NOW },
    );
    expect(result.preferred?.envelope.payload.attester).toBe(b.publicKey());
  });

  it("flags attestations whose events disagree, and not ones that agree", () => {
    const a = Keypair.random();
    const b = Keypair.random();
    const options = { contractId: CONTRACT_ID, now: NOW };

    expect(resolveAttestations([signed(a), signed(b)], options).conflicting).toBe(false);
    expect(
      resolveAttestations([signed(a), signed(b, { events: [SWAP] })], options).conflicting,
    ).toBe(true);
  });

  it("applies minimumTrust and reports why each was dropped", () => {
    const deployer = Keypair.random();
    const thirdParty = Keypair.random();
    const result = resolveAttestations([signed(deployer), signed(thirdParty)], {
      contractId: CONTRACT_ID,
      deployer: deployer.publicKey(),
      minimumTrust: "deployer",
      now: NOW,
    });

    expect(result.effective).toHaveLength(1);
    expect(result.rejected).toMatchObject([{ code: "below-minimum-trust" }]);
  });

  it("with no known deployer, a deployer-only policy accepts nothing", () => {
    const result = resolveAttestations([signed(Keypair.random())], {
      contractId: CONTRACT_ID,
      deployer: null,
      minimumTrust: "deployer",
      now: NOW,
    });
    expect(result.preferred).toBeUndefined();
    expect(result.rejected).toMatchObject([{ code: "below-minimum-trust" }]);
  });

  describe("supersession", () => {
    it("retires an attestation superseded by the same attester", () => {
      const attester = Keypair.random();
      const original = signed(attester, { createdAt: "2026-01-01T00:00:00Z" });
      const replacement = signed(attester, {
        events: [TRANSFER, SWAP],
        createdAt: "2026-02-01T00:00:00Z",
        supersedes: attestationHash(original.payload),
      });

      const result = resolveAttestations([original, replacement], {
        contractId: CONTRACT_ID,
        now: NOW,
      });

      expect(result.effective.map((r) => r.envelope)).toEqual([replacement]);
      expect(result.superseded.map((r) => r.envelope)).toEqual([original]);
    });

    it("follows a chain of supersessions", () => {
      const attester = Keypair.random();
      const v1 = signed(attester, { createdAt: "2026-01-01T00:00:00Z" });
      const v2 = signed(attester, {
        createdAt: "2026-02-01T00:00:00Z",
        supersedes: attestationHash(v1.payload),
      });
      const v3 = signed(attester, {
        createdAt: "2026-03-01T00:00:00Z",
        supersedes: attestationHash(v2.payload),
      });

      const result = resolveAttestations([v3, v1, v2], { contractId: CONTRACT_ID, now: NOW });

      expect(result.effective.map((r) => r.envelope)).toEqual([v3]);
      expect(result.superseded).toHaveLength(2);
    });

    it("ignores a supersession by a different attester", () => {
      const victim = Keypair.random();
      const attacker = Keypair.random();
      const original = signed(victim);
      const hostile = signed(attacker, {
        events: [SWAP],
        supersedes: attestationHash(original.payload),
      });

      const result = resolveAttestations([original, hostile], {
        contractId: CONTRACT_ID,
        now: NOW,
      });

      expect(result.effective).toHaveLength(2);
      expect(result.superseded).toEqual([]);
    });

    it("keeps the original retired when its replacement has itself expired", () => {
      const attester = Keypair.random();
      const original = signed(attester, { createdAt: "2026-01-01T00:00:00Z" });
      const replacement = signed(attester, {
        createdAt: "2026-02-01T00:00:00Z",
        expiresAt: "2026-03-01T00:00:00Z",
        supersedes: attestationHash(original.payload),
      });

      const result = resolveAttestations([original, replacement], {
        contractId: CONTRACT_ID,
        now: NOW,
      });

      expect(result.effective).toEqual([]);
      expect(result.superseded.map((r) => r.envelope)).toEqual([original]);
      expect(result.rejected).toMatchObject([{ code: "expired" }]);
    });
  });

  describe("rejections", () => {
    it("rejects an attestation for another contract", () => {
      const attester = Keypair.random();
      const result = resolveAttestations([signed(attester, { contractId: OTHER_CONTRACT_ID })], {
        contractId: CONTRACT_ID,
        now: NOW,
      });
      expect(result.rejected).toMatchObject([{ code: "wrong-contract" }]);
    });

    it("rejects a tampered envelope", () => {
      const attester = Keypair.random();
      const good = signed(attester);
      const tampered = { ...good, payload: { ...good.payload, events: [SWAP] } };
      const result = resolveAttestations([tampered], { contractId: CONTRACT_ID, now: NOW });
      expect(result.rejected).toMatchObject([{ code: "bad-signature" }]);
    });

    it("rejects an attestation for a stale WASM hash", () => {
      const attester = Keypair.random();
      const result = resolveAttestations([signed(attester)], {
        contractId: CONTRACT_ID,
        expectedWasmHash: "b".repeat(64),
        now: NOW,
      });
      expect(result.rejected).toMatchObject([{ code: "wasm-hash-mismatch" }]);
    });

    it("rejects an attestation signed under another domain", () => {
      const attester = Keypair.random();
      const envelope = signAttestation(document(attester.publicKey()), attester.secret(), {
        domain: "other-thing-v1",
      });
      const result = resolveAttestations([envelope], { contractId: CONTRACT_ID, now: NOW });
      expect(result.rejected).toMatchObject([{ code: "bad-signature" }]);
    });

    it("counts a duplicated envelope once", () => {
      const attester = Keypair.random();
      const envelope = signed(attester);
      const result = resolveAttestations([envelope, envelope], {
        contractId: CONTRACT_ID,
        now: NOW,
      });
      expect(result.effective).toHaveLength(1);
    });
  });
});

describe("resolveAttestationsWithDeployer", () => {
  it("looks the deployer up and classifies against it", async () => {
    const deployer = Keypair.random();
    const seen: string[] = [];
    const result = await resolveAttestationsWithDeployer(
      [signed(deployer)],
      async (contractId) => {
        seen.push(contractId);
        return deployer.publicKey();
      },
      { contractId: CONTRACT_ID, now: NOW },
    );
    expect(seen).toEqual([CONTRACT_ID]);
    expect(result.preferred?.trust).toBe("deployer");
  });

  it("treats a failing lookup as an unknown deployer instead of throwing", async () => {
    const attester = Keypair.random();
    const result = await resolveAttestationsWithDeployer(
      [signed(attester)],
      async () => {
        throw new Error("rpc down");
      },
      { contractId: CONTRACT_ID, now: NOW },
    );
    expect(result.preferred?.trust).toBe("unbound");
  });
});
