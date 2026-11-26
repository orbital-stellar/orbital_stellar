import {
  MemorySubscriptionStore,
  SubscriptionError,
  SubscriptionService,
  type SubscriptionRecord,
  type SubscriptionTier,
} from "@orbital-stellar/worker-core";
import {
  readSubscriberClaim,
  verifySubscriberClaim,
  verifySubscriberRequest,
} from "@/lib/subscriberAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * `GET  /api/workers/subscriptions?subscriber=…` — a subscriber's own
 * subscriptions (20.5's "queryable by the subscriber", the read half 19.4
 * builds on).
 * `POST /api/workers/subscriptions` — create one.
 *
 * Both are signed by the subscriber. A request carries `x-orbital-subscriber`
 * (a `G...` account address), `x-orbital-timestamp` (unix time in
 * milliseconds) and `x-orbital-signature` (base64 ed25519), and the signature
 * is a SEP-53 signature, by that address's key, over
 *
 *   orbital-subscriptions-v1\n<METHOD>\n<path+query>\n<timestamp>\n<sha256 hex of body, or empty>
 *
 * The checks live in `lib/subscriberAuth.ts`, and `docs/api/workers.md` has a
 * signing example. A request that fails any of them gets the same 401.
 *
 * Replay is bounded, not prevented. There is no nonce store, so a captured
 * request can be sent again until its timestamp is more than five minutes
 * from server time: a replayed GET returns the same list, a replayed POST
 * creates the same subscription a second time. The host is not signed either,
 * so within those five minutes a request signed for one deployment is good on
 * another.
 *
 * The store here is in-process, which means it is per-instance and does not
 * survive a restart. That is deliberate and temporary: 20.5 owns the record
 * and its lifecycle, and the durable store lands with the rest of W2. Wiring
 * a half-designed schema into Postgres now would be the harder thing to undo.
 *
 * Nothing this route accepts or returns is a credential. There is no field to
 * send a key, an allowance or an address to draw from, because
 * `SubscriptionRecord` has none — see the type-level assertion in
 * `packages/worker-core/test/subscription/noAuthority.test-d.ts`. The
 * signature is not one either: it is good for one request, and the key that
 * made it never reaches the server.
 */

const MAX_BODY_BYTES = 4_096;

// One window is the payroll-shaped default the W0 tier is built around. The
// real value comes from the offering once 20.1 lands; the service only needs
// to be told which window it is in.
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const store = new MemorySubscriptionStore();
const subscriptions = new SubscriptionService({
  store,
  currentWindow: () => Math.floor(Date.now() / WINDOW_MS),
});

/**
 * The answer to a caller who has not proved who they are.
 *
 * The subscriber is read from a header rather than a body field, because a
 * subscriber id in the request body is a request to act as someone else. The
 * header alone is not believed either: it is anyone's to type, so the caller
 * must have signed this request with that address's key. Every failed check
 * gets this one response, so it does not tell a caller which check they
 * tripped.
 */
function unauthenticated(): Response {
  return Response.json(
    {
      error: "unauthenticated",
      message:
        "Sign the request as the subscriber: send x-orbital-subscriber, x-orbital-timestamp and x-orbital-signature.",
    },
    { status: 401 },
  );
}

function errorResponse(err: unknown): Response {
  if (err instanceof SubscriptionError) {
    const status =
      err.code === "NOT_FOUND"
        ? 404
        : err.code === "ALREADY_CANCELLED" || err.code === "INVALID_TRANSITION"
          ? 409
          : 400;
    return Response.json({ error: err.code, message: err.message }, { status });
  }
  return Response.json(
    { error: "internal_error", message: "Subscription request failed." },
    { status: 500 },
  );
}

/** The record as the API returns it. Explicit, so a new field is a decision. */
function present(record: SubscriptionRecord) {
  return {
    id: record.id,
    subscriber: record.subscriber,
    offering: record.offering,
    webhookTarget: record.webhookTarget,
    tier: record.tier,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    cancelEffectiveWindow: record.cancelEffectiveWindow,
    audit: record.audit,
  };
}

export async function GET(req: Request): Promise<Response> {
  const auth = verifySubscriberRequest(req);
  if (!auth.ok) return unauthenticated();
  // The address that signed, never the raw header.
  const subscriber = auth.subscriber;

  const requested = new URL(req.url).searchParams.get("subscriber");
  if (requested && requested !== subscriber) {
    // Scoped to the caller, always. A subscription is not sensitive because of
    // what it can do — it can do nothing — but it names an offering and a
    // webhook target, and neither is anyone else's to read.
    return Response.json(
      { error: "forbidden", message: "A subscriber may only read their own subscriptions." },
      { status: 403 },
    );
  }

  try {
    const records = await subscriptions.listBySubscriber(subscriber);
    return Response.json({ subscriptions: records.map(present) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request): Promise<Response> {
  // Turned away before the body is read: missing headers, a malformed
  // subscriber and a stale timestamp need nothing from the body.
  const claim = readSubscriberClaim(req.headers);
  if (!claim.ok) return unauthenticated();

  let body: { offering?: unknown; webhookTarget?: unknown; tier?: unknown };
  try {
    const raw = Buffer.from(await req.arrayBuffer());
    if (raw.byteLength > MAX_BODY_BYTES) {
      return Response.json(
        { error: "payload_too_large", message: `Body is capped at ${MAX_BODY_BYTES} bytes.` },
        { status: 413 },
      );
    }
    // The signature covers the bytes that arrived, so it is checked against
    // those bytes, before anything parses them.
    if (!verifySubscriberClaim(claim, req, raw)) return unauthenticated();

    const text = new TextDecoder().decode(raw);
    body = text ? (JSON.parse(text) as typeof body) : {};
  } catch {
    return Response.json({ error: "invalid_json", message: "Body must be JSON." }, { status: 400 });
  }
  // The address that signed, never the raw header.
  const subscriber = claim.subscriber;

  if (typeof body.offering !== "string" || typeof body.webhookTarget !== "string") {
    return Response.json(
      { error: "invalid_field", message: "offering and webhookTarget are required strings." },
      { status: 400 },
    );
  }

  try {
    const record = await subscriptions.create({
      // From the verified header, never the body: a body-supplied subscriber
      // id is a request to create a subscription in someone else's name.
      subscriber,
      offering: body.offering,
      webhookTarget: body.webhookTarget,
      tier: (body.tier as SubscriptionTier) ?? "time-insensitive",
    });
    return Response.json(present(record), { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
