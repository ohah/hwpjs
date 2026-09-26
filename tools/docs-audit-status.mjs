import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function projectMarkdownInventory() {
  const list = args => execFileSync("git", ["ls-files", ...args, "-z", "--", "*.md", ":!:legacy/**", ":!:reference/**"], { cwd: projectRoot })
    .toString("utf8").split("\0").filter(Boolean);
  return { tracked: list([]), untracked: list(["--others", "--exclude-standard"]) };
}

export function auditDocs(paths, verified, read, untracked = []) {
  const known = new Set(paths);
  const result = { tracked: paths.length, verified_current: [], pending: [], stale: [], missing: [], untracked, invalid_verified: [], unknown_verified: [] };
  for (const path of Object.keys(verified)) if (!known.has(path)) result.unknown_verified.push(path);
  for (const path of paths) {
    const bytes = read(path);
    if (bytes === null) {
      result.missing.push(path);
    } else if (!(path in verified)) {
      result.pending.push(path);
    } else if (!/^[0-9a-f]{64}$/.test(verified[path]?.sha256 ?? "") || typeof verified[path]?.evidence !== "string" || !verified[path].evidence.trim()) {
      result.invalid_verified.push(path);
    } else {
      const actual = createHash("sha256").update(bytes).digest("hex");
      (actual === verified[path].sha256 ? result.verified_current : result.stale).push(path);
    }
  }
  return result;
}

function main() {
  const { tracked, untracked } = projectMarkdownInventory();
  if (!tracked.length) throw new Error("EmptyDocsInventory");
  const manifest = JSON.parse(readFileSync(resolve(projectRoot, "tools/docs-audit-reviewed.json"), "utf8"));
  if (manifest.schema !== 1 || !manifest.verified || typeof manifest.verified !== "object" || Array.isArray(manifest.verified))
    throw new Error("InvalidDocsAuditManifest");
  const result = auditDocs(tracked, manifest.verified, path => {
    const absolute = resolve(projectRoot, path);
    return existsSync(absolute) ? readFileSync(absolute) : null;
  }, untracked);
  const summary = Object.fromEntries(Object.entries(result).map(([key, value]) => [key, Array.isArray(value) ? value.length : value]));
  summary.verified_percent = Number((100 * result.verified_current.length / Math.max(1, result.tracked)).toFixed(2));
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if (process.argv.includes("--list-pending")) process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.unknown_verified.length || result.invalid_verified.length || (process.argv.includes("--require-complete") && (result.verified_current.length !== result.tracked || result.untracked.length)))
    process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
