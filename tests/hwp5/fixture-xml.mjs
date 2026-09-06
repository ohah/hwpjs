import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
// Existing MIT ZIP reader, test-only. No product HWPX implementation implied.
export function sectionXml(hwpx) {
  const context = {
    module: { exports: {} },
    require: createRequire(import.meta.url),
    Buffer,
    process,
    console,
  };
  runInNewContext(
    readFileSync(new URL("../../legacy/cfb.js", import.meta.url), "utf8"),
    context,
  );
  const zip = context.module.exports.read(hwpx, { type: "buffer" });
  const index = zip.FullPaths.findIndex((path) =>
    path.endsWith("/Contents/section0.xml"),
  );
  assert.ok(index >= 0);
  return Buffer.from(zip.FileIndex[index].content).toString("utf8");
}
