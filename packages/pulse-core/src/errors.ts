function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

/** Error raised when a Horizon SSE stream fails unexpectedly. */
export class HorizonStreamError extends Error {
  readonly status?: number;
  readonly statusCode?: number;
  readonly response?: {
    status?: number;
    statusCode?: number;
    headers?: unknown;
  };
  readonly headers?: unknown;

  constructor(error: unknown) {
    super(
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "[pulse-core] Horizon SSE stream error",
    );
    this.name = "HorizonStreamError";

    if (isRecord(error)) {
      const status = toNumber(error.status ?? error.statusCode);
      const statusCode = toNumber(error.statusCode ?? error.status);
      if (status !== undefined) this.status = status;
      if (statusCode !== undefined) this.statusCode = statusCode;

      if (isRecord(error.headers)) {
        this.headers = error.headers;
      }

      const response = error.response;
      if (isRecord(response)) {
        this.response = {
          status: toNumber(response.status ?? response.statusCode),
          statusCode: toNumber(response.statusCode ?? response.status),
          headers: response.headers,
        };
      }
    }
  }
}

/** Error raised when a caller starts an engine that is already running. */
export class EngineAlreadyStartedError extends Error {
  constructor() {
    super("[pulse-core] EventEngine.start() called while the SSE stream is already active.");
    this.name = "EngineAlreadyStartedError";
  }
}

/** Error raised when the configured ingestion mode is unsupported. */
export class InvalidIngestionModeError extends Error {
  constructor(value: unknown) {
    super(
      `[pulse-core] CoreConfig.ingestion: invalid value ${JSON.stringify(value)}. Must be "unified", "horizon", or "auto".`,
    );
    this.name = "InvalidIngestionModeError";
  }
}

export class NetworkMismatchError extends Error {
  constructor(expected: string, actual: string) {
    super(
      `[pulse-core] Soroban RPC network mismatch: expected passphrase "${expected}", got "${actual}"`,
    );
    this.name = "NetworkMismatchError";
  }
}

/**
 * Why a Soroban RPC request failed, as {@link SorobanRpcError.code}. Branch on
 * it instead of parsing the message. `SorobanRpcClient` assigns:
 *
 * - `"network"`: the request failed before any response arrived.
 * - `"rate_limit"`: HTTP 429.
 * - `"auth"`: HTTP 401 or 403.
 * - `"server"`: HTTP 5xx, a JSON-RPC server error (-32000 to -32099), or a
 *   transaction that `pollTransaction` did not see land in time.
 * - `"invalid_request"`: any other HTTP 4xx or JSON-RPC error, or a response
 *   that is not valid JSON or lacks the expected result.
 * - `"unknown"`: any other unsuccessful HTTP status.
 */
export type SorobanRpcErrorCode =
  "network" | "rate_limit" | "auth" | "invalid_request" | "server" | "unknown";

/**
 * What a {@link SorobanRpcError} is built with besides its message: its `code`,
 * whether a retry can help, and optionally the HTTP status, the server's retry
 * delay and the underlying cause. Pass it when you throw one from your own
 * `SorobanRpc` implementation, since `SorobanSubscriber` retries only errors
 * marked `retryable`.
 */
export type SorobanRpcErrorOptions = {
  code: SorobanRpcErrorCode;
  retryable: boolean;
  status?: number;
  retryAfterMs?: number;
  cause?: unknown;
};

/** Failure returned or wrapped from a Soroban RPC request. */
export class SorobanRpcError extends Error {
  readonly code: SorobanRpcErrorCode;
  readonly retryable: boolean;
  readonly status?: number;
  readonly retryAfterMs?: number;
  override readonly cause?: unknown;

  constructor(message: string, options: SorobanRpcErrorOptions) {
    super(message);
    this.name = "SorobanRpcError";
    this.code = options.code;
    this.retryable = options.retryable;
    if (options.status !== undefined) {
      this.status = options.status;
    }
    if (options.retryAfterMs !== undefined) {
      this.retryAfterMs = options.retryAfterMs;
    }
    this.cause = options.cause;
  }
}

/**
 * Returns true when the value is a Soroban RPC error instance.
 *
 * @param error - Any caught value.
 * @returns `true` if `error` is a {@link SorobanRpcError}.
 */
export function isSorobanRpcError(error: unknown): error is SorobanRpcError {
  return error instanceof SorobanRpcError;
}
