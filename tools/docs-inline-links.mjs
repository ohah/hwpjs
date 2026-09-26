import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { projectMarkdownInventory, projectRoot } from "./docs-audit-status.mjs";

// Deliberately limited to ordinary inline Markdown destinations. It checks
// the file part, not reference definitions, fragment targets or Markdown code.
export function inlineLocalTargets(markdown) {
  const targets = [];
  for (const match of markdown.matchAll(/\]\(([^)]+)\)/g)) {
    let target = match[1].trim().split("#")[0].replace(/^</, "").replace(/>$/, "");
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) continue;
    try { target = decodeURIComponent(target); } catch { /* A malformed escape stays literal. */ }
    targets.push(target);
  }
  return targets;
}

function main() {
  const inventory = projectMarkdownInventory();
  const paths = [...inventory.tracked, ...inventory.untracked];
  let files = 0, links = 0;
  const missing = [];
  for (const path of paths) {
    const absolute = resolve(projectRoot, path);
    if (!existsSync(absolute)) continue;
    files++;
    for (const target of inlineLocalTargets(readFileSync(absolute, "utf8"))) {
      links++;
      if (!existsSync(resolve(dirname(absolute), target))) missing.push({ path, target });
    }
  }
  process.stdout.write(`${JSON.stringify({ files, links, missing })}\n`);
  if (missing.length) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
