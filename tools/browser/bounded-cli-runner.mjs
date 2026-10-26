import { spawn, execFileSync } from "node:child_process";
import {
  accessSync,
  constants,
  readFileSync,
  realpathSync,
  statSync,
  openSync,
  readSync,
  closeSync,
} from "node:fs";
import { delimiter, dirname, isAbsolute, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { StringDecoder } from "node:string_decoder";

// Reviewed installed wrapper's complete source, not a trusted package name/path.
// Unknown wrapper contents use the verified, owned process-group fallback.
const reviewedShim = "87b61c624ffe024ff10563c0623e9d487e20a2fb86f8d6443523839b2e06cacc";
export function fileFingerprint(path) {
  const canonical = realpathSync(path),
    stat = statSync(canonical),
    hash = createHash("sha256");
  if (!stat.isFile()) throw Error("CliInputNotRegularFile");
  const fd = openSync(canonical, "r");
  try {
    const buffer = Buffer.alloc(65536);
    let count;
    while ((count = readSync(fd, buffer, 0, buffer.length, null)))
      hash.update(buffer.subarray(0, count));
  } finally {
    closeSync(fd);
  }
  return {
    path: canonical,
    sha256: hash.digest("hex"),
    bytes: stat.size,
    identity: [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.mode],
  };
}
function nativeMagic(path) {
  const fd = openSync(path, "r"),
    b = Buffer.alloc(4);
  try {
    return (
      readSync(fd, b, 0, 4, 0) === 4 &&
      ["cffaedfe", "feedfacf", "cefaedfe", "feedface", "cafebabe", "bebafeca", "7f454c46"].includes(
        b.toString("hex"),
      )
    );
  } finally {
    closeSync(fd);
  }
}
function findExecutable(cli, pathValue) {
  for (const path of isAbsolute(cli) || cli.includes("/")
    ? [resolve(cli)]
    : pathValue
        .split(delimiter)
        .filter(Boolean)
        .map((dir) => resolve(dir, cli))) {
    try {
      accessSync(path, constants.X_OK);
      if (statSync(path).isFile()) return realpathSync(path);
    } catch {
      /* Try next PATH entry only. */
    }
  }
  throw Error("BrowserCliNotFound");
}
export function inspectBrowserCli({
  cli = "agent-browser",
  pathValue = process.env.PATH ?? "",
  platform = process.platform,
  arch = process.arch,
} = {}) {
  const path = findExecutable(cli, pathValue),
    launcher = fileFingerprint(path);
  if (nativeMagic(path))
    return {
      mode: "native-direct",
      launcher,
      executable: launcher,
      package: null,
      reason: "PATH executable is already native",
    };
  const source = readFileSync(path, "utf8");
  let pkg;
  for (let dir = dirname(path), depth = 0; depth < 6; dir = dirname(dir), depth++) {
    try {
      const metadataPath = join(dir, "package.json"),
        data = JSON.parse(readFileSync(metadataPath, "utf8"));
      const bins = typeof data.bin === "string" ? [data.bin] : Object.values(data.bin ?? {});
      if (bins.some((bin) => typeof bin === "string" && realpathSync(resolve(dir, bin)) === path)) {
        pkg = {
          root: dir,
          name: data.name,
          version: data.version,
          metadata: fileFingerprint(metadataPath),
        };
        break;
      }
    } catch {
      /* Unrelated or incomplete package metadata is not trusted. */
    }
  }
  if (
    launcher.sha256 === reviewedShim &&
    pkg &&
    platform === "darwin" &&
    ["arm64", "x64"].includes(arch) &&
    /^#!.*node/.test(source) &&
    source.includes("spawn(binaryPath, process.argv.slice(2)")
  ) {
    const sibling = join(dirname(path), `agent-browser-darwin-${arch}`);
    try {
      accessSync(sibling, constants.X_OK);
      const canonical = realpathSync(sibling);
      if (
        !relative(pkg.root, canonical).startsWith("..") &&
        dirname(canonical) === dirname(path) &&
        nativeMagic(canonical)
      ) {
        return {
          mode: "native-direct",
          launcher,
          executable: fileFingerprint(canonical),
          package: pkg,
          reason:
            "Reviewed shim hash + package bin identity + platform mapping + executable native header verified",
        };
      }
    } catch {
      /* Never chmod, install or execute a probe to establish trust. */
    }
  }
  return {
    mode: "owned-group-fallback",
    launcher,
    executable: launcher,
    package: pkg ?? null,
    reason: "Unrecognized/unverifiable shim; owned launcher handshake required",
  };
}
function pgid(pid) {
  try {
    return (
      Number(
        execFileSync("/bin/ps", ["-o", "pgid=", "-p", String(pid)], {
          encoding: "utf8",
          timeout: 1000,
        }).trim(),
      ) || null
    );
  } catch {
    return null;
  }
}
const groupExists = (id) => {
  try {
    process.kill(-id, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
};
export class BoundedCliError extends Error {
  constructor(record) {
    super(`BrowserCli:${record.code ?? record.status ?? record.signal ?? "failed"}`);
    this.name = "BoundedCliError";
    this.record = record;
    this.stdout = record.stdout;
    this.stderr = record.stderr;
    this.status = record.status;
    this.signal = record.signal;
    this.code = record.code;
  }
}
export function createBoundedCliRunner(
  identity,
  {
    timeoutMs = 45000,
    graceMs = 250,
    maxBytes = 2 * 1024 * 1024,
    env = process.env,
    onRecord = () => {},
    onStart = () => {},
    spawnProcess = spawn,
    getPgid = pgid,
    hasGroup = groupExists,
    killGroup = (id, signal) => process.kill(-id, signal),
    checkIdentity = true,
  } = {},
) {
  if (![timeoutMs, graceMs, maxBytes].every((n) => Number.isSafeInteger(n) && n > 0))
    throw Error("InvalidCliBudget");
  if (!["darwin", "linux"].includes(process.platform)) throw Error("PosixOwnedCliGroupsRequired");
  const records = [];
  let active = false,
    sequence = 0,
    abortActive = async () => {};
  async function run(args) {
    if (active) throw Error("ConcurrentBrowserCliCommand");
    active = true;
    const start = process.hrtime.bigint(),
      record = {
        id: ++sequence,
        args: [...args],
        executable: identity.executable.path,
        mode: identity.mode,
        startMonotonicNs: String(start),
        startedAt: new Date().toISOString(),
        status: null,
        signal: null,
        code: null,
        stdout: "",
        stderr: "",
        truncated: false,
        timedOut: false,
        budget: { timeoutMs, graceMs, maxBytesPerStream: maxBytes },
        processGroup: { pid: null, observedPgid: null, verified: false, cleanup: "not-needed" },
      };
    const decoders = { stdout: new StringDecoder("utf8"), stderr: new StringDecoder("utf8") };
    const finish = () => {
      record.stdout += decoders.stdout.end();
      record.stderr += decoders.stderr.end();
      abortActive = async () => {};
      record.endMonotonicNs = String(process.hrtime.bigint());
      record.elapsedMs = Number(BigInt(record.endMonotonicNs) - start) / 1e6;
      records.push(record);
      active = false;
      onRecord(record);
    };
    try {
      onStart({ ...record });
      if (checkIdentity) {
        const current = realpathSync(identity.executable.path),
          s = statSync(current);
        if (
          current !== identity.executable.path ||
          JSON.stringify([s.dev, s.ino, s.size, s.mtimeMs, s.mode]) !==
            JSON.stringify(identity.executable.identity)
        )
          throw Error("CliExecutableChangedSinceInspection");
      }
      await new Promise((yes, no) => {
        let child,
          timer,
          terminating = false,
          settled = false,
          ready = "",
          stdoutBytes = 0,
          stderrBytes = 0;
        const fallback = identity.mode !== "native-direct";
        const end = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          (record.code || record.status !== 0 || record.signal ? no : yes)();
        };
        const verify = () => {
          const group = record.processGroup;
          group.observedPgid = getPgid(child.pid);
          group.verified =
            group.observedPgid === child.pid &&
            group.observedPgid !== getPgid(process.pid) &&
            child.pid > 1;
          return group.verified;
        };
        const stop = async (code) => {
          if (terminating || settled) return;
          terminating = true;
          record.code = code;
          record.timedOut = code === "ETIMEDOUT";
          const group = record.processGroup;
          try {
            if (hasGroup(child.pid)) {
              if (!group.verified && !verify()) {
                group.cleanup = "refused-unverified-group";
                child.kill("SIGKILL");
              } else {
                killGroup(child.pid, "SIGTERM");
                await pause(graceMs);
                if (hasGroup(child.pid)) killGroup(child.pid, "SIGKILL");
                for (let i = 0; i < 10 && hasGroup(child.pid); i++) await pause(25);
                group.cleanup = hasGroup(child.pid) ? "group-still-present" : "group-gone";
              }
            } else group.cleanup = "group-gone";
          } catch (error) {
            group.cleanup = "cleanup-error";
            group.error = String(error);
          }
          end();
        };
        abortActive = stop;
        try {
          child = spawnProcess(
            fallback ? process.execPath : identity.executable.path,
            fallback
              ? [
                  fileURLToPath(new URL("./owned-cli-launch.mjs", import.meta.url)),
                  identity.executable.path,
                  ...args,
                ]
              : args,
            {
              detached: true,
              shell: false,
              env,
              stdio: fallback ? ["pipe", "pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
            },
          );
        } catch (error) {
          record.code = error.code ?? "SPAWN_ERROR";
          record.stderr = String(error);
          end();
          return;
        }
        record.processGroup.pid = child.pid ?? null;
        const append = (key, chunk) => {
          const data = Buffer.from(chunk),
            used = key === "stdout" ? stdoutBytes : stderrBytes;
          record[key] += decoders[key].write(data.subarray(0, Math.max(0, maxBytes - used)));
          if (key === "stdout") stdoutBytes += data.length;
          else stderrBytes += data.length;
          if (used + data.length > maxBytes) {
            record.truncated = true;
            void stop("MAX_BUFFER");
          }
        };
        child.stdout.on("data", (data) => append("stdout", data));
        child.stderr.on("data", (data) => append("stderr", data));
        child.once("error", (error) => {
          record.code = error.code ?? "SPAWN_ERROR";
          record.stderr += String(error);
          end();
        });
        child.once("exit", (status, signal) => {
          record.status = status;
          record.signal = signal;
        });
        child.once("close", (status, signal) => {
          record.status = status;
          record.signal = signal;
          if (!terminating) {
            try {
              if (child.pid && hasGroup(child.pid)) void stop("OWNED_GROUP_NOT_QUIESCENT");
              else end();
            } catch {
              void stop("PROCESS_GROUP_INSPECTION_FAILURE");
            }
          }
        });
        child.once("spawn", () => {
          if (!fallback) {
            try {
              verify();
            } catch {
              void stop("PROCESS_GROUP_INSPECTION_FAILURE");
            }
          }
        });
        child.stdout.on("error", () => {
          void stop("STDOUT_IO_ERROR");
        });
        child.stderr.on("error", () => {
          void stop("STDERR_IO_ERROR");
        });
        child.stdin?.on?.("error", () => {
          void stop("HANDSHAKE_IO_ERROR");
        });
        if (fallback)
          child.stdio[3].on("error", () => {
            void stop("HANDSHAKE_IO_ERROR");
          });
        if (fallback)
          child.stdio[3].on("data", (data) => {
            if (ready.includes("\n")) return;
            ready += String(data);
            if (ready.length > 1024) {
              void stop("INVALID_OWNED_LAUNCHER");
              return;
            }
            if (!ready.includes("\n")) return;
            try {
              if (JSON.parse(ready.split("\n")[0]).pid !== child.pid || !verify())
                throw Error("UnverifiedOwnedGroup");
              child.stdin.end("GO\n");
            } catch {
              void stop("UNVERIFIED_PROCESS_GROUP");
            }
          });
        timer = setTimeout(() => {
          void stop("ETIMEDOUT");
        }, timeoutMs);
      });
    } catch (error) {
      if (error) {
        record.code ??= error.code ?? "RUNNER_ERROR";
        record.stderr += String(error);
      }
      finish();
      throw new BoundedCliError(record);
    }
    finish();
    return record;
  }
  return { identity, records, run, abortActive: (code) => abortActive(code ?? "ABORTED") };
}
export function decodeCliRecord(record) {
  let response;
  try {
    response = JSON.parse(record.stdout);
  } catch {
    throw new BoundedCliError({ ...record, code: "INVALID_JSON" });
  }
  if (response?.success !== true)
    throw new BoundedCliError({ ...record, code: "CLI_RESPONSE_FAILURE", cliResponse: response });
  return response.data;
}
