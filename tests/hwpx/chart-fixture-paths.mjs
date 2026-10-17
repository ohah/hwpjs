import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
function files(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? files(path) : entry.isFile() && path.endsWith(".hwpx") ? [path] : [];
  }).sort();
}
export function referenceChartFixturePaths() {
  const paths = files("reference/rhwp/samples/chart");
  assert.equal(paths.length, 28, "complete explicit reference chart inventory");
  return paths;
}
