/**
 * Regenerates test-vectors/attestation-v1.json, the language-neutral
 * conformance suite for the attestation envelope.
 *
 *   pnpm exec tsx scripts/generate-attestation-vectors.ts
 *
 * Commit the result. `test/attestationVectors.test.ts` fails if the checked-in
 * file no longer matches what the implementation produces.
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAttestationVectors } from "../test/helpers/attestationVectors.js";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../test-vectors/attestation-v1.json");

writeFileSync(target, `${JSON.stringify(buildAttestationVectors(), null, 2)}\n`);
console.log(`wrote ${target}`);
