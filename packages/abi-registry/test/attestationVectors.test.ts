import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyAttestation, type AttestationEnvelope } from "../src/attestation.js";
import { canonicalizeJson } from "../src/canonicalJson.js";
import { buildAttestationVectors } from "./helpers/attestationVectors.js";

const here = dirname(fileURLToPath(import.meta.url));
const vectorsPath = resolve(here, "../test-vectors/attestation-v1.json");

const onDisk = JSON.parse(readFileSync(vectorsPath, "utf-8")) as ReturnType<
  typeof buildAttestationVectors
>;

describe("test-vectors/attestation-v1.json", () => {
  it("matches what the implementation generates (run scripts/generate-attestation-vectors.ts if not)", () => {
    expect(onDisk).toEqual(JSON.parse(JSON.stringify(buildAttestationVectors())));
  });

  describe("canonicalization", () => {
    it.each(onDisk.canonicalization.map((c) => [c.name, c] as const))("%s", (_name, c) => {
      expect(canonicalizeJson(c.input)).toBe(c.canonical);
    });
  });

  describe("envelopes", () => {
    it.each(onDisk.envelopes.map((e) => [e.name, e] as const))("%s", (_name, vector) => {
      const verdict = verifyAttestation(vector.envelope as AttestationEnvelope, {
        domain: vector.options.domain,
        expectedWasmHash: vector.options.expectedWasmHash,
        checkExpiry: vector.options.checkExpiry,
        now: vector.options.now === undefined ? undefined : new Date(vector.options.now),
      });
      expect(verdict.status).toBe(vector.expected.status);
      if (vector.expected.status === "invalid") {
        expect(verdict).toMatchObject({ code: vector.expected.code });
      }
    });
  });

  it("covers every rejection code the verifier can return", () => {
    const codes = new Set(
      onDisk.envelopes.flatMap((e) => (e.expected.status === "invalid" ? [e.expected.code] : [])),
    );
    expect([...codes].sort()).toEqual(
      [
        "attester-mismatch",
        "bad-public-key",
        "bad-signature",
        "expired",
        "malformed-expiry",
        "not-a-wasm-attestation",
        "unsupported-version",
        "wasm-hash-mismatch",
      ].sort(),
    );
  });
});

describe("attestation schemas", () => {
  const readSchema = (file: string) =>
    JSON.parse(readFileSync(resolve(here, "../schemas", file), "utf-8")) as object;

  // attestation.schema.json declares JSON Schema 2020-12, so it needs ajv's
  // 2020 entry point rather than the draft-07 default export.
  const ajv = new Ajv2020({ allErrors: true });
  ajv.addFormat("date-time", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/);
  const validateEnvelope = ajv.compile(readSchema("attestation-envelope.schema.json"));
  const validateDocument = ajv.compile(readSchema("attestation.schema.json"));

  // Only default-domain envelopes carry contract event-schema documents.
  const validVectors = onDisk.envelopes.filter(
    (e) => e.expected.status === "valid" && e.options.domain === undefined,
  );

  it.each(validVectors.map((e) => [e.name, e] as const))(
    "%s: envelope and payload match their schemas",
    (_name, vector) => {
      expect(validateEnvelope(vector.envelope)).toBe(true);
      expect(validateDocument((vector.envelope as { payload: unknown }).payload)).toBe(true);
    },
  );

  it("rejects an envelope with no version, or a signature of the wrong length", () => {
    const { envelope } = validVectors[0]!;
    const { v: _v, ...unversioned } = envelope as Record<string, unknown>;
    expect(validateEnvelope(unversioned)).toBe(false);
    expect(validateEnvelope({ ...(envelope as object), signature: "AAAA" })).toBe(false);
    expect(validateEnvelope({ ...(envelope as object), v: 2 })).toBe(false);
  });
});
