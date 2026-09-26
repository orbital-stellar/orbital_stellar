import { afterEach, describe, it, expect, vi } from "vitest";
import { createParser, run } from "../src/cli/index.js";

/**
 * Drive the parser in-process. `exitProcess(false)` keeps a validation
 * failure from killing the test runner, and the callback captures the
 * error and the help/usage text yargs would have printed.
 */
async function parse(args: string[]): Promise<{ output: string; error?: Error }> {
  let error: Error | undefined;
  let output = "";
  await createParser(args)
    .exitProcess(false)
    .parseAsync(args, (err: Error | undefined, _argv: unknown, out: string) => {
      error = err ?? undefined;
      output = out ?? "";
    })
    .catch((err: Error) => {
      error = err;
    });
  return { output, error };
}

describe("orbital-worker cli", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete process.env.CLI_TEST_SECRET;
  });

  it("prints help for every command", async () => {
    for (const command of ["register", "list", "inspect", "dry-run", "run"]) {
      const { output, error } = await parse([command, "--help"]);
      expect(error).toBeUndefined();
      expect(output).toContain(command);
      expect(output).toContain("--help");
    }
  });

  it("lists every command in the top-level help", async () => {
    const { output } = await parse(["--help"]);
    for (const command of ["register", "list", "inspect", "dry-run", "run"]) {
      expect(output).toContain(command);
    }
  });

  it("rejects a raw --secret value", async () => {
    const { error } = await parse(["register", "foo", "--secret", "rawsecret"]);
    // yargs swallows the coerce throw and surfaces the check() message.
    expect(error?.message).toContain("must reference env:VAR or file:PATH");
  });

  it("rejects an env: secret whose variable is unset", async () => {
    delete process.env.UNSET_TEST_VAR;
    const { error } = await parse(["register", "foo", "--secret", "env:UNSET_TEST_VAR"]);
    expect(error?.message).toContain("is not set");
  });

  it("demands a command", async () => {
    const { error } = await parse([]);
    expect(error?.message).toContain("You must specify a command");
  });

  it("registers a worker with parsed options and an environment secret", async () => {
    process.env.CLI_TEST_SECRET = "test-value";
    vi.spyOn(Date, "now").mockReturnValue(1_234);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { error } = await parse([
      "register",
      "nightly",
      "--schedule",
      "0 2 * * *",
      "--secret",
      "env:CLI_TEST_SECRET",
    ]);

    expect(error).toBeUndefined();
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({
      command: "register",
      worker: { id: "1234", name: "nightly", schedule: "0 2 * * *" },
      secretProvided: true,
    });
  });

  it("accepts a file-backed secret", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { error } = await parse(["register", "from-file", "--secret", "file:package.json"]);

    expect(error).toBeUndefined();
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      command: "register",
      secretProvided: true,
      worker: { name: "from-file", schedule: "*/5 * * * *" },
    });
  });

  it("lists registered workers", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { error } = await parse(["list"]);

    expect(error).toBeUndefined();
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({ workers: [] });
  });

  it("inspects a worker by name", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { error } = await parse(["inspect", "payments"]);

    expect(error).toBeUndefined();
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({
      worker: {
        id: "worker-payments",
        name: "payments",
        schedule: "*/5 * * * *",
      },
    });
  });

  it("prints a dry-run transaction without network access", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { error } = await parse(["dry-run", "payments"]);

    expect(error).toBeUndefined();
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({
      transaction: {
        to: `0x${"1".repeat(40)}`,
        amount: "1.25",
        data: "0x",
      },
      fee: { amount: "0.001", token: "ORB" },
      simulatedResponse: { status: "success", output: "null" },
    });
  });

  it("runs the scheduler for the requested number of iterations", async () => {
    vi.useFakeTimers();

    const parsing = createParser(["run", "--interval", "10", "--iterations", "2"])
      .exitProcess(false)
      .parseAsync();
    await vi.advanceTimersByTimeAsync(20);

    await expect(parsing).resolves.toBeDefined();
  });

  it("supports the worker-prefixed invocation", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await run(["worker", "list"]);

    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({ workers: [] });
  });

  it.each(["register", "inspect", "dry-run"])(
    "rejects a missing positional argument for %s",
    async (command) => {
      const { error } = await parse([command]);
      expect(error?.message).toContain("Not enough non-option arguments");
    },
  );

  it("rejects unknown options", async () => {
    const { error } = await parse(["list", "--unknown-option"]);
    expect(error?.message).toContain("unknown-option");
  });
});
