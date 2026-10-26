import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Clipboard is shared by browser sessions: run these cases sequentially.
const origin = new URL(process.argv[2] ?? "http://127.0.0.1:49008").origin;
const dir = resolve(
  "zig-out/verification/clipboard-public-ui",
  `matrix-${new Date().toISOString().replace(/[:.]/g, "-")}`,
);
mkdirSync(dir, { recursive: true });
const results = [];
for (const framework of ["vanilla", "react", "svelte"])
  for (const format of ["hwp", "hwpx"]) {
    const started = Date.now(),
      log = [];
    const child = spawn(
      process.execPath,
      ["tools/editor-native-paste-browser-audit.mjs", origin, framework, format],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (bytes) => {
        log.push(bytes);
        process.stdout.write(bytes);
      });
    const outcome = await new Promise((resolve) => {
      child.once("error", (error) => resolve({ code: null, error: String(error) }));
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    writeFileSync(resolve(dir, `${framework}-${format}.log`), Buffer.concat(log));
    results.push({ framework, format, ...outcome, elapsedMs: Date.now() - started });
    writeFileSync(
      resolve(dir, "summary.json"),
      JSON.stringify({ origin, complete: results.length === 6, results }, null, 2),
    );
  }
if (results.some((result) => result.code !== 0)) process.exitCode = 1;
console.log(
  JSON.stringify({
    dir,
    passed: results.filter((result) => result.code === 0).length,
    total: results.length,
  }),
);
