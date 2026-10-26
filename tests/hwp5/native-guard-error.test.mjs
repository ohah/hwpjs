import test from "node:test";
import assert from "node:assert/strict";
import { nativeGuardError } from "../../tools/native-guard-error.mjs";
import { processTreeRssRows, createRssObservations } from "../../tools/process-tree-rss.mjs";
import { spawn } from "node:child_process";

test("RSS snapshots scope descendants independently of table order and reject malformed or cyclic ownership", () => {
  assert.deepEqual(processTreeRssRows("30 20 4\n99 1 999999\n20 10 3\n10 1 2", 10), [
    [10, 1, 2],
    [20, 10, 3],
    [30, 20, 4],
  ]);
  assert.deepEqual(processTreeRssRows("99 1 999", 10), []);
  for (const value of ["10 1 NaN", "10 1 2\n10 1 3", "10 20 2\n20 10 3", "10 1 -2"])
    assert.throws(() => processTreeRssRows(value, 10));
});

test("RSS observation errors retain exact bounded diagnostics without masquerading as measured limits", () => {
  const monitor = createRssObservations(10),
    error = Object.assign(new Error("ps timed out"), { code: "ETIMEDOUT", signal: "SIGTERM" });
  assert.equal(monitor.failure(error).stop, false);
  assert.equal(monitor.snapshot().stopped, false);
  assert.equal(monitor.snapshot().consecutiveFailures, 1);
  assert.equal(monitor.observe(10).stop, false);
  assert.equal(monitor.snapshot().consecutiveFailures, 0);
  assert.equal(monitor.snapshot().failures, 1);
  assert.equal(monitor.snapshot().firstError.code, "ETIMEDOUT");
  const copy = monitor.snapshot();
  copy.firstError.message = "modified";
  assert.equal(monitor.snapshot().firstError.message, "ps timed out");
  for (const invalid of [-1, NaN, Infinity, undefined, "1"])
    assert.throws(() => monitor.observe(invalid), /InvalidRssTotal/);
  assert.equal(monitor.observe(11).stop, true);
  assert.equal(monitor.snapshot().maximumKiB, 11);
});

test("a live controlled process survives a sampler timeout and an unrelated process stays outside the limit scope", async (t) => {
  const start = () => {
    const child = spawn(
      process.execPath,
      [
        "-e",
        "process.stdout.write('ready');setInterval(()=>{},1000);setTimeout(()=>process.exit(0),60000).unref()",
      ],
      { detached: true, stdio: ["ignore", "pipe", "ignore"] },
    );
    const closed = new Promise((resolve) =>
      child.once("close", (code, signal) => resolve({ code, signal })),
    );
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) process.kill(-child.pid, "SIGTERM");
      await closed;
    });
    return {
      child,
      closed,
      ready: new Promise((resolve, reject) => {
        child.stdout.once("data", resolve);
        child.once("error", reject);
      }),
    };
  };
  const own = start(),
    unrelated = start();
  await Promise.all([own.ready, unrelated.ready]);
  const monitor = createRssObservations(10);
  assert.equal(
    monitor.failure(Object.assign(new Error("ps timeout"), { code: "ETIMEDOUT" })).stop,
    false,
  );
  process.kill(own.child.pid, 0);
  assert.equal(own.child.signalCode, null);
  const rows = processTreeRssRows(
    `${own.child.pid} ${process.pid} 1\n${unrelated.child.pid} ${process.pid} 100000`,
    own.child.pid,
  );
  assert.equal(monitor.observe(rows.reduce((sum, row) => sum + row[2], 0)).stop, false);
  assert.equal(monitor.snapshot().maximumKiB, 1);
  if (monitor.observe(11).stop) process.kill(-own.child.pid, "SIGTERM");
  assert.equal((await own.closed).signal, "SIGTERM");
  process.kill(unrelated.child.pid, 0);
  assert.equal(unrelated.child.signalCode, null);
});

test("native guard distinguishes process timeout from invalid measurement", () => {
  const timeout = Object.assign(new Error("footprint timed out"), {
    code: "ETIMEDOUT",
    status: null,
    signal: "SIGTERM",
    stderr: Buffer.from("observation failed"),
  });
  assert.deepEqual(nativeGuardError(timeout), {
    name: "Error",
    message: "footprint timed out",
    code: "ETIMEDOUT",
    status: null,
    signal: "SIGTERM",
    stderr: "observation failed",
  });
  assert.equal(nativeGuardError(new Error("InvalidPhysicalFootprint")).code, null);
  assert.equal(
    nativeGuardError(new Error("InvalidPhysicalFootprint")).message,
    "InvalidPhysicalFootprint",
  );
});

test("native guard bounds diagnostics and omits process buffers and unrelated fields", () => {
  const value = nativeGuardError({
    message: "x".repeat(1000),
    stderr: "y".repeat(2000),
    stdout: "never serialize",
    input: "never serialize",
    status: NaN,
  });
  assert.equal(value.message.length, 512);
  assert.equal(value.stderr.length, 1024);
  assert.equal(value.status, null);
  assert.equal(Object.hasOwn(value, "stdout"), false);
  assert.equal(Object.hasOwn(value, "input"), false);
  assert.equal(nativeGuardError(null).message, "UnknownObservationError");
});
