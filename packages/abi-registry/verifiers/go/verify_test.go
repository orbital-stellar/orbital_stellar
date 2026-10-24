package attestverify

import (
	"encoding/json"
	"os"
	"testing"
	"time"
)

const vectorsPath = "../../test-vectors/attestation-v1.json"

type vectors struct {
	Domain           string `json:"domain"`
	Sep53Prefix      string `json:"sep53Prefix"`
	Canonicalization []struct {
		Name      string          `json:"name"`
		Input     json.RawMessage `json:"input"`
		Canonical string          `json:"canonical"`
	} `json:"canonicalization"`
	Envelopes []struct {
		Name    string `json:"name"`
		Options struct {
			Domain           string `json:"domain"`
			Now              string `json:"now"`
			ExpectedWasmHash string `json:"expectedWasmHash"`
			CheckExpiry      *bool  `json:"checkExpiry"`
		} `json:"options"`
		Envelope json.RawMessage `json:"envelope"`
		Expected struct {
			Status string `json:"status"`
			Code   string `json:"code"`
		} `json:"expected"`
	} `json:"envelopes"`
}

func loadVectors(t *testing.T) vectors {
	t.Helper()
	raw, err := os.ReadFile(vectorsPath)
	if err != nil {
		t.Fatalf("reading vectors: %v", err)
	}
	var v vectors
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatalf("parsing vectors: %v", err)
	}
	if len(v.Canonicalization) == 0 || len(v.Envelopes) == 0 {
		t.Fatal("vectors file is empty")
	}
	return v
}

func TestConstantsMatchVectors(t *testing.T) {
	v := loadVectors(t)
	if v.Domain != DefaultDomain {
		t.Errorf("DefaultDomain = %q, vectors say %q", DefaultDomain, v.Domain)
	}
	if v.Sep53Prefix != SEP53Prefix {
		t.Errorf("SEP53Prefix = %q, vectors say %q", SEP53Prefix, v.Sep53Prefix)
	}
}

func TestCanonicalize(t *testing.T) {
	for _, c := range loadVectors(t).Canonicalization {
		t.Run(c.Name, func(t *testing.T) {
			got, err := Canonicalize(c.Input)
			if err != nil {
				t.Fatalf("Canonicalize: %v", err)
			}
			if string(got) != c.Canonical {
				t.Errorf("got  %s\nwant %s", got, c.Canonical)
			}
		})
	}
}

func TestCanonicalizeRejects(t *testing.T) {
	for name, doc := range map[string]string{
		"float":         `{"a":1.5}`,
		"exponent":      `{"a":1e3}`,
		"leading zero":  `{"a":01}`,
		"trailing data": `{"a":1} {"b":2}`,
		"not json":      `{`,
	} {
		t.Run(name, func(t *testing.T) {
			if got, err := Canonicalize([]byte(doc)); err == nil {
				t.Errorf("expected an error, got %s", got)
			}
		})
	}
}

func TestVerifyAgainstVectors(t *testing.T) {
	for _, e := range loadVectors(t).Envelopes {
		t.Run(e.Name, func(t *testing.T) {
			opts := Options{
				Domain:           e.Options.Domain,
				ExpectedWasmHash: e.Options.ExpectedWasmHash,
				SkipExpiry:       e.Options.CheckExpiry != nil && !*e.Options.CheckExpiry,
			}
			if e.Options.Now != "" {
				now, err := time.Parse(time.RFC3339, e.Options.Now)
				if err != nil {
					t.Fatalf("bad now %q: %v", e.Options.Now, err)
				}
				opts.Now = now
			}

			got := Verify(e.Envelope, opts)

			switch e.Expected.Status {
			case "valid":
				if !got.Valid {
					t.Errorf("want valid, got invalid (%s): %s", got.Code, got.Reason)
				}
			case "invalid":
				if got.Valid {
					t.Fatalf("want invalid (%s), got valid", e.Expected.Code)
				}
				if got.Code != e.Expected.Code {
					t.Errorf("code = %q, want %q (%s)", got.Code, e.Expected.Code, got.Reason)
				}
			default:
				t.Fatalf("unknown expected status %q", e.Expected.Status)
			}
		})
	}
}

func TestPublicKeyFromAddress(t *testing.T) {
	// Alice's address from the vectors: a valid G... address round-trips to 32 bytes.
	const alice = "GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR"
	key, err := publicKeyFromAddress(alice)
	if err != nil || len(key) != 32 {
		t.Fatalf("valid address rejected: key=%x err=%v", key, err)
	}
	for name, bad := range map[string]string{
		"empty":         "",
		"too short":     alice[:55],
		"bad checksum":  alice[:55] + "A",
		"contract addr": "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
		"lower case":    "gcfiry65oqe7dfp5klns2pf2lvzmuzyjx4ozieq36n2iqanub5xvyojr",
	} {
		if _, err := publicKeyFromAddress(bad); err == nil {
			t.Errorf("%s: expected an error", name)
		}
	}
}
