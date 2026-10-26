// Awaited audits can close a pipe asynchronously; synchronous callers retain
// oracle-process.mjs's regular-file EOF contract. No temporary input files.
import { execFile } from "node:child_process";

export function executeOracle(command, args, options = {}) {
  if (options.stdio !== undefined) throw new TypeError("Oracle input owns stdin/stdout/stderr");
  const { input, ...rest } = options;
  if (input !== undefined && typeof input !== "string" && !(input instanceof Uint8Array))
    throw new TypeError("InvalidOracleInput");
  return new Promise((resolve, reject) => {
    let inputError = null;
    const child = execFile(
      command,
      args,
      { encoding: "buffer", ...rest },
      (error, stdout, stderr) => {
        const failure = error ?? inputError;
        if (failure) {
          failure.stdout = stdout;
          failure.stderr = stderr;
          failure.status = Number.isInteger(error?.code) ? error.code : null;
          failure.signal ??= null;
          reject(failure);
        } else resolve(stdout);
      },
    );
    child.stdin.on("error", (error) => {
      inputError ??= error;
      child.kill("SIGTERM");
    });
    try {
      child.stdin.end(input);
    } catch (error) {
      inputError = error;
      child.kill("SIGTERM");
    }
  });
}
