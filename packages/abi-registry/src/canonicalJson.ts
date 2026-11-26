/**
 * Strict RFC 8785 (JSON Canonicalization Scheme) serializer.
 *
 * A signature is only as portable as the bytes it covers, so a verifier in
 * any language must be able to rebuild exactly the bytes that were signed
 * from the JSON it received. `JSON.stringify` with sorted keys is *almost*
 * that, but it silently drops `undefined` array slots to `null`, turns `NaN`
 * and `Infinity` into `null`, and accepts lone surrogates. A signer should be
 * told about those, not sign over them.
 *
 * Rules (all RFC 8785 §3.2):
 * - no insignificant whitespace;
 * - object members sorted by key, comparing UTF-16 code units (the default
 *   `Array.prototype.sort` order, and how JavaScript compares strings);
 * - strings and numbers serialized exactly as ECMAScript `JSON.stringify`
 *   does, which is what RFC 8785 specifies.
 *
 * Narrower than `JSON.stringify` on purpose: values outside the JSON data
 * model (`bigint`, `symbol`, functions, class instances, `NaN`, `Infinity`,
 * lone surrogates, `undefined` inside an array or at the top level) throw
 * {@link CanonicalJsonError}. An object property whose value is `undefined`
 * is treated as absent, matching how optional fields are written in this
 * package's TypeScript types.
 *
 * Portability: documents meant to be verified outside JavaScript should stick
 * to strings, booleans, `null` and integers. Floating-point number text is
 * defined by ECMAScript's number-to-string algorithm, which other languages
 * do not reproduce without help.
 */

/** Thrown when a value cannot be canonicalized. */
export class CanonicalJsonError extends Error {
  constructor(path: string, reason: string) {
    super(`[abi-registry] cannot canonicalize ${path}: ${reason}`);
    this.name = "CanonicalJsonError";
  }
}

const MAX_DEPTH = 64;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/**
 * Serializes `value` to its RFC 8785 canonical JSON text.
 *
 * @throws {CanonicalJsonError} if `value` is outside the JSON data model.
 */
export function canonicalizeJson(value: unknown): string {
  return serialize(value, "$", 0);
}

function serialize(value: unknown, path: string, depth: number): string {
  if (depth > MAX_DEPTH) {
    throw new CanonicalJsonError(path, `nesting deeper than ${MAX_DEPTH} levels`);
  }
  if (value === null) return "null";

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "string":
      if (LONE_SURROGATE.test(value)) {
        throw new CanonicalJsonError(path, "string contains a lone surrogate");
      }
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) {
        throw new CanonicalJsonError(path, `${String(value)} is not representable in JSON`);
      }
      return JSON.stringify(value);
    case "object":
      return Array.isArray(value)
        ? serializeArray(value, path, depth)
        : serializeObject(value as Record<string, unknown>, path, depth);
    default:
      throw new CanonicalJsonError(path, `${typeof value} is not part of the JSON data model`);
  }
}

function serializeArray(items: readonly unknown[], path: string, depth: number): string {
  const parts: string[] = [];
  for (let i = 0; i < items.length; i += 1) {
    parts.push(serialize(items[i], `${path}[${i}]`, depth + 1));
  }
  return `[${parts.join(",")}]`;
}

function serializeObject(obj: Record<string, unknown>, path: string, depth: number): string {
  const proto: unknown = Object.getPrototypeOf(obj);
  if (proto !== Object.prototype && proto !== null) {
    throw new CanonicalJsonError(path, "only plain objects are part of the JSON data model");
  }
  const parts: string[] = [];
  for (const key of Object.keys(obj).sort()) {
    const member = obj[key];
    if (member === undefined) continue;
    if (LONE_SURROGATE.test(key)) {
      throw new CanonicalJsonError(`${path}.${key}`, "key contains a lone surrogate");
    }
    parts.push(`${JSON.stringify(key)}:${serialize(member, `${path}.${key}`, depth + 1)}`);
  }
  return `{${parts.join(",")}}`;
}
