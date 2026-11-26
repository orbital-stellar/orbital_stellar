## Worker Verification & Operator APIs

### Get Verdicts
`GET /api/workers/verdicts`

Public, read-only audit trail for chain-derived verification verdicts (see
`docs/design/worker-verification-verdicts.md`). A subscriber can check
whether their worker fired without asking the operator or running an
indexer.

**Query Parameters:**
* `worker` (required): Subject address (account or contract) the verdicts were computed for.
* `start_ledger` (optional): Only verdicts whose window ends at or after this ledger.
* `end_ledger` (optional): Only verdicts whose window starts at or before this ledger.

**Responses:**
`{ meta: { schemaVersion }, data: Verdict[] }`. Rate limiting, caching and ETags come from the same read policy as `/api/registry-data/*` (#915/#918) - see `apps/web/lib/registryReadPolicy.ts`.

### Get Operator Score
`GET /api/workers/operators`

Public, read-only reputation score for one operator - the same data the
`/workers/[operator]` scorecard page renders.

**Query Parameters:**
* `operator` (required): The operator's id.

**Responses:**
`{ meta: { formulaVersion }, data: { score, metrics } }`, subject to the same read policy as above.

Both endpoints above are read-only: there is no route through which an operator (or
anyone else) can write a verdict or a score. Verdicts are chain-derived and
scores are folds over them (see `packages/worker-core/src/reputation/score.ts`).

## Worker Subscription API

### List and create subscriptions
`GET /api/workers/subscriptions` and `POST /api/workers/subscriptions`

A subscriber lists their own subscriptions, or creates one. These two are not
public. A subscriber is a Stellar account address, and an address in a header
is anyone's to type, so every request is signed with that address's key. The
checks are in `apps/web/lib/subscriberAuth.ts`.

**Headers (all three required):**
* `x-orbital-subscriber`: the subscriber's account address (`G...`).
* `x-orbital-timestamp`: the current unix time in milliseconds, as decimal digits.
* `x-orbital-signature`: the 64-byte ed25519 signature described below, in base64 (standard alphabet, with padding).

**What is signed.** Five lines joined by `\n`:

```text
orbital-subscriptions-v1
<METHOD>
<path+query>
<timestamp>
<sha256 hex of body, or empty>
```

* `<METHOD>` is the HTTP method in upper case.
* `<path+query>` is the path and query string exactly as requested, for example `/api/workers/subscriptions?subscriber=G...`. In JavaScript that is `url.pathname + url.search`.
* `<timestamp>` is the same string that is sent in `x-orbital-timestamp`.
* The last line is the lower-case SHA-256 hex of the request body's bytes. A request with no body ends with an empty line. That is not the hash of an empty string.

The message is signed as a [SEP-53](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0053.md)
message: the key signs `SHA-256("Stellar Signed Message:\n" + message)`. This is
the signature model registry attestations already use
(`packages/abi-registry/src/attestation.ts`), so any SEP-53-capable wallet or
library can produce it.

**Signing example (Node.js):**

```js
import { createHash } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";

const keypair = Keypair.fromSecret(process.env.SUBSCRIBER_SECRET);
const url = new URL("https://orbital.example/api/workers/subscriptions");
const body = JSON.stringify({
  offering: "payroll-backstop",
  webhookTarget: "https://hooks.example.com/orbital",
});

const timestamp = String(Date.now());
const message = [
  "orbital-subscriptions-v1",
  "POST",
  url.pathname + url.search,
  timestamp,
  createHash("sha256").update(body).digest("hex"), // "" when there is no body
].join("\n");
const digest = createHash("sha256").update("Stellar Signed Message:\n" + message).digest();

const res = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-orbital-subscriber": keypair.publicKey(),
    "x-orbital-timestamp": timestamp,
    "x-orbital-signature": keypair.sign(digest).toString("base64"),
  },
  body,
});
```

To check another implementation against this one: the key whose seed is 32
bytes of `0x07` has the address
`GDVEU3DD4KOFECV66VIHWEZOYX4ZKR3WV27L464SIIPOU2IUI3JCZA57`. For the request
above with the timestamp `1700000000000`, the body hashes to
`714fe8859a1a06f95032091e4894493ff1172044a4288cfbdf9bdd3011f9b2c5` and the
signature is
`Xy5Uh18JnO8f07TkBcxtdMLxoqtSYiYMDBIEmk1QZB3Y12je263x5x8VxbS4HYYzu/uW/1ENc6COY2Fe/BS5Bg==`.
`apps/web/test/subscriberAuth.test.ts` pins the same values.

**Requests:**
* `GET`: no body. An optional `subscriber` query parameter must be the signer's own address, and it is part of the signed path and query.
* `POST`: a JSON body of at most 4096 bytes, `{ offering, webhookTarget, tier? }`. The subscriber is always the signer. A `subscriber` field in the body is ignored.

**Responses:**
* `200` to a `GET`: `{ subscriptions: Subscription[] }`, the signer's own and nobody else's.
* `201` to a `POST`: the new `Subscription`.
* `401 { error: "unauthenticated" }`: a header is missing, the subscriber is not a valid account address, the timestamp is not plain digits or is more than five minutes from server time, or the signature does not match the request. The response is the same in every case and does not say which.
* `403`: a `GET` asked for another subscriber's subscriptions.
* `413`: the body is larger than 4096 bytes.
* `400`: the request was signed correctly, but its body is not JSON, lacks a field, or names an unusable webhook target or tier.

**Limits of the scheme:**
* Replay is bounded, not prevented. There is no nonce store, so a captured request can be sent again until its timestamp is more than five minutes from server time. A replayed `GET` returns the same list, and a replayed `POST` creates the same subscription a second time.
* The host is not part of the signed message, so within those five minutes a request signed for one deployment is accepted by another.
