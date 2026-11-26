import { describe, expect, it } from "vitest";
import {
  EngineAlreadyStartedError,
  HorizonStreamError,
  InvalidIngestionModeError,
  NetworkMismatchError,
  SorobanRpcError,
  isSorobanRpcError,
} from "../src/errors.js";
import type { SorobanRpcErrorCode } from "../src/errors.js";

describe("HorizonStreamError", () => {
  it("uses the message from an Error", () => {
    const error = new HorizonStreamError(new Error("stream disconnected"));
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("HorizonStreamError");
    expect(error.message).toBe("stream disconnected");
  });

  it("uses a string or its fallback message", () => {
    expect(new HorizonStreamError("bad stream").message).toBe("bad stream");
    expect(new HorizonStreamError(null).message).toContain("Horizon SSE stream error");
    expect(new HorizonStreamError(42).message).toContain("Horizon SSE stream error");
  });

  it("reads numeric status and record headers", () => {
    const headers = { retry: "soon" };
    const error = new HorizonStreamError({ status: 429, headers });
    expect(error.status).toBe(429);
    expect(error.headers).toEqual(headers);
  });

  it("falls back from status to statusCode and ignores nonnumeric values", () => {
    expect(new HorizonStreamError({ statusCode: 503 }).status).toBe(503);
    expect(new HorizonStreamError({ status: 401, statusCode: 503 }).status).toBe(401);
    expect(
      new HorizonStreamError({ status: "429", headers: "not a record" }).status,
    ).toBeUndefined();
    expect(
      new HorizonStreamError({ status: "429", headers: "not a record" }).headers,
    ).toBeUndefined();
  });

  it("retains response metadata only when response is a record", () => {
    const response = { statusCode: 502, headers: { "retry-after": "5" } };
    const error = new HorizonStreamError({ response });
    expect(error.response).toEqual({ ...response, status: 502 });
    expect(new HorizonStreamError({ response: "no response" }).response).toBeUndefined();
    expect(
      new HorizonStreamError({ response: { status: 418, statusCode: 502 } }).response?.status,
    ).toBe(418);
    expect(
      new HorizonStreamError({ response: { status: "418", headers: null } }).response?.status,
    ).toBeUndefined();
  });
});

describe("simple domain errors", () => {
  it("names and describes an already-started engine", () => {
    const error = new EngineAlreadyStartedError();
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("EngineAlreadyStartedError");
    expect(error.message).not.toBe("");
  });

  it("reports the rejected ingestion mode", () => {
    const error = new InvalidIngestionModeError("surprise");
    expect(error.name).toBe("InvalidIngestionModeError");
    expect(error.message).toContain("surprise");
  });

  it("reports both network identities", () => {
    const error = new NetworkMismatchError("testnet", "mainnet");
    expect(error.name).toBe("NetworkMismatchError");
    expect(error.message).toContain("testnet");
    expect(error.message).toContain("mainnet");
  });
});

describe("SorobanRpcError", () => {
  const codes: SorobanRpcErrorCode[] = [
    "network",
    "rate_limit",
    "auth",
    "invalid_request",
    "server",
    "unknown",
  ];

  it.each(codes)("preserves the %s code and instanceof identity", (code) => {
    const error = new SorobanRpcError("RPC failed", { code, retryable: false });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("SorobanRpcError");
    expect(error.message).toBe("RPC failed");
    expect(error.code).toBe(code);
    expect(error.retryable).toBe(false);
    expect(isSorobanRpcError(error)).toBe(true);
  });

  it("preserves optional status, retry delay, and cause", () => {
    const cause = new Error("upstream");
    const error = new SorobanRpcError("throttled", {
      code: "rate_limit",
      retryable: true,
      status: 429,
      retryAfterMs: 5000,
      cause,
    });
    expect(error.status).toBe(429);
    expect(error.retryAfterMs).toBe(5000);
    expect(error.cause).toBe(cause);
    expect(error.retryable).toBe(true);
  });

  it("leaves absent optional metadata undefined", () => {
    const error = new SorobanRpcError("unknown", { code: "unknown", retryable: false });
    expect(error.status).toBeUndefined();
    expect(error.retryAfterMs).toBeUndefined();
  });

  it("rejects ordinary errors and lookalike objects", () => {
    expect(isSorobanRpcError(new Error("ordinary"))).toBe(false);
    expect(isSorobanRpcError({ name: "SorobanRpcError" })).toBe(false);
    expect(isSorobanRpcError(null)).toBe(false);
  });
});
