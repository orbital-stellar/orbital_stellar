// Package attestverify verifies Orbital attestation envelopes (version 1).
//
// It is a reference verifier for the format specified in
// docs/sep/orbital-registry-sep.md section 5, checked against the shared
// conformance suite in test-vectors/attestation-v1.json. It verifies who
// signed what; deciding whether that signer may speak for a contract (the
// trust tier) is left to the caller.
package attestverify

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"
)

const (
	// DefaultDomain is the domain of a contract event-schema attestation.
	DefaultDomain = "orbital-attestation-v1"
	// SEP53Prefix is prepended to the signed message before hashing.
	SEP53Prefix = "Stellar Signed Message:\n"
	// EnvelopeVersion is the only envelope version this package accepts.
	EnvelopeVersion = 1
)

var domainPattern = regexp.MustCompile(`^[a-z][a-z0-9-]*-v[1-9][0-9]*$`)

// Rejection codes, identical to the TypeScript implementation's.
const (
	CodeUnsupportedVersion  = "unsupported-version"
	CodeBadPublicKey        = "bad-public-key"
	CodeAttesterMismatch    = "attester-mismatch"
	CodeBadSignature        = "bad-signature"
	CodeMalformedExpiry     = "malformed-expiry"
	CodeExpired             = "expired"
	CodeNotAWasmAttestation = "not-a-wasm-attestation"
	CodeWasmHashMismatch    = "wasm-hash-mismatch"
)

// Options tune a verification.
type Options struct {
	// Domain the envelope must have been signed under. Empty means DefaultDomain.
	Domain string
	// Now is the reference time for expiry. The zero value means time.Now().
	Now time.Time
	// SkipExpiry turns the expiry check off.
	SkipExpiry bool
	// ExpectedWasmHash, if set, must match the payload's wasmHash
	// (case-insensitive), and the payload must be a "wasm" attestation.
	ExpectedWasmHash string
}

// Result is a verification outcome.
type Result struct {
	Valid  bool
	Code   string
	Reason string
}

func invalid(code, format string, args ...any) Result {
	return Result{Code: code, Reason: fmt.Sprintf(format, args...)}
}

type envelope struct {
	V         json.RawMessage `json:"v"`
	Payload   json.RawMessage `json:"payload"`
	PublicKey string          `json:"publicKey"`
	Signature string          `json:"signature"`
}

// Verify checks an envelope's JSON against the rules in SEP section 5.5, in
// order, returning on the first failure.
func Verify(envelopeJSON []byte, opts Options) Result {
	var env envelope
	if err := json.Unmarshal(envelopeJSON, &env); err != nil {
		return invalid(CodeUnsupportedVersion, "envelope is not valid JSON: %v", err)
	}

	if string(env.V) != "1" {
		return invalid(CodeUnsupportedVersion, "envelope.v (%s) is not a supported version; expected %d",
			orNull(env.V), EnvelopeVersion)
	}

	pub, err := publicKeyFromAddress(env.PublicKey)
	if err != nil {
		return invalid(CodeBadPublicKey, "publicKey %q is not a valid Stellar account address", env.PublicKey)
	}

	var payload struct {
		Attester       string          `json:"attester"`
		ExpiresAt      json.RawMessage `json:"expiresAt"`
		ExecutableKind string          `json:"executableKind"`
		WasmHash       *string         `json:"wasmHash"`
	}
	if err := json.Unmarshal(env.Payload, &payload); err != nil {
		return invalid(CodeAttesterMismatch, "payload is not a JSON object: %v", err)
	}
	if env.PublicKey != payload.Attester {
		return invalid(CodeAttesterMismatch, "envelope.publicKey (%q) does not match payload.attester (%q)",
			env.PublicKey, payload.Attester)
	}

	domain := opts.Domain
	if domain == "" {
		domain = DefaultDomain
	}
	if !domainPattern.MatchString(domain) {
		return invalid(CodeBadSignature, "domain %q is malformed", domain)
	}
	canonical, err := Canonicalize(env.Payload)
	if err != nil {
		return invalid(CodeBadSignature, "payload cannot be canonicalized: %v", err)
	}
	digest := sha256.Sum256([]byte(SEP53Prefix + domain + "\n" + string(canonical)))
	sig, err := base64.StdEncoding.DecodeString(env.Signature)
	if err != nil || len(sig) != ed25519.SignatureSize || !ed25519.Verify(pub, digest[:], sig) {
		return invalid(CodeBadSignature, "signature does not match payload and publicKey")
	}

	if !opts.SkipExpiry && len(payload.ExpiresAt) > 0 {
		now := opts.Now
		if now.IsZero() {
			now = time.Now()
		}
		var raw string
		if err := json.Unmarshal(payload.ExpiresAt, &raw); err != nil {
			return invalid(CodeMalformedExpiry, "payload.expiresAt (%s) is not an ISO 8601 timestamp", payload.ExpiresAt)
		}
		expiresAt, err := time.Parse(time.RFC3339Nano, raw)
		if err != nil {
			return invalid(CodeMalformedExpiry, "payload.expiresAt (%q) is not an ISO 8601 timestamp", raw)
		}
		if !expiresAt.After(now) {
			return invalid(CodeExpired, "attestation expired at %s", raw)
		}
	}

	if opts.ExpectedWasmHash != "" {
		if payload.ExecutableKind != "wasm" || payload.WasmHash == nil {
			return invalid(CodeNotAWasmAttestation,
				"an expected wasm hash was provided, but payload.executableKind is %q", payload.ExecutableKind)
		}
		if !strings.EqualFold(opts.ExpectedWasmHash, *payload.WasmHash) {
			return invalid(CodeWasmHashMismatch, "payload.wasmHash (%q) does not match the on-chain WASM hash (%q)",
				*payload.WasmHash, opts.ExpectedWasmHash)
		}
	}

	return Result{Valid: true}
}

func orNull(raw json.RawMessage) string {
	if len(raw) == 0 {
		return "null"
	}
	return string(raw)
}
