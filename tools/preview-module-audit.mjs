// Read-only served-module check; not browser initialization or editing proof.
import { readFileSync } from "node:fs";
import { resolve, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = fileURLToPath(new URL("../", import.meta.url));
const origin = new URL(process.argv[2] ?? "http://127.0.0.1:8080");
if (
  !["http:", "https:"].includes(origin.protocol) ||
  origin.pathname !== "/" ||
  origin.search ||
  origin.hash ||
  origin.username ||
  origin.password
)
  throw new Error("ExpectedBareOrigin");
const files = new Map();
function visit(path) {
  const file = resolve(root, path);
  if (!file.startsWith(root) || !file.endsWith(".mjs")) throw new Error("InvalidModulePath");
  if (files.has(file)) return;
  const bytes = readFileSync(file);
  files.set(file, bytes);
  // Project modules use literal relative imports. No remote code is evaluated.
  const imports = /\b(?:from\s*|import\s*(?:\(\s*)?)["']([^"']+)["']/g;
  for (const match of bytes.toString("utf8").matchAll(imports)) {
    if (match[1].startsWith(".")) visit(resolve(dirname(file), match[1]));
  }
}
visit("web/preview/bootstrap.mjs");
visit("web/preview/app.mjs");
visit("web/preview/reader-worker.mjs");
const entries = [...files];
const failures = [];
let next = 0,
  checked = 0;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
await Promise.all(
  Array.from({ length: 8 }, async () => {
    for (;;) {
      const index = next++;
      if (index >= entries.length) return;
      const [file, expected] = entries[index];
      const path = "/" + relative(root, file).split(sep).join("/");
      try {
        const response = await fetch(new URL(path, origin), {
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        });
        if (response.status !== 200) throw new Error(`HTTP:${response.status}`);
        if (
          !/^(text|application)\/javascript(?:;|$)/i.test(
            response.headers.get("content-type") ?? "",
          )
        )
          throw new Error("UnexpectedModuleMime");
        const actual = Buffer.from(await response.arrayBuffer());
        if (digest(actual) !== digest(expected)) throw new Error("ServedSourceMismatch");
        checked++;
      } catch (error) {
        failures.push({ path, error: error.message });
      }
    }
  }),
);
console.log(
  JSON.stringify({
    origin: origin.origin,
    modules: files.size,
    checked,
    failures,
    scope:
      "literal app/worker module graph; HTTP status, MIME and source hash; not browser or editor proof",
  }),
);
process.exitCode = failures.length ? 1 : 0;
