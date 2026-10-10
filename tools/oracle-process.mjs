// Synchronous oracle input uses a regular file: Python can read through EOF
// without depending on the parent's synchronous pipe shutdown behavior.
import { execFileSync as execute, spawnSync as spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, openSync, closeSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function withInput(run, command, args, options = {}) {
  if (options.input === undefined) return run(command, args, options);
  if (options.stdio !== undefined) throw new TypeError("Oracle input owns stdin/stdout/stderr");
  const directory = mkdtempSync(join(tmpdir(), "hwpjs-oracle-"));
  let descriptor;
  try {
    const path = join(directory, "input.json");
    writeFileSync(path, options.input, { mode: 0o600 });
    descriptor = openSync(path, "r");
    const { input, ...rest } = options;
    return run(command, args, { ...rest, stdio: [descriptor, "pipe", "pipe"] });
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    rmSync(directory, { recursive: true, force: true });
  }
}

export const execFileSync = (command, args, options) => withInput(execute, command, args, options);
export const spawnSync = (command, args, options) => withInput(spawn, command, args, options);
