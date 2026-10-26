// Sample only the owned child. Completion requires both a result and exit 0.
import assert from "node:assert/strict";
import { fork, execFileSync } from "node:child_process";

export async function guardedNodeWorker(
  modulePath,
  args,
  { maxRssBytes, maxDurationMs, pollMs = 250, onProgress = () => {} },
) {
  assert(Number.isSafeInteger(maxRssBytes) && maxRssBytes > 0, "InvalidWorkerMemoryLimit");
  assert(Number.isSafeInteger(maxDurationMs) && maxDurationMs > 0, "InvalidWorkerTimeLimit");
  assert(Number.isSafeInteger(pollMs) && pollMs >= 10, "InvalidWorkerPollInterval");
  const child = fork(modulePath, args, {
    execArgv: ["--max-old-space-size=512", "--expose-gc"],
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let value,
    received = false,
    reason = null,
    lastProgress = null,
    peakRssBytes = 0,
    stderr = "",
    stdout = "",
    forced;
  const alive = () => child.exitCode === null && child.signalCode === null;
  const sample = () => {
    const raw = execFileSync("ps", ["-p", String(child.pid), "-o", "ppid=,rss="], {
      encoding: "utf8",
      timeout: 1000,
    });
    const match = /^\s*(\d+)\s+(\d+)\s*$/.exec(raw);
    assert(match && Number(match[1]) === process.pid, "WorkerOwnershipMismatch");
    const bytes = Number(match[2]) * 1024;
    assert(Number.isSafeInteger(bytes) && bytes >= 0, "InvalidWorkerMemoryObservation");
    return bytes;
  };
  const stop = (why) => {
    if (reason !== null) return;
    reason = why;
    if (!alive()) return;
    // The ChildProcess is still live; the fallback rechecks ownership before kill.
    child.kill("SIGTERM");
    forced = setTimeout(() => {
      if (!alive()) return;
      try {
        sample();
        child.kill("SIGKILL");
      } catch {
        /* Never kill an unverified PID. */
      }
    }, 2000);
    forced.unref();
  };
  const signals = ["SIGTERM", "SIGINT"].map((signal) => {
    const handler = () => stop(`External${signal}`);
    process.once(signal, handler);
    return [signal, handler];
  });
  for (const [stream, name] of [
    [child.stdout, "stdout"],
    [child.stderr, "stderr"],
  ]) {
    stream.setEncoding("utf8");
    stream.on("data", (data) => {
      const previous = name === "stderr" ? stderr : stdout;
      if (previous.length + data.length > 16384) stop("WorkerOutputLimitExceeded");
      if (name === "stderr") stderr = (previous + data).slice(0, 16384);
      else stdout = (previous + data).slice(0, 16384);
    });
  }
  child.on("message", (message) => {
    if (!message || typeof message !== "object") return stop("InvalidWorkerMessage");
    if (message.kind === "progress") {
      if (JSON.stringify(message).length > 8192) return stop("WorkerProgressLimitExceeded");
      lastProgress = message;
      try {
        onProgress(message);
      } catch {
        stop("WorkerObserverFailed");
      }
    } else if (message.kind === "result") {
      if (received) return stop("DuplicateWorkerResult");
      if (JSON.stringify(message).length > 16 * 1024 * 1024)
        return stop("WorkerResultLimitExceeded");
      received = true;
      value = message.value;
    } else stop("InvalidWorkerMessage");
  });
  child.on("error", () => stop("WorkerProcessError"));
  const timer = setInterval(() => {
    if (!alive() || reason !== null) return;
    try {
      peakRssBytes = Math.max(peakRssBytes, sample());
      if (peakRssBytes > maxRssBytes) stop("WorkerRssLimitExceeded");
    } catch {
      if (alive()) stop("WorkerMemoryObservationFailed");
    }
  }, pollMs);
  const deadline = setTimeout(() => stop("WorkerTimeLimitExceeded"), maxDurationMs);
  try {
    return await new Promise((resolve) =>
      child.once("close", (code, signal) => {
        const complete = reason === null && received && code === 0 && signal === null;
        resolve({
          complete,
          reason:
            reason ?? (complete ? null : received ? "WorkerExitFailed" : "MissingWorkerResult"),
          code,
          signal,
          pid: child.pid,
          peakRssBytes,
          lastProgress,
          stderr,
          stdout,
          ...(complete ? { value } : {}),
        });
      }),
    );
  } finally {
    clearInterval(timer);
    clearTimeout(deadline);
    clearTimeout(forced);
    for (const [signal, handler] of signals) process.removeListener(signal, handler);
  }
}
