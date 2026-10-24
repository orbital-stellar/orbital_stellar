//! Reference verifier for Orbital attestation envelopes (version 1).
//!
//! Implements docs/sep/orbital-registry-sep.md section 5 and is checked
//! against the shared conformance suite in `test-vectors/attestation-v1.json`.
//! It verifies who signed what; deciding whether that signer may speak for a
//! contract (the trust tier) is left to the caller.

use base64::{engine::general_purpose::STANDARD, Engine as _};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde_json::Value;
use sha2::{Digest, Sha256};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

/// Domain of a contract event-schema attestation.
pub const DEFAULT_DOMAIN: &str = "orbital-attestation-v1";
/// Prepended to the signed message before hashing (SEP-53).
pub const SEP53_PREFIX: &str = "Stellar Signed Message:\n";

/// Why an envelope was rejected. Codes match the TypeScript implementation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Code {
    UnsupportedVersion,
    BadPublicKey,
    AttesterMismatch,
    BadSignature,
    MalformedExpiry,
    Expired,
    NotAWasmAttestation,
    WasmHashMismatch,
}

impl Code {
    pub fn as_str(self) -> &'static str {
        match self {
            Code::UnsupportedVersion => "unsupported-version",
            Code::BadPublicKey => "bad-public-key",
            Code::AttesterMismatch => "attester-mismatch",
            Code::BadSignature => "bad-signature",
            Code::MalformedExpiry => "malformed-expiry",
            Code::Expired => "expired",
            Code::NotAWasmAttestation => "not-a-wasm-attestation",
            Code::WasmHashMismatch => "wasm-hash-mismatch",
        }
    }
}

/// Knobs for a verification.
#[derive(Debug, Clone, Default)]
pub struct Options {
    /// Domain the envelope must have been signed under. `None` means [`DEFAULT_DOMAIN`].
    pub domain: Option<String>,
    /// Reference time for expiry. `None` means now.
    pub now: Option<OffsetDateTime>,
    /// Turns the expiry check off.
    pub skip_expiry: bool,
    /// If set, must match the payload's `wasmHash` (case-insensitive).
    pub expected_wasm_hash: Option<String>,
}

/// A rejection: a stable code and a human-readable reason.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rejection {
    pub code: Code,
    pub reason: String,
}

fn reject<T>(code: Code, reason: impl Into<String>) -> Result<T, Rejection> {
    Err(Rejection {
        code,
        reason: reason.into(),
    })
}

/// Checks an envelope's JSON against the rules in SEP section 5.5, in order,
/// returning on the first failure.
pub fn verify(envelope_json: &str, opts: &Options) -> Result<(), Rejection> {
    let envelope: Value = match serde_json::from_str(envelope_json) {
        Ok(v) => v,
        Err(e) => {
            return reject(
                Code::UnsupportedVersion,
                format!("envelope is not valid JSON: {e}"),
            )
        }
    };

    if envelope.get("v").map(|v| v.to_string()).as_deref() != Some("1") {
        return reject(
            Code::UnsupportedVersion,
            "envelope.v is not a supported version; expected 1",
        );
    }

    let public_key = envelope
        .get("publicKey")
        .and_then(Value::as_str)
        .unwrap_or("");
    let key_bytes = match public_key_from_address(public_key) {
        Some(k) => k,
        None => {
            return reject(
                Code::BadPublicKey,
                format!("publicKey {public_key:?} is not a valid Stellar account address"),
            )
        }
    };

    let payload = envelope.get("payload").cloned().unwrap_or(Value::Null);
    let attester = payload
        .get("attester")
        .and_then(Value::as_str)
        .unwrap_or("");
    if public_key != attester {
        return reject(
            Code::AttesterMismatch,
            format!("envelope.publicKey ({public_key:?}) does not match payload.attester ({attester:?})"),
        );
    }

    let domain = opts.domain.as_deref().unwrap_or(DEFAULT_DOMAIN);
    if !is_valid_domain(domain) {
        return reject(
            Code::BadSignature,
            format!("domain {domain:?} is malformed"),
        );
    }
    let canonical = match canonicalize(&payload) {
        Ok(c) => c,
        Err(e) => {
            return reject(
                Code::BadSignature,
                format!("payload cannot be canonicalized: {e}"),
            )
        }
    };
    let digest = Sha256::digest(format!("{SEP53_PREFIX}{domain}\n{canonical}").as_bytes());

    let signature = envelope
        .get("signature")
        .and_then(Value::as_str)
        .and_then(|s| STANDARD.decode(s).ok())
        .and_then(|b| Signature::from_slice(&b).ok());
    let verified = match (VerifyingKey::from_bytes(&key_bytes), signature) {
        (Ok(key), Some(sig)) => key.verify(&digest, &sig).is_ok(),
        _ => false,
    };
    if !verified {
        return reject(
            Code::BadSignature,
            "signature does not match payload and publicKey",
        );
    }

    if !opts.skip_expiry {
        if let Some(expires_at) = payload.get("expiresAt") {
            let Some(text) = expires_at.as_str() else {
                return reject(
                    Code::MalformedExpiry,
                    "payload.expiresAt is not an ISO 8601 timestamp",
                );
            };
            let Ok(expires) = OffsetDateTime::parse(text, &Rfc3339) else {
                return reject(
                    Code::MalformedExpiry,
                    format!("payload.expiresAt ({text:?}) is not an ISO 8601 timestamp"),
                );
            };
            let now = opts.now.unwrap_or_else(OffsetDateTime::now_utc);
            if expires <= now {
                return reject(Code::Expired, format!("attestation expired at {text}"));
            }
        }
    }

    if let Some(expected) = &opts.expected_wasm_hash {
        let kind = payload.get("executableKind").and_then(Value::as_str);
        let wasm_hash = payload.get("wasmHash").and_then(Value::as_str);
        let (Some("wasm"), Some(actual)) = (kind, wasm_hash) else {
            return reject(
                Code::NotAWasmAttestation,
                "an expected wasm hash was provided, but the payload is not a wasm attestation",
            );
        };
        if !actual.eq_ignore_ascii_case(expected) {
            return reject(
                Code::WasmHashMismatch,
                format!("payload.wasmHash ({actual:?}) does not match the on-chain WASM hash ({expected:?})"),
            );
        }
    }

    Ok(())
}

/// `^[a-z][a-z0-9-]*-v[1-9][0-9]*$`
fn is_valid_domain(domain: &str) -> bool {
    let Some(split) = domain.rfind("-v") else {
        return false;
    };
    let (name, version) = (&domain[..split], &domain[split + 2..]);
    let mut name_chars = name.chars();
    name_chars.next().is_some_and(|c| c.is_ascii_lowercase())
        && name_chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        && version
            .chars()
            .next()
            .is_some_and(|c| ('1'..='9').contains(&c))
        && version.chars().all(|c| c.is_ascii_digit())
}

/// Decodes a `G...` account address to its 32-byte ed25519 key, checking the
/// version byte and the CRC16-XModem checksum.
pub fn public_key_from_address(address: &str) -> Option<[u8; 32]> {
    if address.len() != 56 {
        return None;
    }
    let raw = data_encoding::BASE32_NOPAD
        .decode(address.as_bytes())
        .ok()?;
    if raw.len() != 35 || raw[0] != 6 << 3 {
        return None;
    }
    let sum = crc16_xmodem(&raw[..33]);
    if raw[33] != (sum & 0xff) as u8 || raw[34] != (sum >> 8) as u8 {
        return None;
    }
    raw[1..33].try_into().ok()
}

fn crc16_xmodem(data: &[u8]) -> u16 {
    let mut crc: u16 = 0;
    for &byte in data {
        crc ^= (byte as u16) << 8;
        for _ in 0..8 {
            crc = if crc & 0x8000 != 0 {
                (crc << 1) ^ 0x1021
            } else {
                crc << 1
            };
        }
    }
    crc
}

/// Serializes a JSON value as RFC 8785 canonical JSON, for the subset
/// attestation documents use: strings, booleans, `null`, arrays, objects and
/// integers. Floating-point numbers are rejected rather than guessed at.
///
/// Relies on serde_json's `arbitrary_precision` feature, which keeps a
/// number's source text so it can be written back unchanged.
pub fn canonicalize(value: &Value) -> Result<String, String> {
    let mut out = String::new();
    write_value(&mut out, value)?;
    Ok(out)
}

fn write_value(out: &mut String, value: &Value) -> Result<(), String> {
    match value {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => {
            let text = n.to_string();
            if !is_integer(&text) {
                return Err(format!("number {text:?} is not an integer"));
            }
            out.push_str(&text);
        }
        Value::String(s) => write_string(out, s),
        Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_value(out, item)?;
            }
            out.push(']');
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
            out.push('{');
            for (i, key) in keys.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_string(out, key);
                out.push(':');
                write_value(out, &map[*key])?;
            }
            out.push('}');
        }
    }
    Ok(())
}

fn is_integer(text: &str) -> bool {
    let digits = text.strip_prefix('-').unwrap_or(text);
    !digits.is_empty()
        && digits.bytes().all(|b| b.is_ascii_digit())
        && (digits.len() == 1 || !digits.starts_with('0'))
}

fn write_string(out: &mut String, s: &str) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}
