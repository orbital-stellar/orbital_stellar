//! Runs the shared conformance suite against the Rust verifier.

use orbital_attestation_verify::{
    canonicalize, public_key_from_address, verify, Options, DEFAULT_DOMAIN, SEP53_PREFIX,
};
use serde_json::Value;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

fn vectors() -> Value {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../test-vectors/attestation-v1.json"
    );
    let raw = std::fs::read_to_string(path).expect("reading vectors");
    serde_json::from_str(&raw).expect("parsing vectors")
}

#[test]
fn constants_match_vectors() {
    let v = vectors();
    assert_eq!(v["domain"], DEFAULT_DOMAIN);
    assert_eq!(v["sep53Prefix"], SEP53_PREFIX);
}

#[test]
fn canonicalization_vectors() {
    let v = vectors();
    let cases = v["canonicalization"].as_array().unwrap();
    assert!(!cases.is_empty());
    for case in cases {
        let got = canonicalize(&case["input"]).unwrap_or_else(|e| panic!("{}: {e}", case["name"]));
        assert_eq!(got, case["canonical"].as_str().unwrap(), "{}", case["name"]);
    }
}

#[test]
fn canonicalization_rejects_floats() {
    for doc in [r#"{"a":1.5}"#, r#"{"a":1e3}"#, r#"{"a":01}"#] {
        // `01` is not valid JSON at all; either way it must not canonicalize.
        if let Ok(value) = serde_json::from_str::<Value>(doc) {
            assert!(canonicalize(&value).is_err(), "{doc}");
        }
    }
}

#[test]
fn envelope_vectors() {
    let v = vectors();
    let cases = v["envelopes"].as_array().unwrap();
    assert!(!cases.is_empty());
    for case in cases {
        let name = case["name"].as_str().unwrap();
        let o = &case["options"];
        let opts = Options {
            domain: o["domain"].as_str().map(String::from),
            now: o["now"]
                .as_str()
                .map(|s| OffsetDateTime::parse(s, &Rfc3339).unwrap()),
            skip_expiry: o["checkExpiry"] == Value::Bool(false),
            expected_wasm_hash: o["expectedWasmHash"].as_str().map(String::from),
        };
        let result = verify(&case["envelope"].to_string(), &opts);
        match case["expected"]["status"].as_str().unwrap() {
            "valid" => assert!(result.is_ok(), "{name}: want valid, got {result:?}"),
            "invalid" => {
                let rejection = result.expect_err(name);
                assert_eq!(
                    rejection.code.as_str(),
                    case["expected"]["code"].as_str().unwrap(),
                    "{name}: {}",
                    rejection.reason
                );
            }
            other => panic!("{name}: unknown expected status {other}"),
        }
    }
}

#[test]
fn addresses() {
    let alice = "GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR";
    assert!(public_key_from_address(alice).is_some());
    for bad in [
        "",
        &alice[..55],
        &format!("{}A", &alice[..55]),
        "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
        &alice.to_lowercase(),
    ] {
        assert!(public_key_from_address(bad).is_none(), "{bad}");
    }
}
